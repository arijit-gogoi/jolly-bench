import { describe, it, expect } from "vitest"
import { parseDuration } from "../src/time.js"

describe("parseDuration", () => {
  it("parses ms", () => { expect(parseDuration("500ms")).toBe(500) })
  it("parses seconds", () => { expect(parseDuration("30s")).toBe(30_000) })
  it("parses minutes", () => { expect(parseDuration("2m")).toBe(120_000) })
  it("parses hours", () => { expect(parseDuration("1h")).toBe(3_600_000) })
  it("parses fractional", () => { expect(parseDuration("1.5s")).toBe(1_500) })
  it("throws on junk", () => { expect(() => parseDuration("abc")).toThrow(/invalid duration/) })
  it("throws on empty", () => { expect(() => parseDuration("")).toThrow(/invalid duration/) })
  it("throws on missing unit", () => { expect(() => parseDuration("30")).toThrow(/invalid duration/) })
  it("throws on unknown unit", () => { expect(() => parseDuration("30x")).toThrow(/invalid duration/) })
})
