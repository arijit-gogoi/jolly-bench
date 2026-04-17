import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { fetchOnce } from "../src/request.js"
import { createServer, type Server } from "node:http"
import { AddressInfo } from "node:net"

let server: Server
let baseUrl = ""

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x")
    if (url.pathname === "/slow") {
      setTimeout(() => { res.statusCode = 200; res.end("slow") }, 1_000)
      return
    }
    if (url.pathname === "/fail") { res.statusCode = 500; res.end("nope"); return }
    res.statusCode = 200; res.end("hello world")
  })
  await new Promise<void>(res => server.listen(0, "127.0.0.1", () => res()))
  const addr = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await new Promise<void>(res => server.close(() => res()))
})

const baseOpts = (url: string, timeoutMs = 5_000) => ({
  url, method: "GET", headers: {}, userAgent: "jolly-bench-test", timeoutMs,
})

describe("fetchOnce", () => {
  it("200 response → success sample", async () => {
    const ac = new AbortController()
    const s = await fetchOnce(baseOpts(baseUrl + "/"), ac.signal, 0, performance.now())
    expect(s.ok).toBe(true)
    if (s.ok) {
      expect(s.status).toBe(200)
      expect(s.size).toBe("hello world".length)
      expect(s.duration_ms).toBeGreaterThan(0)
    }
  })

  it("500 response → success sample with status 500 (HTTP errors are not fetch errors)", async () => {
    const ac = new AbortController()
    const s = await fetchOnce(baseOpts(baseUrl + "/fail"), ac.signal, 0, performance.now())
    expect(s.ok).toBe(true)
    if (s.ok) expect(s.status).toBe(500)
  })

  it("connection refused → error sample", async () => {
    const ac = new AbortController()
    const s = await fetchOnce(baseOpts("http://127.0.0.1:1"), ac.signal, 0, performance.now())
    expect(s.ok).toBe(false)
  })

  it("per-request timeout → TimeoutError sample", async () => {
    const ac = new AbortController()
    const s = await fetchOnce(baseOpts(baseUrl + "/slow", 100), ac.signal, 0, performance.now())
    expect(s.ok).toBe(false)
    if (!s.ok) expect(s.error).toBe("TimeoutError")
  })

  it("parent signal abort mid-request → AbortError sample", async () => {
    const ac = new AbortController()
    const p = fetchOnce(baseOpts(baseUrl + "/slow"), ac.signal, 0, performance.now())
    setTimeout(() => ac.abort(), 50)
    const s = await p
    expect(s.ok).toBe(false)
    if (!s.ok) expect(s.error).toBe("AbortError")
  })
})
