import { describe, it, expect } from "vitest"
import { RateLimiter } from "../src/rate.js"

describe("RateLimiter", () => {
  it("behind target: delay 0", () => {
    const r = new RateLimiter(100)
    expect(r.nextDelayMs(50, 500)).toBe(0)
  })

  it("on target: small delay", () => {
    const r = new RateLimiter(100)
    // Completed 100, elapsed 500ms, next is index 100 → target 1000ms → delay 500ms.
    expect(r.nextDelayMs(100, 500)).toBe(500)
  })

  it("ahead of target: positive delay", () => {
    const r = new RateLimiter(100)
    // Completed 200, elapsed 500ms, next index 200 → target 2000ms → delay 1500ms.
    expect(r.nextDelayMs(200, 500)).toBe(1500)
  })

  it("rejects non-positive rps", () => {
    expect(() => new RateLimiter(0)).toThrow()
    expect(() => new RateLimiter(-1)).toThrow()
  })
})
