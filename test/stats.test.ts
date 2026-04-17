import { describe, it, expect } from "vitest"
import { Stats } from "../src/stats.js"
import type { Sample } from "../src/types.js"

function ok(ms: number, status = 200, vu = 0): Sample {
  return { ok: true, t: 0, vu, duration_ms: ms, status, size: 1, ts: new Date().toISOString() }
}
function err(ms: number, name: string, vu = 0): Sample {
  return { ok: false, t: 0, vu, duration_ms: ms, error: name, message: "", ts: new Date().toISOString() }
}

describe("Stats", () => {
  it("accumulates 1000 success samples with sane percentiles", () => {
    const s = new Stats()
    for (let i = 1; i <= 1000; i++) s.push(ok(i))
    const snap = s.snapshot()
    expect(snap.total).toBe(1000)
    expect(snap.success).toBe(1000)
    expect(snap.errors).toBe(0)
    expect(snap.latency.p50).toBeGreaterThanOrEqual(499)
    expect(snap.latency.p50).toBeLessThanOrEqual(501)
    expect(snap.latency.p95).toBeGreaterThanOrEqual(949)
    expect(snap.latency.p99).toBeGreaterThanOrEqual(989)
  })

  it("splits success and error totals", () => {
    const s = new Stats()
    s.push(ok(10)); s.push(ok(20)); s.push(err(30, "TimeoutError"))
    const snap = s.snapshot()
    expect(snap.total).toBe(3)
    expect(snap.success).toBe(2)
    expect(snap.errors).toBe(1)
  })

  it("buckets statuses", () => {
    const s = new Stats()
    s.push(ok(5, 200)); s.push(ok(5, 200)); s.push(ok(5, 500))
    expect(s.snapshot().byStatus).toEqual({ 200: 2, 500: 1 })
  })

  it("buckets error names", () => {
    const s = new Stats()
    s.push(err(5, "TimeoutError")); s.push(err(5, "TimeoutError")); s.push(err(5, "NetworkError"))
    expect(s.snapshot().byError).toEqual({ TimeoutError: 2, NetworkError: 1 })
  })
})
