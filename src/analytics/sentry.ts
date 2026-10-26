import { type ErrorEvent, init, reactErrorHandler } from '@sentry/react'
import { sanitizeUrl } from './sanitize-url'

const dsn = import.meta.env.VITE_SENTRY_DSN

const DROPPED_INTEGRATIONS = new Set(['Breadcrumbs', 'BrowserSession'])

// Frames also hold '<anonymous>' and 'native', which sanitizeUrl would resolve against the origin.
const scrubFrameUrl = (url: string | undefined) => (url && /^https?:\/\//.test(url) ? sanitizeUrl(url) : url)

export const scrubEvent = (event: ErrorEvent) => {
  if (event.request) {
    if (event.request.url) event.request.url = sanitizeUrl(event.request.url)
    if (event.request.headers?.Referer) event.request.headers.Referer = sanitizeUrl(event.request.headers.Referer)
    delete event.request.query_string
    delete event.request.cookies
  }
  // An error with no stack gets a frame filed under location.href.
  for (const value of event.exception?.values ?? []) {
    for (const frame of value.stacktrace?.frames ?? []) {
      frame.filename = scrubFrameUrl(frame.filename)
      frame.abs_path = scrubFrameUrl(frame.abs_path)
    }
  }
  // Console breadcrumbs survive dropping the integration.
  delete event.breadcrumbs
  return event
}

export const initSentry = () => {
  if (!dsn) return {}

  init({
    dsn,
    environment: import.meta.env.MODE,
    dataCollection: { userInfo: false, cookies: false, urlQueryParams: false },
    // Click breadcrumbs carry aria-label/title text and full URLs; sessions are not errors.
    integrations: defaults => defaults.filter(integration => !DROPPED_INTEGRATIONS.has(integration.name)),
    beforeSend: scrubEvent,
  })

  // Replacing React's root handlers also replaces their console logging, so put it back.
  const report = reactErrorHandler()
  const reportAndLog: typeof report = (error, info) => {
    report(error, info)
    console.error(error)
  }
  return { onCaughtError: report, onUncaughtError: reportAndLog, onRecoverableError: reportAndLog }
}
