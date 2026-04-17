/**
 * Sorted-buffer percentile calculator. Insert is O(log n) via binary search
 * + O(n) shift; acceptable up to ~100k samples for v0.1. Upgrade to t-digest later.
 */
export class PercentileBuffer {
  private buf: Float64Array
  private len = 0

  constructor(initialCapacity = 1024) {
    this.buf = new Float64Array(initialCapacity)
  }

  get count(): number { return this.len }
  get min(): number { return this.len === 0 ? NaN : this.buf[0] }
  get max(): number { return this.len === 0 ? NaN : this.buf[this.len - 1] }

  get mean(): number {
    if (this.len === 0) return NaN
    let sum = 0
    for (let i = 0; i < this.len; i++) sum += this.buf[i]
    return sum / this.len
  }

  push(value: number): void {
    if (this.len === this.buf.length) this.grow()
    const idx = this.searchInsertIndex(value)
    this.buf.copyWithin(idx + 1, idx, this.len)
    this.buf[idx] = value
    this.len++
  }

  /** p in [0, 1] — e.g. 0.95 for p95. Uses nearest-rank. */
  p(q: number): number {
    if (this.len === 0) return NaN
    if (q <= 0) return this.buf[0]
    if (q >= 1) return this.buf[this.len - 1]
    const rank = Math.ceil(q * this.len) - 1
    return this.buf[Math.max(0, Math.min(this.len - 1, rank))]
  }

  private grow(): void {
    const next = new Float64Array(this.buf.length * 2)
    next.set(this.buf)
    this.buf = next
  }

  private searchInsertIndex(value: number): number {
    let lo = 0, hi = this.len
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.buf[mid] <= value) lo = mid + 1
      else hi = mid
    }
    return lo
  }
}
