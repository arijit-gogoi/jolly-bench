#!/usr/bin/env node
import { parseArgs } from "node:util"
import { runBench } from "./bench.js"
import { parseDuration } from "./time.js"
import { formatSummary } from "./summary.js"
import type { BenchOptions } from "./types.js"
import { VERSION } from "./index.js"

const USAGE = `jolly-bench — structured-concurrency load tester

Usage:
  jolly-bench -u <url> [options]
  jolly-bench --scenario <path> [options]

Options:
  -u, --url <url>              target URL
      --scenario <path>        ESM module, default export (user, signal) => void
  -c, --concurrency <n>        virtual user count (default: 10)
  -d, --duration <dur>         run duration, e.g. 30s, 2m (default: 30s)
      --rps <n>                target aggregate requests-per-second
      --per-request-timeout <dur>  (default: 10s)
      --method <verb>          HTTP method (default: GET)
      --header <k:v>           repeatable
      --body <str>             request body
      --user-agent <str>       (default: jolly-bench/${VERSION})
      --out <path>             write per-request NDJSON samples
      --warmup <dur>           discard samples from first N seconds (default: 0)
      --help                   show this message
      --version                show version

Exit codes: 0 graceful, 1 fatal, 2 bad args, 130 SIGINT.
`

interface ParsedCli {
  opts: BenchOptions
  quiet: boolean
}

function parseHeaders(values: string[] | undefined): Record<string, string> {
  const h: Record<string, string> = {}
  for (const v of values ?? []) {
    const idx = v.indexOf(":")
    if (idx <= 0) { throw usageError(`invalid --header ${JSON.stringify(v)} (expected key:value)`) }
    h[v.slice(0, idx).trim().toLowerCase()] = v.slice(idx + 1).trim()
  }
  return h
}

class UsageError extends Error {}
function usageError(msg: string): UsageError { return new UsageError(msg) }

function parseCli(argv: string[]): ParsedCli {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        url: { type: "string", short: "u" },
        scenario: { type: "string" },
        concurrency: { type: "string", short: "c" },
        duration: { type: "string", short: "d" },
        rps: { type: "string" },
        "per-request-timeout": { type: "string" },
        method: { type: "string" },
        header: { type: "string", multiple: true },
        body: { type: "string" },
        "user-agent": { type: "string" },
        out: { type: "string" },
        warmup: { type: "string" },
        help: { type: "boolean" },
        version: { type: "boolean" },
        quiet: { type: "boolean" },
      },
    })
  } catch (err) {
    throw usageError((err as Error).message)
  }
  const v = parsed.values

  if (v.help) { process.stdout.write(USAGE); process.exit(0) }
  if (v.version) { process.stdout.write(`jolly-bench ${VERSION}\n`); process.exit(0) }

  const hasUrl = typeof v.url === "string" && v.url.length > 0
  const hasScenario = typeof v.scenario === "string" && v.scenario.length > 0
  if (hasUrl && hasScenario) throw usageError("pass exactly one of --url or --scenario, not both")
  if (!hasUrl && !hasScenario) throw usageError("one of --url or --scenario is required")

  const concurrency = v.concurrency !== undefined ? parseIntStrict(v.concurrency, "--concurrency") : 10
  if (concurrency < 1) throw usageError("--concurrency must be >= 1")

  const durationMs = v.duration !== undefined ? parseDurationStrict(v.duration, "--duration") : 30_000
  if (durationMs <= 0) throw usageError("--duration must be > 0")

  const rps = v.rps !== undefined ? parseIntStrict(v.rps, "--rps") : undefined
  if (rps !== undefined && rps <= 0) throw usageError("--rps must be > 0")

  const perRequestTimeoutMs = v["per-request-timeout"] !== undefined
    ? parseDurationStrict(v["per-request-timeout"], "--per-request-timeout")
    : 10_000

  const warmupMs = v.warmup !== undefined ? parseDurationStrict(v.warmup, "--warmup") : 0

  const opts: BenchOptions = {
    url: hasUrl ? v.url : undefined,
    scenarioPath: hasScenario ? v.scenario : undefined,
    concurrency,
    durationMs,
    rps,
    perRequestTimeoutMs,
    method: v.method ?? "GET",
    headers: parseHeaders(v.header as string[] | undefined),
    body: v.body,
    userAgent: v["user-agent"] ?? `jolly-bench/${VERSION}`,
    outPath: v.out,
    warmupMs,
  }
  return { opts, quiet: v.quiet === true }
}

function parseIntStrict(s: string, label: string): number {
  const n = Number(s)
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw usageError(`${label}: expected integer, got ${JSON.stringify(s)}`)
  return n
}

function parseDurationStrict(s: string, label: string): number {
  try { return parseDuration(s) }
  catch (err) { throw usageError(`${label}: ${(err as Error).message}`) }
}

async function main(): Promise<number> {
  let parsed: ParsedCli
  try { parsed = parseCli(process.argv.slice(2)) }
  catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`error: ${err.message}\n\n${USAGE}`)
      return 2
    }
    throw err
  }

  const ac = new AbortController()
  let sigintFired = false
  const onSigint = () => {
    if (sigintFired) { process.exit(130) }
    sigintFired = true
    ac.abort(new Error("SIGINT"))
  }
  process.on("SIGINT", onSigint)

  try {
    const result = await runBench({ ...parsed.opts, signal: ac.signal }, !parsed.quiet)
    if (!parsed.quiet) process.stderr.write(formatSummary(result))
    if (result.endedBy === "error") {
      process.stderr.write(`\nbench failed: ${(result.failure as Error)?.message ?? result.failure}\n`)
      return 1
    }
    return sigintFired ? 130 : 0
  } catch (err) {
    process.stderr.write(`\nfatal: ${(err as Error)?.message ?? String(err)}\n`)
    return 1
  } finally {
    process.off("SIGINT", onSigint)
  }
}

main().then(code => process.exit(code), err => {
  process.stderr.write(`\nfatal: ${(err as Error)?.stack ?? String(err)}\n`)
  process.exit(1)
})
