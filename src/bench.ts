import { scope, ScopeCancelledError, ScopeDoneSignal, TimeoutError } from "jolly-coop"
import { Stats } from "./stats.js"
import { runProgress } from "./progress.js"
import { runVU, type VuMode } from "./vu.js"
import { RateLimiter } from "./rate.js"
import { createSampleWriter } from "./output.js"
import { loadScenario } from "./scenario.js"
import type { BenchOptions, BenchResult, EndedBy, Sample } from "./types.js"

/**
 * Root orchestrator. Builds the scope tree from CLAUDE.md § Architecture:
 *
 *   scope({ deadline, signal: externalAbort })
 *   ├── resource: sample writer
 *   ├── spawn: progress printer
 *   └── spawn: driver
 *       └── scope({ limit, signal: parent.signal })
 *           ├── spawn: VU 1
 *           └── ... VU N
 *
 * Stats lives OUTSIDE the scope so partial results survive Ctrl-C / abort —
 * that's the whole reason a load tester is useful when things go wrong.
 *
 * On scope exit:
 *   - deadline elapsed → TimeoutError → endedBy "drained"
 *   - parent signal aborted → endedBy "abort"
 *   - any other throw → endedBy "error"
 */
export async function runBench(opts: BenchOptions, progress = true): Promise<BenchResult> {
  if (!opts.url && !opts.scenario && !opts.scenarioPath) {
    throw new Error("runBench: one of { url, scenario, scenarioPath } is required")
  }

  const stats = new Stats(opts.warmupMs)
  const tZero = performance.now()
  const deadline = Date.now() + opts.durationMs
  const completed = { n: 0 }
  const rateLimiter = opts.rps !== undefined ? new RateLimiter(opts.rps) : undefined

  let endedBy: EndedBy = "drained"
  let failure: unknown

  const scenario = opts.scenario ?? (opts.scenarioPath ? await loadScenario(opts.scenarioPath) : undefined)
  const mode: VuMode = scenario
    ? { kind: "scenario", fn: scenario }
    : {
        kind: "url",
        req: {
          url: opts.url!,
          method: opts.method,
          headers: opts.headers,
          body: opts.body,
          userAgent: opts.userAgent,
          timeoutMs: opts.perRequestTimeoutMs,
        },
      }

  try {
    await scope({ deadline, signal: opts.signal }, async root => {
      const writer = await root.resource(
        createSampleWriter(opts.outPath),
        w => w.close(),
      )

      const onSample = (s: Sample) => {
        stats.push(s)
        writer.write(s)
      }

      if (progress) {
        root.spawn(() => runProgress(stats, root.signal, opts.durationMs))
      }

      await scope({ limit: opts.concurrency, signal: root.signal }, async pool => {
        for (let i = 0; i < opts.concurrency; i++) {
          pool.spawn(() => runVU({
            index: i,
            mode,
            signal: pool.signal,
            tZero,
            rateLimiter,
            onSample,
            completed,
          }))
        }
      })
      root.done()
    })
  } catch (err) {
    if (err instanceof TimeoutError) {
      endedBy = "drained"
    } else if (err instanceof ScopeDoneSignal || err instanceof ScopeCancelledError) {
      endedBy = "drained"
    } else if (opts.signal?.aborted) {
      endedBy = "abort"
    } else {
      endedBy = "error"
      failure = err
    }
  }

  if (opts.signal?.aborted && endedBy !== "error") endedBy = "abort"

  const snapshot = stats.snapshot()
  const achievedRps = snapshot.elapsedMs > 0 ? (snapshot.total / snapshot.elapsedMs) * 1_000 : 0
  return {
    endedBy,
    snapshot,
    target: { url: opts.url, scenarioPath: opts.scenarioPath },
    concurrency: opts.concurrency,
    durationMs: opts.durationMs,
    targetRps: opts.rps,
    achievedRps,
    failure,
  }
}
