import { sleep, ScopeCancelledError } from "jolly-coop"
import type { Stats } from "./stats.js"

const REFRESH_MS = 100

/**
 * Stderr progress printer task. Loops until its signal fires; renders a single
 * rewritable status line. Swallows ScopeCancelledError so scope shutdown
 * (done/cancel/timeout) produces clean resolution instead of a spurious reject.
 */
export async function runProgress(stats: Stats, signal: AbortSignal, durationMs: number): Promise<void> {
  const out = process.stderr
  const isTTY = out.isTTY
  try {
    while (!signal.aborted) {
      printLine(stats, durationMs, isTTY)
      await sleep(REFRESH_MS, signal)
    }
  } catch (err) {
    if (!(err instanceof ScopeCancelledError) && !signal.aborted) throw err
  } finally {
    if (isTTY) out.write("\n")
  }
}

function printLine(stats: Stats, durationMs: number, isTTY: boolean): void {
  const elapsedSec = stats.elapsedMs / 1_000
  const totalSec = durationMs / 1_000
  const rps = elapsedSec > 0 ? (stats.total / elapsedSec).toFixed(1) : "0.0"
  const line = `  ${stats.total.toLocaleString()} reqs  ${rps}/s  ${stats.errors} errs  ${elapsedSec.toFixed(1)}/${totalSec.toFixed(1)}s`
  if (isTTY) process.stderr.write(`\r${line.padEnd(72)}`)
  else process.stderr.write(line + "\n")
}
