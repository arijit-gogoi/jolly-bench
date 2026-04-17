# jolly-bench — v0.1.0 build plan

This is the execution roadmap for the first shippable version. Read `CLAUDE.md` first for project rules and the scope tree. When something is already covered in `CLAUDE.md`, this file references it rather than duplicating.

## 1. Goal

A CLI that runs N concurrent virtual users hitting a target URL (or executing a user-supplied scenario) for a fixed duration (or until Ctrl-C), reporting latency percentiles, throughput, and error breakdown. Exits 0 on graceful completion (duration elapsed), non-zero on startup failure. Ctrl-C exits 130 and still prints partial summary.

## 2. CLI shape (frozen)

```
jolly-bench -u <url> [options]                          # URL-only mode
jolly-bench --scenario <path> [options]                 # scenario module mode
jolly-bench -u <url> -c 50 -d 30s                       # 50 VUs, 30 seconds
jolly-bench -u <url> -c 50 --rps 100 -d 1m              # rate-limited to 100 RPS
jolly-bench -u <url> -c 50 -d 30s --out samples.ndjson  # write per-request samples
```

Flags:
- `-u, --url <url>` — target URL (GET request)
- `--scenario <path>` — ESM module exporting `default async (user, signal) => void`
- `-c, --concurrency <n>` — virtual user count (default: 10)
- `-d, --duration <dur>` — run duration, `30s`/`2m`/`1h` (default: 30s)
- `--rps <n>` — target requests-per-second. If set, VUs space requests to hit this global rate. Without this, VUs hammer as fast as the target responds.
- `--per-request-timeout <dur>` — per-request timeout (default: 10s)
- `--method <verb>` — HTTP method (default: GET)
- `--header <k:v>` — repeatable
- `--body <str>` — request body
- `--user-agent <str>` — (default: `jolly-bench/${VERSION}`)
- `--out <path>` — write per-request NDJSON samples (default: no sample output, summary only)
- `--warmup <dur>` — discard samples from first N seconds (default: 0)
- `--help`, `--version`

Exit codes:
- 0 graceful (duration elapsed, queue empty)
- 1 fatal (target unreachable at startup, scenario module failed to import, output file cannot be opened)
- 2 bad arguments
- 130 interrupted (SIGINT / Ctrl-C)

Mutual exclusivity: exactly one of `-u` or `--scenario` required.

## 3. Output: NDJSON sample schema (frozen)

When `--out` is provided, emit one line per completed request:

```json
{"t":42.137,"vu":7,"duration_ms":38.2,"status":200,"size":1843,"ts":"2026-04-17T..."}
{"t":42.191,"vu":3,"duration_ms":42.1,"error":"TimeoutError","message":"...","ts":"2026-04-17T..."}
```

`t` is seconds-since-run-start. `vu` is the virtual-user index. Success records have `status`, `size`, `duration_ms`. Error records have `error` and `message`.

## 4. Final summary schema (frozen, to stderr)

```
Running 30s test @ https://api.example.com
  50 VUs, 1 thread

latency (ms):
  avg    42.1
  p50    38.3
  p95    89.4
  p99   142.7
  max   687.2

throughput:  1,187 req/s
total:       35,610 requests in 30.00s
success:     35,599 (99.97%)
errors:         11 (0.03%)
  timeouts:     8
  refused:      3

status:
  200:       35,599
  500:          11
```

If `--rps` was provided, add an extra line:
```
target rps:  100  (achieved: 98.3)
```

## 5. Scope tree

See `CLAUDE.md § Architecture`.

## 6. File layout

Each file has a single responsibility; target < 200 LOC.

| File | Responsibility |
|---|---|
| `src/cli.ts` | arg parsing, SIGINT wiring, invoke `runBench()`, map result → exit code |
| `src/bench.ts` | root scope assembly; owns the full scope tree; exports `runBench()` |
| `src/vu.ts` | virtual user loop: fetch/scenario → sample → repeat until signal fires |
| `src/request.ts` | single HTTP request with per-request timeout; returns Sample (never throws) |
| `src/stats.ts` | online percentile computation, status counts, error bucketing |
| `src/percentile.ts` | t-digest-like percentile structure (or simple sorted-buffer for v0.1) |
| `src/rate.ts` | RPS throttle — computes sleep between requests to hit target rate |
| `src/scenario.ts` | dynamic import + validation of user scenario module |
| `src/output.ts` | NDJSON sample writer as a resource (opens file, closes on dispose) |
| `src/progress.ts` | stderr progress printer task |
| `src/summary.ts` | format final summary string from Stats |
| `src/time.ts` | duration parsing (`"30s"` → ms), formatting |
| `src/types.ts` | shared types (`CrawlOpts`, `Sample`, `Stats`, etc.) |
| `src/index.ts` | re-export `runBench` and types for library consumers |
| `test/*.test.ts` | vitest |

