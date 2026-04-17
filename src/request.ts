import type { Sample } from "./types.js"

export interface RequestOpts {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
  userAgent: string
  timeoutMs: number
}

/**
 * Single HTTP request, returns a Sample. Never throws — all failure modes
 * (network, timeout, abort) are recorded as error samples. This is the
 * "error-as-value" contract that keeps a VU's loop running past transient
 * failures, per CLAUDE.md § Jolly rules.
 *
 * Per-request timeout is composed with the parent abort signal via
 * AbortSignal.any — cheaper than a nested scope per request at high RPS.
 */
export async function fetchOnce(
  opts: RequestOpts,
  parentSignal: AbortSignal,
  vu: number,
  tZero: number,
): Promise<Sample> {
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(opts.timeoutMs)])
  const headers: Record<string, string> = {
    "user-agent": opts.userAgent,
    ...opts.headers,
  }
  const t = (performance.now() - tZero) / 1_000
  const started = performance.now()
  const ts = new Date().toISOString()
  try {
    const res = await fetch(opts.url, {
      method: opts.method,
      headers,
      body: opts.body,
      signal,
    })
    const buf = await res.arrayBuffer()
    const duration_ms = performance.now() - started
    return {
      ok: true,
      t,
      vu,
      duration_ms,
      status: res.status,
      size: buf.byteLength,
      ts,
    }
  } catch (err) {
    const duration_ms = performance.now() - started
    const e = err as { name?: string; message?: string }
    const name = classifyError(e, parentSignal)
    return {
      ok: false,
      t,
      vu,
      duration_ms,
      error: name,
      message: e?.message ?? String(err),
      ts,
    }
  }
}

function classifyError(e: { name?: string; message?: string }, parentSignal: AbortSignal): string {
  if (parentSignal.aborted) return "AbortError"
  if (e?.name === "TimeoutError") return "TimeoutError"
  if (e?.name === "AbortError") return "TimeoutError"
  if (e?.name) return e.name
  return "Error"
}
