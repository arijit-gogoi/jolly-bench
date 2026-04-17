/**
 * Global RPS throttle. Given the total count of completed requests across all VUs
 * and elapsed wall time, computes how long the current VU should sleep before
 * firing the next request, such that the aggregate rate converges on `targetRps`.
 *
 * Uses actual-elapsed accounting (not nominal intervals) so the system catches up
 * when a stall occurs rather than silently falling behind.
 */
export class RateLimiter {
  constructor(public readonly targetRps: number) {
    if (!(targetRps > 0)) throw new Error("targetRps must be > 0")
  }

  /** Milliseconds to sleep before firing the next request. 0 if behind target. */
  nextDelayMs(completedSoFar: number, elapsedMs: number): number {
    const nextIndex = completedSoFar
    const targetMs = (nextIndex * 1_000) / this.targetRps
    const delay = targetMs - elapsedMs
    return delay > 0 ? delay : 0
  }
}
