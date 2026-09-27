/**
 * Run a promise under a wall-clock deadline (27 Sep 2026, "sign-out stuck
 * on 'Signing out devices…'" post-mortem).
 *
 * The shared pool in lib/db.ts retries transient failures up to 6 times with
 * backoff — ~90s worst case. That ladder is RIGHT for page loads and logins
 * (slow-but-true beats a 503, documented there). It is WRONG for an
 * interactive button: a click must come back with an answer, even when the
 * pooler is mid-storm — and an honest "didn't finish, try again" beats a
 * spinner forever.
 *
 * Semantics:
 *  - resolve   -> { ok: true, value }
 *  - reject    -> { ok: false, timedOut: false, error }   (NEVER re-throws)
 *  - still pending at capMs -> { ok: false, timedOut: true }
 * The wrapped promise keeps running after a timeout, and its late outcome is
 * SWALLOWED on purpose: no unhandledRejection can crash the isolate, and
 * every statement callers run through here is idempotent (UPDATE ... WHERE
 * revoked_at IS NULL), so a late landing is either fine or harmlessly lost
 * when the platform freezes the function.
 */

export type DeadlineResult<T> =
  | { ok: true; value: T }
  | { ok: false; timedOut: true }
  | { ok: false; timedOut: false; error: unknown };

export async function withDeadline<T>(
  work: Promise<T>,
  capMs: number
): Promise<DeadlineResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<DeadlineResult<T>>([
      work.then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, timedOut: false as const, error })
      ),
      new Promise<DeadlineResult<T>>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, timedOut: true }), capMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Same cap, clamped, env-overridable (MCWV_KICK_CAP_MS) for sims and ops. */
export function kickCapMs(): number {
  const raw = Number(process.env.MCWV_KICK_CAP_MS);
  return Number.isFinite(raw) && raw >= 500 ? raw : 10_000;
}
