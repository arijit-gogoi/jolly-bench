import { sleep, yieldNow, ScopeCancelledError } from "jolly-coop"
import { fetchOnce, type RequestOpts } from "./request.js"
import type { RateLimiter } from "./rate.js"
import type { Sample, ScenarioFn } from "./types.js"

export type VuMode =
  | { kind: "url"; req: RequestOpts }
  | { kind: "scenario"; fn: ScenarioFn }

export interface VuCtx {
  index: number
  mode: VuMode
  signal: AbortSignal
  tZero: number
  rateLimiter?: RateLimiter
  onSample: (s: Sample) => void
  /** Shared counter (same array reference across all VUs) used by the rate limiter. */
  completed: { n: number }
}

/**
 * Virtual user loop. Runs until signal aborts. Each iteration produces exactly
 * one Sample via onSample. URL mode uses fetchOnce (error-as-value). Scenario
 * mode invokes the user function and synthesizes a Sample — success records
 * wall-clock duration, thrown errors become error Samples.
 *
 * Never propagates errors to the parent scope — that's the load-tester
 * contract: individual request failures must never cancel the run.
 */
export async function runVU(ctx: VuCtx): Promise<void> {
  let iteration = 0
  try {
    while (!ctx.signal.aborted) {
      const sample = await oneIteration(ctx, iteration++)
      if (sample) {
        ctx.onSample(sample)
        ctx.completed.n++
      }
      if (ctx.rateLimiter && !ctx.signal.aborted) {
        const delay = ctx.rateLimiter.nextDelayMs(
          ctx.completed.n,
          performance.now() - ctx.tZero,
        )
        if (delay > 0) await sleep(delay, ctx.signal)
        else await yieldNow(ctx.signal)
      } else {
        await yieldNow(ctx.signal)
      }
    }
  } catch (err) {
    if (err instanceof ScopeCancelledError) return
    if (ctx.signal.aborted) return
    throw err
  }
}

async function oneIteration(ctx: VuCtx, iteration: number): Promise<Sample | undefined> {
  if (ctx.mode.kind === "url") {
    return fetchOnce(ctx.mode.req, ctx.signal, ctx.index, ctx.tZero)
  }
  const t = (performance.now() - ctx.tZero) / 1_000
  const started = performance.now()
  const ts = new Date().toISOString()
  try {
    await ctx.mode.fn({ index: ctx.index, iteration }, ctx.signal)
    return {
      ok: true,
      t,
      vu: ctx.index,
      duration_ms: performance.now() - started,
      status: 0,
      size: 0,
      ts,
    }
  } catch (err) {
    if (ctx.signal.aborted) return undefined
    const e = err as { name?: string; message?: string }
    return {
      ok: false,
      t,
      vu: ctx.index,
      duration_ms: performance.now() - started,
      error: e?.name ?? "Error",
      message: e?.message ?? String(err),
      ts,
    }
  }
}
