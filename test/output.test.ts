import { describe, it, expect } from "vitest"
import { createSampleWriter } from "../src/output.js"
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("createSampleWriter", () => {
  it("no path → no-op writer, no file created", async () => {
    const w = await createSampleWriter(undefined)
    w.write({ ok: true, t: 0, vu: 0, duration_ms: 1, status: 200, size: 0, ts: "x" })
    await w.close()
  })

  it("with path → NDJSON one record per write, clean close", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jolly-bench-"))
    const file = join(dir, "samples.ndjson")
    try {
      const w = await createSampleWriter(file)
      w.write({ ok: true, t: 0.1, vu: 0, duration_ms: 12.3, status: 200, size: 5, ts: "2026-01-01T00:00:00.000Z" })
      w.write({ ok: false, t: 0.2, vu: 1, duration_ms: 42.0, error: "TimeoutError", message: "x", ts: "2026-01-01T00:00:00.100Z" })
      await w.close()
      expect(existsSync(file)).toBe(true)
      const lines = readFileSync(file, "utf8").trim().split("\n")
      expect(lines).toHaveLength(2)
      const a = JSON.parse(lines[0])
      const b = JSON.parse(lines[1])
      expect(a.ok).toBe(true)
      expect(a.status).toBe(200)
      expect(b.ok).toBe(false)
      expect(b.error).toBe("TimeoutError")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