## 7. Implementation milestones and parallel-execution plan

Each milestone is a committable increment. The **parallel tracks** below can be executed concurrently within a single session (batched in one tool-call round) or split across separate sessions.

### Dependency graph (topological)

```
       M0: types + time
          ↓         ↓
  M1: percentile   M2: rate
          ↓
  M3: stats  ← (depends on M1 + M0)
          ↓
  M4: request (depends on M0)     M5: scenario (depends on M0)
          ↓                              ↓
          └─────────┬────────────────────┘
                    ↓
          M6: vu (depends on M4 + M5 + M2)
                    ↓
          M7: output (depends on M0)
          M8: progress + summary (depends on M3)
                    ↓
          M9: bench (root scope; depends on M6 + M7 + M8)
                    ↓
          M10: cli (depends on M9 + M0)
                    ↓
          M11: integration tests + smoke + docs
```

### Parallel tracks (can be built concurrently)

- **Track A — pure utilities** (no jolly-coop dependency): M0, M1, M2. Build these first and in parallel — they're all pure functions with unit tests.
- **Track B — I/O layer** (requires Track A): M4 (request), M5 (scenario), M7 (output). Independent of each other; can be built in parallel once M0 lands.
- **Track C — stats/UI** (requires Track A): M3 (stats), M8 (progress + summary). Parallel with Track B.
- **Track D — assembly** (requires B and C): M6 (vu), M9 (bench), M10 (cli). These form a chain, cannot parallelize internally.
- **Track E — integration**: M11 depends on everything.

**Recommended execution order:** Track A (parallel) → Track B + Track C (all in parallel) → Track D (serial) → Track E.

That's 5 rounds of work for 12 milestones. A session can batch parallel milestones in a single message with multiple `Write` calls.

### Milestone detail

**M0 — types + time (Track A)**
- `src/types.ts`: `Sample` (success | error variant), `Stats` (counts, percentiles, by-status, errors bucket), `BenchOptions`, `BenchResult`, `ScenarioFn`.
- `src/time.ts`: `parseDuration("30s") → 30_000`; throws on invalid input.
- Tests: `test/time.test.ts`.
- No jolly-coop imports; pure.

**M1 — percentile (Track A)**
- `src/percentile.ts`: for v0.1, use a sorted-buffer percentile calculator (resizable Float64Array, insert + sorted query). Trade off: O(log n) insert via binary search, O(1) percentile query. Good up to ~100k samples. t-digest is overkill for v0.1.
- Export: `class PercentileBuffer { push(v), p(q), count, min, max, mean }`.
- Tests: `test/percentile.test.ts`.
- Pure.

**M2 — rate (Track A)**
- `src/rate.ts`: `class RateLimiter(targetRps)` with `nextDelayMs(completedSoFar, elapsedMs)` → how long to sleep to stay on target. Use actual-elapsed-time accounting, not nominal.
- Tests: `test/rate.test.ts`.
- Pure.

**M3 — stats aggregator (Track C)**
- `src/stats.ts`: `class Stats` consumes `Sample` objects, maintains counts, percentile buffer (from M1), by-status Map, error bucket by error name.
- Thread-safe enough for single-event-loop (all mutations happen from one task — the aggregator).
- Tests: `test/stats.test.ts`.

**M4 — request (Track B)**
- `src/request.ts`: `fetchOnce(url, opts, signal): Promise<Sample>` — never throws. Per-request timeout via nested `scope({ timeout, signal })` or `AbortSignal.timeout()` composed with the parent signal via `AbortSignal.any([...])`.
- Records duration_ms (performance.now() before and after), status, size (response body consumed; for v0.1 just read to measure size then discard).
- Tests: `test/request.test.ts` — mock server via `node:http` or global.fetch override.
- **Reference:** `../jolly-coop-js/examples/library/01-retry-with-backoff.mjs` for error-as-value shape. NOTE: v0.1 does NOT retry inside a request — load testers record failures, they don't retry (user can run with more VUs if flakiness is tolerable).

