export const VERSION = "0.1.0"

export { runBench } from "./bench.js"
export { parseDuration, formatMs } from "./time.js"
export { formatSummary } from "./summary.js"
export { Stats } from "./stats.js"
export { PercentileBuffer } from "./percentile.js"
export { RateLimiter } from "./rate.js"
export type {
  Sample,
  SampleSuccess,
  SampleError,
  ScenarioFn,
  UserContext,
  BenchOptions,
  BenchResult,
  StatsSnapshot,
  EndedBy,
} from "./types.js"
