// Node re-reads process.env.TZ on every Date operation, so DST is reachable from a suite that runs
// in whatever zone the machine sits in. Restored after: vitest reuses a worker across files.
export const inZone = (timeZone: string, run: () => void) => {
  const original = process.env.TZ
  process.env.TZ = timeZone
  try {
    run()
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
}
