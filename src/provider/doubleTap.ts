/** Two taps within this many ms count as a double-tap. */
export const DOUBLE_TAP_WINDOW_MS = 400;

/**
 * Detects a double-tap from caller-supplied timestamps (pure — no clock,
 * no vscode). Firing resets the detector so a fast third tap starts a new
 * window instead of firing again.
 */
export class DoubleTapDetector {
  private last = -Infinity;

  /** Returns true when this tap lands within the window of the previous one. */
  tap(now: number): boolean {
    const fired = now - this.last <= DOUBLE_TAP_WINDOW_MS;
    this.last = fired ? -Infinity : now;
    return fired;
  }
}
