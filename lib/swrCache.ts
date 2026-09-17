// Shared stale-while-revalidate cache for API payloads.
//
// Same pattern as the analytics route and warContext: serve the fresh value
// instantly, refresh in the background once it ages past `freshMs`, and keep
// serving the stale value (up to `staleMs`) while a refresh is in flight or
// has failed. Cold builds are deduplicated so a burst of concurrent requests
// triggers exactly one pipeline run.
//
// Keys MUST be scoped so that every request sharing a key is entitled to see
// exactly the same payload: clan-level data keyed by battle/section, or
// per-user data keyed by user id (e.g. the unread-count badge).

type Entry = {
  value: unknown;
  builtAt: number;
  refresh?: Promise<void>;
};

// Generous bound for a 65-member clan (per-user badge keys + per-battle
// report keys). This is a cache — correctness never depends on survival.
const MAX_ENTRIES = 500;

const entries = new Map<string, Entry>();
const coldBuilds = new Map<string, Promise<unknown>>();

function evictIfNeeded(): void {
  if (entries.size <= MAX_ENTRIES) return;
  // Drop the oldest-built half; everything dropped simply rebuilds on demand.
  const byAge = [...entries.entries()].sort((a, b) => a[1].builtAt - b[1].builtAt);
  for (const [key] of byAge.slice(0, Math.floor(byAge.length / 2))) {
    entries.delete(key);
    coldBuilds.delete(key);
  }
}

/**
 * Get a cached value, refreshing in the background when it goes stale.
 *
 * - age < freshMs            → serve instantly, no work
 * - freshMs ≤ age < staleMs  → serve the stale value, one background refresh
 * - age ≥ staleMs (or cold)  → build inline, deduplicated across concurrent
 *                              callers; a failed build degrades to the last
 *                              known value when one exists - only a cold key
 *                              with nothing to serve rejects
 */
export async function swrCached<T>(
  key: string,
  freshMs: number,
  staleMs: number,
  build: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = entries.get(key);

  if (entry) {
    const age = now - entry.builtAt;

    if (age < freshMs) {
      return entry.value as T;
    }

    if (age < staleMs) {
      // Stale but serviceable: refresh once in the background, serve the old
      // value to everyone meanwhile.
      if (!entry.refresh) {
        entry.refresh = build()
          .then((value) => {
            entries.set(key, { value, builtAt: Date.now() });
          })
          .catch((err: unknown) => {
            // Keep serving the stale value. The next request past staleMs
            // retries the build inline, which itself degrades to the last
            // known value if that rebuild also fails.
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[swr-cache] background refresh failed for ${key}: ${message}`);
          })
          .finally(() => {
            const current = entries.get(key);
            if (current) current.refresh = undefined;
          });
      }
      return entry.value as T;
    }

    // Past staleMs: too old for the soft-serve window. The entry is kept
    // (not deleted) so a failed rebuild below can still degrade to it.
  }

  // Cold (or expired) build, deduplicated across concurrent requests.
  const inFlight = coldBuilds.get(key);
  if (inFlight) return inFlight as Promise<T>;

  const previous = entries.get(key);
  const built = build()
    .then((value) => {
      entries.set(key, { value, builtAt: Date.now() });
      evictIfNeeded();
      return value;
    })
    .catch((err: unknown) => {
      // Pooler-episode guard: degrade to the last known payload (however old)
      // rather than failing the request. Only a genuinely cold key rejects.
      if (previous) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[swr-cache] inline rebuild failed for ${key}, serving last known: ${message}`
        );
        return previous.value as T;
      }
      throw err;
    });
  coldBuilds.set(key, built);
  // Swallow the rejection of the finally-derived promise: a failed cold build
  // must reject to the awaiting caller (or degrade to the last known value),
  // not also raise an unhandled promise rejection that can kill the isolate.
  built
    .finally(() => {
      coldBuilds.delete(key);
    })
    .catch(() => {});
  return built;
}

/**
 * Invalidate cached entries whose key starts with `prefix` (e.g. after a
 * write that should be visible immediately). Cheap and always safe.
 */
export function invalidateSwrCache(prefix: string): void {
  for (const key of [...entries.keys()]) {
    if (key.startsWith(prefix)) {
      entries.delete(key);
      coldBuilds.delete(key);
    }
  }
}
