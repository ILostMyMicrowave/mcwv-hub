/**
 * v1 "sign out everywhere": the pure decision. Zero imports on purpose so it
 * is unit-testable exactly as it runs.
 *
 * A session survives unless the user has revoked and THIS session predates
 * the revocation cutoff. Two carve-outs:
 *  - revokedAt === null           → never revoked yet.
 *  - session.graceTs === revokedAt → the device that performed the revocation
 *    (re-saved with the cutoff as a token) — stays signed in.
 *  - createdAt === revokedAt       → a login issued in the SAME second as a
 *    revoke survives (floor-seconds granularity; err in favour of the fresher
 *    credential — a stolen cookie can't manufacture a newer createdAt without
 *    the password).
 */
export function sessionSurvivesVerification(
  createdAt: number | undefined,
  graceTs: number | undefined,
  revokedAt: number | null
): boolean {
  if (revokedAt === null) return true;
  if (graceTs === revokedAt) return true;
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return false;
  return createdAt >= revokedAt;
}

/** Cache entry shape shared by the wrapper (kept pure here for testability). */
export type RevokedAtEntry = { revoked: number | null; at: number };

export function pickFreshRevokedAt(
  entry: RevokedAtEntry | undefined,
  now: number,
  ttlMs: number
): number | null | "stale" {
  if (entry && now - entry.at < ttlMs) return entry.revoked;
  return "stale";
}
