import { describe, expect, it } from 'vitest'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { deviceBreakdown, eventIdentity, resolveDeviceType } from '@/components/live-map/live-visitors'

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

describe('resolveDeviceType', () => {
  // The native SDKs send no $mobile at all, and the backend fills it from the Dart HTTP client's
  // User-Agent — always false. Falling through to it put every Flutter phone in desktop.
  it('takes the native SDK’s $deviceType over an absent or contradicting $mobile', () => {
    expect(resolveDeviceType({ $deviceType: 'mobile' })).toBe('mobile')
    expect(resolveDeviceType({ $deviceType: 'mobile', $mobile: 'false' })).toBe('mobile')
    expect(resolveDeviceType({ $deviceType: 'tv', $mobile: 'false' })).toBe('tv')
  })

  it('falls back to $mobile for the web SDK, which sends no $deviceType', () => {
    expect(resolveDeviceType({ $mobile: 'true' })).toBe('mobile')
    expect(resolveDeviceType({ $mobile: 'false' })).toBe('desktop')
    expect(resolveDeviceType(undefined)).toBe('desktop')
  })

  it('ignores a $deviceType it has no bucket for rather than inventing one', () => {
    expect(resolveDeviceType({ $deviceType: 'watch', $mobile: 'true' })).toBe('mobile')
  })

  // The React Native SDK sends $platform and $deviceModel but no $deviceType, so before this rung it
  // fell to $mobile and every RN phone counted as desktop — the same bug, one SDK over.
  it('reads a mobile $platform when the SDK sent no $deviceType', () => {
    expect(resolveDeviceType({ $platform: 'android' })).toBe('mobile')
    expect(resolveDeviceType({ $platform: 'ios', $mobile: 'false' })).toBe('mobile')
  })

  // Neither names a device class, and both would land in desktop anyway — claiming the mobile
  // bucket for them is the guess this ladder exists to avoid.
  it('leaves the desktop, server and web platforms to the rungs below', () => {
    expect(resolveDeviceType({ $platform: 'macos' })).toBe('desktop')
    expect(resolveDeviceType({ $platform: 'server' })).toBe('desktop')
    expect(resolveDeviceType({ $platform: 'web', $mobile: 'true' })).toBe('mobile')
  })
})

describe('deviceBreakdown', () => {
  it('counts tv separately instead of folding it into desktop', () => {
    const visitors = [
      event('a', { $deviceType: 'tv' }),
      event('b', { $deviceType: 'mobile' }),
      event('c', { $mobile: 'true' }),
      event('d', { $mobile: 'false' }),
    ] as ActivityEvent[]
    expect(deviceBreakdown(visitors)).toEqual({ desktop: 1, mobile: 2, tv: 1 })
  })
})
