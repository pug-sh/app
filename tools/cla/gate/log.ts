// Diagnostics go to stderr, leaving stdout for the contributor report and the workflow commands
// GitHub parses line by line. Re-running a job with debug logging sets RUNNER_DEBUG.

type Fields = Record<string, unknown>

const line = (level: string, msg: string, fields: Fields) => {
  const rendered = Object.entries(fields)
    .map(([k, v]) => `${k}=${JSON.stringify(v instanceof Error ? v.message : v)}`)
    .join(' ')
  console.error(`level=${level} msg=${JSON.stringify(msg)}${rendered === '' ? '' : ` ${rendered}`}`)
}

export const logInfo = (msg: string, fields: Fields = {}) => line('INFO', msg, fields)
export const logError = (msg: string, fields: Fields = {}) => line('ERROR', msg, fields)

export const logDebug = (msg: string, fields: Fields = {}) => {
  if (process.env.RUNNER_DEBUG === '1') line('DEBUG', msg, fields)
}
