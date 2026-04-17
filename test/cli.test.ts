import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { spawn } from "node:child_process"
import { resolve } from "node:path"

const cli = resolve(process.cwd(), "dist", "cli.js")

let server: Server
let baseUrl = ""

beforeAll(async () => {
  server = createServer((_q, r) => setTimeout(() => r.end("ok"), 5))
  await new Promise<void>(r => server.listen(0, "127.0.0.1", () => r()))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => { await new Promise<void>(r => server.close(() => r())) })

function runCli(args: string[], env?: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise(res => {
    const c = spawn(process.execPath, [cli, ...args], { env: { ...process.env, ...env } })
    let stdout = "", stderr = ""
    c.stdout.on("data", d => { stdout += d })
    c.stderr.on("data", d => { stderr += d })
    c.on("exit", code => res({ code, stdout, stderr }))
  })
}

describe("cli arg validation", () => {
  it("no args → exit 2", async () => {
    const r = await runCli([])
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/one of --url or --scenario is required/)
  })

  it("both --url and --scenario → exit 2", async () => {
    const r = await runCli(["-u", baseUrl, "--scenario", "./x.mjs"])
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/not both/)
  })

  it("invalid duration → exit 2", async () => {
    const r = await runCli(["-u", baseUrl, "-d", "abc"])
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/invalid duration/)
  })

  it("-c 0 → exit 2", async () => {
    const r = await runCli(["-u", baseUrl, "-c", "0", "-d", "1s"])
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/--concurrency/)
  })

  it("--version prints version, exits 0", async () => {
    const r = await runCli(["--version"])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/jolly-bench \d+\.\d+\.\d+/)
  })

  it("short happy path prints summary, exits 0", async () => {
    const r = await runCli(["-u", baseUrl, "-c", "3", "-d", "500ms"])
    expect(r.code).toBe(0)
    expect(r.stderr).toMatch(/latency \(ms\):/)
    expect(r.stderr).toMatch(/throughput:/)
  }, 10_000)
})

// SIGINT delivery to a child node on Windows is not cross-platform testable via child.kill.
// The CLI's SIGINT path is exercised indirectly by the external-abort bench integration test;
// here we only verify SIGINT behaviour on POSIX platforms.
const SIGINT_TESTABLE = process.platform !== "win32"

describe.skipIf(!SIGINT_TESTABLE)("cli SIGINT (POSIX only)", () => {
  it("SIGINT during run → exit 130 with partial summary", async () => {
    const done = new Promise<{ code: number | null; stderr: string }>(res => {
      const c = spawn(process.execPath, [cli, "-u", baseUrl, "-c", "3", "-d", "30s"])
      let stderr = ""
      c.stderr.on("data", d => { stderr += d })
      setTimeout(() => c.kill("SIGINT"), 500)
      c.on("exit", code => res({ code, stderr }))
    })
    const r = await done
    expect(r.code).toBe(130)
    expect(r.stderr).toMatch(/latency/)
  }, 15_000)
})