**M5 — scenario (Track B)**
- `src/scenario.ts`: `loadScenario(path): Promise<ScenarioFn>` — dynamic `import()`, validates that default export is an async function taking 2 args.
- Fatal at startup if import fails or shape is wrong.
- Tests: `test/scenario.test.ts` with temp file fixtures.

**M6 — vu loop (Track D, requires M2+M4+M5)**
- `src/vu.ts`: `runVU(index, mode, opts, signal, onSample, rateLimiter?): Promise<void>`.
- Loop: while !signal.aborted → do one request (M4) or run scenario (M5) → push sample → if rateLimiter, await its delay → repeat.
- Catches any throw from scenario (wraps into error Sample), never propagates to parent scope.

**M7 — output (Track B)**
- `src/output.ts`: `createSampleWriter(path | undefined): Promise<Writer>`. Writer has `write(sample)` and `close()`. If path undefined, no-op writer. File path → open for append.
- Registered in root scope as `await s.resource(writer, w => w.close())`.

**M8 — progress + summary (Track C)**
- `src/progress.ts`: `runProgress(stats, signal)` — stderr refresh loop at 100ms.
- `src/summary.ts`: `formatSummary(stats, options): string` — the final block from §4.

**M9 — bench (Track D, requires M6+M7+M8)**
- `src/bench.ts`: `runBench(opts): Promise<BenchResult>` — the scope tree assembly. Builds the tree from `CLAUDE.md § Architecture`. Wires external signal, computes deadline, constructs stats, spawns aggregator / progress / VU pool / driver. Returns final Stats + `endedBy` discriminator.
- Handles `TimeoutError` (from `scope({deadline})`) as graceful. Checks `signal.aborted` to distinguish SIGINT.

**M10 — cli (Track D, requires M9)**
- `src/cli.ts`: `parseArgs` → validate → SIGINT wiring → `runBench` → format summary → exit code.
- Mutual exclusivity check: `-u` vs `--scenario`.

**M11 — integration (Track E)**
- `test/bench.test.ts`: start a local `node:http` server, run bench against it, verify sample count, percentile sanity, error handling.
- Smoke test commits: `node dist/cli.js -u http://localhost:<port> -c 5 -d 2s`.

## 8. Jolly rules to honor

See `CLAUDE.md § Jolly rules that matter for this codebase`. The five: explicit signals; fail-fast-is-WRONG-here (individual request failures must not cancel the scope — always error-as-value); `done()` on duration elapsed; LIFO resource cleanup (agent first, writer last so writes complete before fd closes); explicit `{ signal: parent.signal }` on nested scopes.

## 9. Enumerated test cases

### `test/cli.test.ts`
- No args → exits 2 with usage
- Both `-u` and `--scenario` → exits 2
- Neither `-u` nor `--scenario` → exits 2
- Invalid duration → exits 2
- `-c 0` → exits 2
- SIGINT during run → exits 130, partial summary printed

### `test/time.test.ts`
- `parseDuration("30s")` → 30_000
- `parseDuration("2m")` → 120_000
- `parseDuration("1h")` → 3_600_000
- `parseDuration("500ms")` → 500
- `parseDuration("abc")` throws

### `test/percentile.test.ts`
- Empty buffer: count=0, percentile returns NaN
- Single value: p50 = p99 = that value
- Uniform distribution [1..100]: p50 ≈ 50, p99 ≈ 99
- Sorted order preserved after N random inserts

### `test/rate.test.ts`
- Target 100 rps, 50 done at 0.5s → next delay 0 (behind)
- Target 100 rps, 100 done at 0.5s → next delay 5ms (on target)
- Target 100 rps, 200 done at 0.5s → next delay 10ms (ahead)

### `test/stats.test.ts`
- Push 1000 success samples → counts match, p50/p95/p99 sane
- Mix of success and error samples → totals split correctly
- Status distribution: [200, 200, 500] → {200: 2, 500: 1}
- Error bucketing: two TimeoutErrors + one NetworkError → {TimeoutError: 2, NetworkError: 1}

### `test/request.test.ts`
- 200 response → success sample with duration_ms > 0, size > 0
- Network error → error sample with error name
- Timeout fires → error sample with `"TimeoutError"` name
- Signal abort mid-request → error sample with `"AbortError"` name

