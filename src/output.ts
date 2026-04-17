import { createWriteStream, type WriteStream } from "node:fs"
import type { Sample } from "./types.js"

export interface SampleWriter {
  write(sample: Sample): void
  close(): Promise<void>
}

const NOOP_WRITER: SampleWriter = {
  write() {},
  async close() {},
}

/**
 * Create an NDJSON sample writer. Registered as a scope resource so it closes
 * cleanly on scope exit (success, failure, or cancel). If `path` is undefined
 * returns a no-op — callers don't need to branch.
 *
 * Node's write streams buffer internally; we fire-and-forget writes and await
 * end() on close. The OS filesystem ordering guarantees the NDJSON lines come
 * out in the order write() was called on a single stream.
 */
export async function createSampleWriter(path: string | undefined): Promise<SampleWriter> {
  if (!path) return NOOP_WRITER
  const stream: WriteStream = createWriteStream(path, { flags: "a", encoding: "utf8" })
  await new Promise<void>((res, rej) => {
    stream.once("open", () => res())
    stream.once("error", rej)
  })
  return {
    write(sample: Sample) {
      stream.write(JSON.stringify(sample) + "\n")
    },
    close(): Promise<void> {
      return new Promise((res, rej) => {
        stream.end((err?: Error | null) => (err ? rej(err) : res()))
      })
    },
  }
}
