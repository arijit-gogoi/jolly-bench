import { describe, it, expect } from "vitest"
import { PercentileBuffer } from "../src/percentile.js"

describe("PercentileBuffer", () => {
  it("empty buffer: count 0, percentile NaN", () => {
    const b = new PercentileBuffer()
    expect(b.count).toBe(0)
    expect(b.p(0.5)).toBeNaN()
    expect(b.mean).toBeNaN()
  })

  it("single value: all percentiles equal that value", () => {
    const b = new PercentileBuffer()
    b.push(42)
    expect(b.p(0.5)).toBe(42)
    expect(b.p(0.99)).toBe(42)
    expect(b.min).toBe(42)
    expect(b.max).toBe(42)
    expect(b.mean).toBe(42)
  })

  it("uniform [1..100]: p50 ~ 50, p99 ~ 99", () => {
    const b = new PercentileBuffer()
    for (let i = 1; i <= 100; i++) b.push(i)
    expect(b.count).toBe(100)
    expect(b.p(0.5)).toBeGreaterThanOrEqual(49)
    expect(b.p(0.5)).toBeLessThanOrEqual(51)
    expect(b.p(0.99)).toBe(99)
    expect(b.min).toBe(1)
    expect(b.max).toBe(100)
    expect(b.mean).toBeCloseTo(50.5, 4)
  })

  it("random inserts remain sorted", () => {
    const b = new PercentileBuffer(8)
    const raw: number[] = []
    for (let i = 0; i < 500; i++) {
      const v = Math.random() * 1000
      b.push(v)
      raw.push(v)
    }
    raw.sort((a, c) => a - c)
    expect(b.count).toBe(500)
    expect(b.min).toBe(raw[0])
    expect(b.max).toBe(raw[raw.length - 1])
    expect(b.p(0.5)).toBe(raw[Math.ceil(0.5 * 500) - 1])
  })

  it("grows past initial capacity", () => {
    const b = new PercentileBuffer(4)
    for (let i = 0; i < 50; i++) b.push(i)
    expect(b.count).toBe(50)
    expect(b.max).toBe(49)
  })
})