### `test/scenario.test.ts`
- Valid scenario module loads and returns a function
- Missing default export → loadScenario throws with helpful message
- Default export is not a function → throws
- Arity wrong (takes 1 or 3 args) → warning but allowed (non-fatal)

### `test/vu.test.ts`
- Runs until signal aborted; sample count grows
- Error in scenario is captured as error sample, loop continues
- With rateLimiter, observed RPS ≈ target (within 10%)

### `test/output.test.ts`
- No path → writer is no-op, no file created
- With path → file has one line per write(), valid NDJSON, closed cleanly on dispose

### `test/bench.test.ts` (integration, real local HTTP server)
- -c 5 -d 2s → final stats.total >= some floor, all success
- Target returns 500 → errors counted correctly
- Ctrl-C simulated → partial stats returned, endedBy=abort
- Deadline elapses → endedBy=drained
- Error-as-value: if one VU's scenario throws, other VUs continue; scope resolves

## 10. Out of scope for v0.1.0

- Multi-endpoint scenarios (use `--scenario` for that, but no built-in "weighted URL list")
- HDR histogram export
- Grafana/Prometheus push
- WebSocket / gRPC / SSE
- Think time distributions (pareto, normal) — only flat RPS
- HTTP/2 server push
- Request recording / HAR replay (that's jolly-http's territory)
- Distributed load generation
- Stage-wise load profiles (ramp-up, sustain, ramp-down)

## 11. Definition of done

- [ ] All test cases in §9 implemented and passing
- [ ] `npm run typecheck` clean
- [ ] `npm run build` produces `dist/cli.js` with shebang (verify with `head -1`)
- [ ] `node dist/cli.js -u http://localhost:<port> -c 10 -d 5s` produces valid summary to stderr, exits 0
- [ ] `node dist/cli.js -u http://localhost:<port> -c 10 -d 5s --out samples.ndjson` writes valid NDJSON (one record per request)
- [ ] `node dist/cli.js -u http://localhost:<port> -c 10 --rps 50 -d 5s` observed RPS within 10% of target
- [ ] Ctrl-C during a longer run produces partial summary, exits 130
- [ ] README updated with one usage example + example output

## 12. Verification commands

```bash
cd C:/Users/hp/claude-projects/jolly-bench
npm run typecheck
npm test
npm run build

# Start a throwaway local server in one terminal:
node -e 'require("node:http").createServer((req,res)=>{setTimeout(()=>{res.end("ok")},Math.random()*50)}).listen(9999,()=>console.log("ready"))'

# Smoke tests (in another terminal):
node dist/cli.js -u http://localhost:9999 -c 10 -d 3s
node dist/cli.js -u http://localhost:9999 -c 20 --rps 100 -d 3s
node dist/cli.js -u http://localhost:9999 -c 5 -d 2s --out /tmp/s.ndjson && head -3 /tmp/s.ndjson
```

## 13. Commit cadence suggestion

Roughly one commit per milestone for M0-M11, Conventional Commits:

- `feat(types): shared Sample, Stats, options types (M0)`
- `feat(time): duration parsing (M0)`
- `feat(percentile): sorted-buffer percentile calculator (M1)`
- `feat(rate): target-rps throttle (M2)`
- `feat(stats): online aggregator with percentiles and buckets (M3)`
- `feat(request): single HTTP request as error-as-value Sample (M4)`
- `feat(scenario): dynamic import + validation of user scenario (M5)`
- `feat(vu): virtual user loop with sample emission (M6)`
- `feat(output): NDJSON sample writer as scope resource (M7)`
- `feat(progress): stderr progress printer + summary formatter (M8)`
- `feat(bench): root scope assembly and orchestration (M9)`
- `feat(cli): arg parsing, SIGINT wiring, exit codes (M10)`
- `test: integration tests against local HTTP server (M11)`
- `docs: README usage and example output`
- `chore: bump version to 0.1.0`

After the final commit: tag `v0.1.0`, push tag, `npm publish`.

## 14. Parallel execution guidance for new sessions

If starting fresh in this repo: check `git log` for the last milestone committed. If you see M0 done, you can start M1, M2 in parallel in a single session round. If you see M3 done, M4, M5, M7, M8 can all be tackled in one round. Only M6, M9, M10 require serial execution (each imports from the previous).

This is the difference between 13 sequential commits and 5-6 rounds of parallel work. Prefer the latter.
