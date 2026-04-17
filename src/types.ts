export type Sample = SampleSuccess | SampleError

export interface SampleSuccess {
  ok: true
  t: number
  vu: number
  duration_ms: number
  status: number
  size: number
  ts: string
}

export interface SampleError {
  ok: false
  t: number
  vu: number
  duration_ms: number
  error: string
  message: string
  ts: string
}

export type ScenarioFn = (user: UserContext, signal: AbortSignal) => Promise<void>

export interface UserContext {
  index: number
  iteration: number
}

export type EndedBy = "drained" | "abort" | "error"

export interface BenchOptions {
  url?: string
  scenarioPath?: string
  scenario?: ScenarioFn
  concurrency: number
  durationMs: number
  rps?: number
  perRequestTimeoutMs: number
  method: string
  headers: Record<string, string>
  body?: string
  userAgent: string
  outPath?: string
  warmupMs: number
  signal?: AbortSignal
}

export interface StatsSnapshot {
  total: number
  success: number
  errors: number
  elapsedMs: number
  latency: {
    avg: number
    p50: number
    p95: number
    p99: number
    max: number
    min: number
  }
  byStatus: Record<number, number>
  byError: Record<string, number>
  throughput: number
}

export interface BenchResult {
  endedBy: EndedBy
  snapshot: StatsSnapshot
  target: { url?: string; scenarioPath?: string }
  concurrency: number
  durationMs: number
  targetRps?: number
  achievedRps: number
  failure?: unknown
}
