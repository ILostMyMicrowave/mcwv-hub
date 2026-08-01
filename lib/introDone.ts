/**
 * Shared helpers for the MCWV boot intro.
 *
 * The BootIntroGate marks the intro as done (window flag + event) once it
 * finishes/skips — or immediately when it doesn't need to play at all.
 * Popups like WarReturnRecap / OnboardingTour listen for the event so they
 * never appear *behind* the intro overlay.
 */

export const INTRO_SESSION_KEY = "mcwv_intro_seen_v1";
export const INTRO_DONE_EVENT = "mcwv:intro-done";

export function mcwvIntroIsDone(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { __mcwvIntroDone?: boolean }).__mcwvIntroDone);
}

export function markIntroDone(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __mcwvIntroDone?: boolean };
  if (w.__mcwvIntroDone) return;
  w.__mcwvIntroDone = true;
  window.dispatchEvent(new Event(INTRO_DONE_EVENT));
}
