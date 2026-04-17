import { PercentileBuffer } from "./percentile.js"
import type { Sample, StatsSnapshot } from "./types.js"

/**
 * Stats aggregator. All mutation via `push(sample)`; single-writer discipline
 * (only the onSample callback in bench.ts invokes push). Readable concurrently
 * via `snapshot()` — fields are plain values so a snapshot read is atomic-ish
 * within a single event-loop tick.
 */
export class Stats {
  private readonly latency = new PercentileBuffer(4096)
  private readonly byStatus = new Map<number, number>()
  private readonly byError = new Map<string, number>()
  private _total = 0
  private _success = 0
  private _errors = 0
  private readonly startMs = performance.now()
  private warmupEndMs: number

  constructor(public readonly warmupMs = 0) {
    this.warmupEndMs = this.startMs + warmupMs
  }

  push(sample: Sample): void {
    if (performance.now() < this.warmupEndMs) return
    this._total++
    this.latency.push(sample.duration_ms)
    if (sample.ok) {
      this._success++
      this.byStatus.set(sample.status, (this.byStatus.get(sample.status) ?? 0) + 1)
    } else {
      this._errors++
      this.byError.set(sample.error, (this.byError.get(sample.error) ?? 0) + 1)
    }
  }

  get total(): number { return this._total }
  get success(): number { return this._success }
  get errors(): number { return this._errors }
  get elapsedMs(): number { return performance.now() - this.startMs }

  snapshot(): StatsSnapshot {
    const elapsedMs = this.elapsedMs
    const elapsedSec = elapsedMs / 1_000
    return {
      total: this._total,
      success: this._success,
      errors: this._errors,
      elapsedMs,
      latency: {
        avg: this.latency.mean,
        p50: this.latency.p(0.5),
        p95: this.latency.p(0.95),
        p99: this.latency.p(0.99),
        max: this.latency.max,
        min: this.latency.min,
      },
      byStatus: Object.fromEntries(this.byStatus),
      byError: Object.fromEntries(this.byError),
      throughput: elapsedSec > 0 ? this._total / elapsedSec : 0,
    }
  }
}
