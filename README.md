# jolly-bench

Load testing CLI built on [jolly-coop](https://github.com/arijit-gogoi/jolly-coop-js) — structured concurrency for JavaScript.

A fixed number of virtual users hammer a target URL (or run a scenario module) for a fixed duration. Latency percentiles, throughput, and error breakdown are reported at the end. Partial results survive `Ctrl-C`.

## Install

```
npm install -g jolly-bench
```

Requires Node 22+.

## Usage

```
jolly-bench -u https://api.example.com -c 50 -d 30s
jolly-bench -u https://api.example.com -c 50 --rps 100 -d 1m
jolly-bench --scenario ./flow.mjs -c 100 -d 2m --out samples.ndjson
```

### Flags

| Flag | Description |
|---|---|
| `-u, --url <url>` | target URL (GET by default) |
| `--scenario <path>` | ESM module, default export `async (user, signal) => void` |
| `-c, --concurrency <n>` | virtual user count (default 10) |
| `-d, --duration <dur>` | run duration, e.g. `30s`, `2m`, `1h` (default 30s) |
| `--rps <n>` | target aggregate requests-per-second |
| `--per-request-timeout <dur>` | per-request timeout (default 10s) |
| `--method <verb>` | HTTP method (default GET) |
| `--header <k:v>` | repeatable |
| `--body <str>` | request body |
| `--user-agent <str>` | (default `jolly-bench/<version>`) |
| `--out <path>` | write per-request NDJSON samples |
| `--warmup <dur>` | discard samples from first N seconds (default 0) |

Exit codes: `0` graceful, `1` fatal, `2` bad args, `130` Ctrl-C.

### Example output

```
Running 30s test @ http://localhost:9999
  50 VUs, 1 thread

latency (ms):
  avg     42.1
  p50     38.3
  p95     89.4
  p99    142.7
  max    687.2

throughput:  1,187 req/s
total:       35,610 requests in 30.00s
success:     35,599 (99.97%)
errors:         11 (0.03%)
  TimeoutError:  8
  NetworkError:  3

status:
  200:       35,599
```

### NDJSON samples

With `--out samples.ndjson`, one line per completed request:

```json
{"ok":true,"t":0.142,"vu":7,"duration_ms":38.2,"status":200,"size":1843,"ts":"2026-04-17T..."}
{"ok":false,"t":0.191,"vu":3,"duration_ms":42.1,"error":"TimeoutError","message":"...","ts":"2026-04-17T..."}
```

### Scenario modules

```js
// flow.mjs
export default async function (user, signal) {
  const login = await fetch("https://api.example.com/login", { signal })
  const token = (await login.json()).token
  await fetch("https://api.example.com/me", { headers: { authorization: `Bearer ${token}` }, signal })
}
```

Pass `signal` to every cancellation-aware API inside the scenario — this is the jolly-coop contract and it lets `jolly-bench` cancel in-flight requests cleanly at deadline / Ctrl-C.

## License

MIT
