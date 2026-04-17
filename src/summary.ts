import type { BenchResult, StatsSnapshot } from "./types.js"

export function formatSummary(result: BenchResult): string {
  const s = result.snapshot
  const target = result.target.url ?? `scenario ${result.target.scenarioPath}`
  const lines: string[] = []
  lines.push("")
  lines.push(`Running ${(result.durationMs / 1_000).toFixed(0)}s test @ ${target}`)
  lines.push(`  ${result.concurrency} VUs, 1 thread`)
  lines.push("")
  lines.push("latency (ms):")
  lines.push(`  avg   ${fmtMs(s.latency.avg)}`)
  lines.push(`  p50   ${fmtMs(s.latency.p50)}`)
  lines.push(`  p95   ${fmtMs(s.latency.p95)}`)
  lines.push(`  p99   ${fmtMs(s.latency.p99)}`)
  lines.push(`  max   ${fmtMs(s.latency.max)}`)
  lines.push("")
  lines.push(`throughput:  ${fmtNum(s.throughput, 0)} req/s`)
  lines.push(`total:       ${fmtInt(s.total)} requests in ${(s.elapsedMs / 1_000).toFixed(2)}s`)
  lines.push(`success:     ${fmtInt(s.success)} (${fmtPct(s.success, s.total)})`)
  lines.push(`errors:      ${fmtInt(s.errors)} (${fmtPct(s.errors, s.total)})`)
  for (const [name, count] of sortedEntries(s.byError)) {
    lines.push(`  ${padRight(name + ":", 12)} ${fmtInt(count)}`)
  }
  lines.push("")
  lines.push("status:")
  for (const [code, count] of sortedNumEntries(s.byStatus)) {
    lines.push(`  ${code}:       ${fmtInt(count)}`)
  }
  if (result.targetRps !== undefined) {
    lines.push("")
    lines.push(`target rps:  ${result.targetRps}  (achieved: ${result.achievedRps.toFixed(1)})`)
  }
  lines.push("")
  return lines.join("\n")
}

function fmtMs(n: number): string {
  if (!Number.isFinite(n)) return "    -"
  return n.toFixed(1).padStart(7)
}
function fmtNum(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return "-"
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
function fmtInt(n: number): string {
  return n.toLocaleString()
}
function fmtPct(part: number, whole: number): string {
  if (whole === 0) return "0.00%"
  return ((part / whole) * 100).toFixed(2) + "%"
}
function padRight(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length)
}
function sortedEntries(rec: Record<string, number>): Array<[string, number]> {
  return Object.entries(rec).sort((a, b) => b[1] - a[1])
}
function sortedNumEntries(rec: Record<number, number>): Array<[number, number]> {
  return (Object.entries(rec) as Array<[string, number]>)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .sort((a, b) => a[0] - b[0])
}

export { fmtMs, fmtInt, fmtPct }
export type { StatsSnapshot }
