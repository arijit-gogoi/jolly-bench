import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { runBench } from "../src/bench.js"
import type { BenchOptions } from "../src/types.js"

let server: Server
let baseUrl = ""
let failServer: Server
let failUrl = ""

beforeAll(async () => {
  server = createServer((_req, res) => { res.end("ok") })
  await new Promise<void>(r => server.listen(0, "127.0.0.1", () => r()))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  failServer = createServer((_req, res) => { res.statusCode = 500; res.end("boom") })
  await new Promise<void>(r => failServer.listen(0, "127.0.0.1", () => r()))
  failUrl = `http://127.0.0.1:${(failServer.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()))
  await new Promise<void>(r => failServer.close(() => r()))
})

function baseOpts(extra: Partial<BenchOptions> = {}): BenchOptions {
  return {
    url: baseUrl,
    concurrency: 5,
    durationMs: 800,
    perRequestTimeoutMs: 2_000,
    method: "GET",
    headers: {},
    userAgent: "jolly-bench-test",
    warmupMs: 0,
    ...extra,
  }
}

describe("runBench", () => {
  it("short run, endedBy drained, mostly success", async () => {
    const r = await runBench(baseOpts(), false)
    expect(r.endedBy).toBe("drained")
    expect(r.snapshot.total).toBeGreaterThan(0)
    // At most `concurrency` tail error samples from in-flight fetches aborted at deadline.
    expect(r.snapshot.success).toBeGreaterThan(r.snapshot.total * 0.9)
    expect(r.snapshot.errors).toBeLessThanOrEqual(r.concurrency)
    expect(r.snapshot.byStatus[200]).toBe(r.snapshot.success)
  }, 5_000)

  it("500 target: errors counted as status 500 (not error samples)", async () => {
    const r = await runBench(baseOpts({ url: failUrl, durationMs: 500 }), false)
    expect(r.snapshot.total).toBeGreaterThan(0)
    // 500s dominate; at most one tail error sample per VU when deadline aborts in-flight fetches.
    const status500 = r.snapshot.byStatus[500] ?? 0
    expect(status500).toBeGreaterThan(r.snapshot.total * 0.9)
    expect(r.snapshot.errors).toBeLessThanOrEqual(r.concurrency)
  }, 5_000)

  it("external abort → endedBy abort, partial snapshot still returned", async () => {
    const ac = new AbortController()
    setTimeout(() => ac.abort(new Error("test-abort")), 150)
    const r = await runBench(baseOpts({ durationMs: 5_000, signal: ac.signal }), false)
    expect(r.endedBy).toBe("abort")
    expect(r.snapshot.total).toBeGreaterThan(0)
  }, 10_000)

  it("scenario that throws does not kill siblings; scope still drains", async () => {
    let flipped = 0
    const r = await runBench(baseOpts({
      url: undefined,
      scenario: async () => {
        flipped++
        if (flipped % 3 === 0) throw new Error("expected")
      },
      durationMs: 400,
    }), false)
    expect(r.endedBy).toBe("drained")
    expect(r.snapshot.total).toBeGreaterThan(0)
    expect(r.snapshot.errors).toBeGreaterThan(0)
    expect(r.snapshot.success).toBeGreaterThan(0)
  }, 5_000)

  it("rps target roughly achieved", async () => {
    const r = await runBench(baseOpts({ concurrency: 10, rps: 100, durationMs: 1_000 }), false)
    expect(r.endedBy).toBe("drained")
    expect(r.achievedRps).toBeGreaterThan(50)
    expect(r.achievedRps).toBeLessThan(150)
  }, 5_000)
})
