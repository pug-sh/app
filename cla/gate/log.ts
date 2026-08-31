export const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

const value = (v: unknown) => {
  const s = v instanceof Error ? v.message : String(v)
  return /["\s=]/.test(s) ? JSON.stringify(s) : s
}

// Diagnostics go to stderr, leaving stdout for the contributor report and the workflow commands
// GitHub parses line by line. Re-running a job with debug logging sets RUNNER_DEBUG.
export function log(level: 'DEBUG' | 'INFO' | 'ERROR', msg: string, fields: Record<string, unknown> = {}) {
  if (level === 'DEBUG' && process.env.RUNNER_DEBUG !== '1') return
  const rest = Object.entries(fields)
    .map(([k, v]) => ` ${k}=${value(v)}`)
    .join('')
  process.stderr.write(`level=${level} msg=${value(msg)}${rest}\n`)
}
