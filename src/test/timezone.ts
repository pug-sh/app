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

// An Intl.DateTimeFormat freezes its zone when it is constructed, so a module that builds one at
// import time is immune to inZone above — it was already built. Use this to re-import the module
// inside the zone (with vi.resetModules()), or the assertion only proves whatever the runner's own
// zone happens to make true.
export const inZoneAsync = async (timeZone: string, run: () => Promise<void>) => {
  const original = process.env.TZ
  process.env.TZ = timeZone
  try {
    await run()
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
}
