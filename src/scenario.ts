import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
import type { ScenarioFn } from "./types.js"

/**
 * Dynamic-import a user scenario module. Validates that the default export is
 * an async function. Returns the function or throws with a helpful message.
 *
 * Windows note: dynamic `import()` rejects bare absolute paths on Windows —
 * must be converted to a `file://` URL via pathToFileURL.
 */
export async function loadScenario(path: string): Promise<ScenarioFn> {
  const abs = resolve(path)
  const url = pathToFileURL(abs).href
  let mod: Record<string, unknown>
  try {
    mod = await import(url)
  } catch (err) {
    const message = (err as Error)?.message ?? String(err)
    throw new Error(`failed to import scenario ${path}: ${message}`)
  }
  const fn = mod.default
  if (typeof fn !== "function") {
    throw new Error(`scenario ${path}: default export must be a function, got ${typeof fn}`)
  }
  if (fn.length !== 2) {
    process.stderr.write(
      `warn: scenario ${path}: default export takes ${fn.length} args (expected 2: user, signal)\n`,
    )
  }
  return fn as ScenarioFn
}
