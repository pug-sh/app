import { describe, expect, it } from 'vitest'
import { eventIdentity, referrerDomain } from '@/components/live-map/live-visitors'

const event = (distinctId: string, auto?: Record<string, string>, custom?: Record<string, string>) => ({
  distinctId,
  autoProperties: auto,
  customProperties: custom,
})

describe('eventIdentity', () => {
  it('prefers a name trait over an email trait, in either bag', () => {
    expect(eventIdentity(event('u_1', { $name: 'Ada Lovelace', $email: 'ada@example.com' })).label).toBe('Ada Lovelace')
    expect(eventIdentity(event('u_1', { $email: 'ada@example.com' }, { name: 'Ada Lovelace' })).label).toBe(
      'Ada Lovelace',
    )
  })

  it('composes a name from first/last traits', () => {
    expect(eventIdentity(event('u_1', undefined, { first_name: 'Ada', last_name: 'Lovelace' })).label).toBe(
      'Ada Lovelace',
    )
  })

  it('falls back to an email trait when no name resolves', () => {
    const identity = eventIdentity(event('u_1', undefined, { email: 'ada@example.com' }))
    expect(identity).toEqual({ label: 'ada@example.com', isFallback: false })
  })

  it('falls back to a shortened distinct id, marked so the UI keeps it in mono', () => {
    const identity = eventIdentity(event('01J8ZC7Q9K4M2N6P8R0T2V4X6Z'))
    expect(identity).toEqual({ label: '01J8ZC…4X6Z', isFallback: true })
  })

  it('leaves a short distinct id whole', () => {
    expect(eventIdentity(event('u_1')).label).toBe('u_1')
  })

  // A distinct id that is an email is a name, not an opaque handle — it stays whole and un-mono'd.
  it('treats an email distinct id as an identity', () => {
    expect(eventIdentity(event('someone.long@example.com'))).toEqual({
      label: 'someone.long@example.com',
      isFallback: false,
    })
  })

  it('never renders an empty label', () => {
    expect(eventIdentity(event('')).label).toBe('anonymous')
  })
})

describe('referrerDomain', () => {
  it('uses the server-derived domain', () => {
    expect(referrerDomain({ $referrerDomain: 'google.com' })).toBe('google.com')
  })

  // The backend blanks this on self-referral; parsing $referrer here would undo that.
  it('stays empty when blanked, even with a raw referrer present', () => {
    expect(referrerDomain({ $referrerDomain: '', $referrer: 'https://acme.com/pricing' })).toBeUndefined()
    expect(referrerDomain(undefined)).toBeUndefined()
  })
})
