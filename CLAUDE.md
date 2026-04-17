# jolly-bench

Load testing CLI built on [jolly-coop](https://github.com/arijit-gogoi/jolly-coop-js).

## What this is

CLI tool. Target invocation:

```
jolly-bench -u https://api.example.com -c 50 -d 30s
jolly-bench -u https://api.example.com -c 50 --rps 100 -d 1m
jolly-bench --scenario ./flow.mjs -c 100 -d 2m --out results.json
```

Runs N concurrent virtual users hammering a target (URL or user-supplied scenario function) for a duration. Emits per-request samples optionally and a final summary with latency percentiles, throughput, and error breakdown.

## Dependencies

- `jolly-coop@^0.3.1` — the structured concurrency runtime. Authoritative sources, in order of preference:
  - Local spec: `../jolly-coop-js/spec/jolly-coop.md` (if checked out as sibling)
  - Installed types: `node_modules/jolly-coop/dist/index.d.ts` (TSDoc on all public types as of v0.3.1)
  - GitHub: https://github.com/arijit-gogoi/jolly-coop-js

## Jolly rules that matter for this codebase

**Signals are explicit. There is no ambient context.** Every await that should honor cancellation must receive a signal:

- `await sleep(ms, s.signal)` — always thread the signal
- `await yieldNow(s.signal)` — always thread the signal
- Nested scope: `scope({ signal: s.signal }, async inner => ...)` — inherit explicitly
- `fetch(url, { signal: s.signal })` — pass to any AbortSignal-aware API

**Load testers must be robust to individual failures.** Never let a failed request cancel the scope — that's the entire point of the tool. Every request task wraps its body in try/catch and returns a `Sample` (success or failure record). The scope only rejects if something catastrophic happens (startup failure, output file cannot be opened, etc.).

**`cancel()` vs `done()`:** Use `done()` when duration elapses (graceful, stats still valid). Use `cancel()` only for fatal errors. Ctrl-C → external signal aborts → scope rejects with abort reason.

**Resource cleanup is LIFO.** Output file (opened last, closed first) → HTTP agent (opened first, closed last) so connections are released before file descriptor drops.

**Nested scopes do not auto-inherit the parent signal.** Always pass `{ signal: parent.signal }` explicitly.

## Architecture

The scope tree IS the app's architecture:

```
scope({ deadline, signal: externalAbort.signal })         — root run
├── resource: HTTP keep-alive agent
├── resource: output writer (if --out)
├── spawn: stats aggregator (consumes samples, computes percentiles live)
├── spawn: progress printer (stderr, ~100ms refresh)
└── spawn: driver
    └── scope({ limit: concurrency, signal: s.signal })   — virtual user pool
        ├── spawn: VU #1 (loop: fetch → sample → repeat until deadline/abort)
        ├── spawn: VU #2
        └── ... up to -c
```

Cancellation propagates downward. Deadline fires automatically. Stats aggregator drains samples until the pool resolves.

## Commands

- `npm test` — unit tests (vitest)
- `npm run build` — tsup → `dist/cli.js` (with shebang) + `dist/index.js`
- `npm run typecheck` — `tsc --noEmit`

## Commit discipline

- Conventional Commits: `<type>(scope): description`
- Git log is the history. Explain *why*, not just *what*.
- Pre-1.0 breaking changes go in the minor position (0.x.y).
- For benchmark changes, include before/after p95/p99 numbers in the commit body.
