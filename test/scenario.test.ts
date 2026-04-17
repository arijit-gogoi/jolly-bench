import { describe, it, expect } from "vitest"
import { loadScenario } from "../src/scenario.js"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

function tmp(contents: string, ext = ".mjs"): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "jolly-bench-scn-"))
  const path = join(dir, `scenario${ext}`)
  writeFileSync(path, contents, "utf8")
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe("loadScenario", () => {
  it("loads a valid module and returns a function", async () => {
    const { path, cleanup } = tmp("export default async function(user, signal) { return 1 }")
    try {
      const fn = await loadScenario(path)
      expect(typeof fn).toBe("function")
      expect(fn.length).toBe(2)
    } finally { cleanup() }
  })

  it("throws when default export missing", async () => {
    const { path, cleanup } = tmp("export const other = 1")
    try {
      await expect(loadScenario(path)).rejects.toThrow(/default export must be a function/)
    } finally { cleanup() }
  })

  it("throws when default is not a function", async () => {
    const { path, cleanup } = tmp("export default 42")
    try {
      await expect(loadScenario(path)).rejects.toThrow(/must be a function/)
    } finally { cleanup() }
  })

  it("warns but succeeds on arity mismatch", async () => {
    const { path, cleanup } = tmp("export default async function(user) { return 1 }")
    try {
      const fn = await loadScenario(path)
      expect(typeof fn).toBe("function")
    } finally { cleanup() }
  })

  it("throws on import failure", async () => {
    await expect(loadScenario("/nonexistent/path/scenario.mjs"))
      .rejects.toThrow(/failed to import scenario/)
  })
})
