import type { ErrorEvent } from '@sentry/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({ init: vi.fn(), report: vi.fn() }))
vi.mock('@sentry/react', () => ({ init: sentry.init, reactErrorHandler: () => sentry.report }))

const load = async (dsn: string) => {
  vi.stubEnv('VITE_SENTRY_DSN', dsn)
  vi.resetModules()
  return import('./sentry')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('scrubEvent', () => {
  it('masks URLs and drops query, cookies and breadcrumbs', async () => {
    const { scrubEvent } = await load('')
    const event = scrubEvent({
      type: undefined,
      request: {
        url: 'https://app.pug.sh/p/1/profiles/jane@example.com?ef=secret',
        query_string: 'ef=secret',
        cookies: { a: 'b' },
        headers: { Referer: 'https://app.pug.sh/magic-link?token=abc' },
      },
      breadcrumbs: [{ message: 'jane@example.com' }],
    } as ErrorEvent)

    expect(event.request?.url).toBe('https://app.pug.sh/p/1/profiles/:profileId')
    expect(event.request?.headers?.Referer).toBe('https://app.pug.sh/magic-link')
    expect(event.request?.query_string).toBeUndefined()
    expect(event.request?.cookies).toBeUndefined()
    expect(event.breadcrumbs).toBeUndefined()
  })

  it('masks a stack frame filed under the page URL and leaves non-URL frames alone', async () => {
    const { scrubEvent } = await load('')
    const event = scrubEvent({
      type: undefined,
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: 'https://app.pug.sh/p/1/profiles/jane@example.com?ef=x',
                  abs_path: 'https://app.pug.sh/shared/tok',
                },
                { filename: 'https://app.pug.sh/assets/index-abc.js' },
                { filename: '<anonymous>' },
              ],
            },
          },
        ],
      },
    } as ErrorEvent)

    const frames = event.exception?.values?.[0].stacktrace?.frames
    expect(frames?.[0]).toEqual({
      filename: 'https://app.pug.sh/p/1/profiles/:profileId',
      abs_path: 'https://app.pug.sh/shared/:shareId',
    })
    expect(frames?.[1].filename).toBe('https://app.pug.sh/assets/index-abc.js')
    expect(frames?.[2].filename).toBe('<anonymous>')
  })

  it('passes an event without a request', async () => {
    const { scrubEvent } = await load('')

    expect(scrubEvent({ type: undefined, message: 'x' } as ErrorEvent)).toEqual({ type: undefined, message: 'x' })
  })
})

describe('initSentry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('does nothing without a DSN', async () => {
    const { initSentry } = await load('')

    expect(initSentry()).toEqual({})
    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('scrubs every event, keeps user data off and drops breadcrumbs and sessions', async () => {
    const { initSentry, scrubEvent } = await load('https://k@o.ingest.sentry.io/1')
    initSentry()

    const options = sentry.init.mock.calls[0][0]
    expect(options.beforeSend).toBe(scrubEvent)
    expect(options.dataCollection).toEqual({ userInfo: false, cookies: false, urlQueryParams: false })
    const names = options.integrations([{ name: 'Breadcrumbs' }, { name: 'BrowserSession' }, { name: 'Dedupe' }])
    expect(names).toEqual([{ name: 'Dedupe' }])
  })

  it('still logs uncaught and recoverable root errors', async () => {
    const { initSentry } = await load('https://k@o.ingest.sentry.io/1')
    const options = initSentry()
    const error = new Error('boom')

    options.onUncaughtError?.(error, { componentStack: '' })
    options.onRecoverableError?.(error, { componentStack: '' })

    expect(sentry.report).toHaveBeenCalledTimes(2)
    expect(console.error).toHaveBeenCalledTimes(2)
  })
})
