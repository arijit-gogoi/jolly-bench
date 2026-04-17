const DURATION_RE = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/

export function parseDuration(input: string): number {
  const match = DURATION_RE.exec(input.trim())
  if (!match) throw new Error(`invalid duration: ${JSON.stringify(input)} (expected e.g. 500ms, 30s, 2m, 1h)`)
  const n = Number(match[1])
  switch (match[2]) {
    case "ms": return n
    case "s":  return n * 1_000
    case "m":  return n * 60_000
    case "h":  return n * 3_600_000
  }
  throw new Error(`invalid duration unit: ${match[2]}`)
}

export function formatMs(ms: number): string {
  if (ms < 1_000) return `${ms.toFixed(1)}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(2)}s`
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(2)}m`
  return `${(ms / 3_600_000).toFixed(2)}h`
}
