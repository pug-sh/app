import { describe, expect, it } from 'vitest'
import { maskEventUrls } from './sanitize-url'

const event = (autoProperties: Record<string, string>, customProperties = {}, kind = 'page_view') => ({
  kind,
  autoProperties,
  customProperties,
})

describe('maskEventUrls', () => {
  it('masks path IDs and drops the query on both URL auto-properties', () => {
    const masked = maskEventUrls(
      event({
        $url: 'https://app.pug.sh/profiles/jane@example.com/sessions/01J2?ef=%5B%7B%22value%22%3A%22jane%22%7D%5D',
        $referrer: 'https://app.pug.sh/shared/tok_live_abc#x',
      }),
    )

    expect(masked.autoProperties.$url).toBe('https://app.pug.sh/profiles/:profileId/sessions/:sessionId')
    expect(masked.autoProperties.$referrer).toBe('https://app.pug.sh/shared/:shareId')
  })

  // A direct visit reports '' — resolving that against the origin would report the landing page as
  // its own referrer, i.e. invent a navigation that never happened.
  it('leaves a referrer-less page view empty', () => {
    expect(maskEventUrls(event({ $url: 'https://app.pug.sh/overview', $referrer: '' })).autoProperties.$referrer).toBe(
      '',
    )
  })

  it('masks a form action, which is a custom property rather than an auto one', () => {
    const masked = maskEventUrls(
      event({ $url: 'https://app.pug.sh/sign-in', $referrer: '' }, { action: '/magic-link?token=live' }, 'form_submit'),
    )

    expect(masked.customProperties).toEqual({ action: 'http://localhost:3000/magic-link' })
  })

  // customProperties values are the caller's own types, so `action` is not necessarily a URL string.
  it('leaves a non-string action alone', () => {
    const masked = maskEventUrls(event({ $url: 'https://app.pug.sh/', $referrer: '' }, { action: 42 }, 'form_submit'))

    expect(masked.customProperties).toEqual({ action: 42 })
  })

  // `form.action` reflects raw attribute text when the browser can't parse it, so this is reachable
  // — and a throw here costs the whole event, not just the one URL.
  it('blanks a URL too malformed to parse', () => {
    const masked = maskEventUrls(
      event({ $url: 'http://[', $referrer: 'https://%' }, { action: 'http://a b' }, 'form_submit'),
    )

    expect(masked.autoProperties.$url).toBe('')
    expect(masked.autoProperties.$referrer).toBe('')
    expect(masked.customProperties).toEqual({ action: '' })
  })
})
