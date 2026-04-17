import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { scope, toResult } from "jolly-coop"
import { runVU } from "../src/vu.js"
import { RateLimiter } from "../src/rate.js"
import type { Sample } from "../src/types.js"

let server: Server
let baseUrl = ""

beforeAll(async () => {
  server = createServer((_req, res) => { res.end("ok") })
  await new Promise<void>(r => server.listen(0, "127.0.0.1", () => r()))
  const addr = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => { await new Promise<void>(r => server.close(() => r())) })

describe("runVU", () => {
  it("URL mode: loop produces samples until signal fires", async () => {
    const samples: Sample[] = []
    const completed = { n: 0 }
    await toResult(scope({ timeout: 400 }, async s => {
      s.spawn(() => runVU({
        index: 0,
        mode: { kind: "url", req: { url: baseUrl, method: "GET", headers: {}, userAgent: "t", timeoutMs: 2000 } },
        signal: s.signal,
        tZero: performance.now(),
        onSample: x => samples.push(x),
        completed,
      }))
    }))
    expect(samples.length).toBeGreaterThan(0)
    expect(samples.filter(x => x.ok).length).toBeGreaterThan(0)
    // At most one tail error sample when scope timeout aborts in-flight fetch.
    expect(samples.filter(x => !x.ok).length).toBeLessThanOrEqual(1)
  })

  it("scenario mode: thrown error is captured as error sample, loop continues", async () => {
    const samples: Sample[] = []
    const completed = { n: 0 }
    let iterations = 0
    await toResult(scope({ timeout: 300 }, async s => {
      s.spawn(() => runVU({
        index: 0,
        mode: {
          kind: "scenario",
          fn: async () => {
            iterations++
            if (iterations % 2 === 0) throw Object.assign(new Error("nope"), { name: "CustomError" })
          },
        },
        signal: s.signal,
        tZero: performance.now(),
        onSample: x => samples.push(x),
        completed,
      }))
    }))
    expect(iterations).toBeGreaterThan(2)
    const errs = samples.filter(x => !x.ok)
    expect(errs.length).toBeGreaterThan(0)
    if (errs[0] && !errs[0].ok) expect(errs[0].error).toBe("CustomError")
  })

  it("rate limiter: observed rps within 10% of target (PLAN §9)", async () => {
    const samples: Sample[] = []
    const completed = { n: 0 }
    const target = 50
    const durationMs = 3_000
    const tZero = performance.now()
    await toResult(scope({ timeout: durationMs }, async s => {
      for (let i = 0; i < 5; i++) {
        s.spawn(() => runVU({
          index: i,
          mode: { kind: "url", req: { url: baseUrl, method: "GET", headers: {}, userAgent: "t", timeoutMs: 1000 } },
          signal: s.signal,
          tZero,
          rateLimiter: new RateLimiter(target),
          onSample: x => samples.push(x),
          completed,
        }))
      }
    }))
    const elapsedSec = (performance.now() - tZero) / 1_000
    const observed = samples.length / elapsedSec
    expect(observed).toBeGreaterThan(target * 0.9)
    expect(observed).toBeLessThan(target * 1.1)
  }, 10_000)
})
