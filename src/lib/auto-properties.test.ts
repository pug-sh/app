import { describe, expect, it } from 'vitest'
import { deviceModelOf, platformOf, referrerDomain } from '@/lib/auto-properties'

describe('deviceModelOf', () => {
  it('reads the web $device and the Flutter $deviceModel', () => {
    expect(deviceModelOf({ $device: 'Pixel 8' })).toBe('Pixel 8')
    expect(deviceModelOf({ $deviceModel: 'SM-S918B' })).toBe('SM-S918B')
  })

  // Prefixing it produced "Apple iPhone 15 Pro"; the overview's Devices panel ranks the model alone.
  it('leaves $deviceManufacturer out of the label', () => {
    expect(deviceModelOf({ $deviceModel: 'iPhone 15 Pro', $deviceManufacturer: 'Apple' })).toBe('iPhone 15 Pro')
  })

  it('is undefined when neither SDK sent a model', () => {
    expect(deviceModelOf({ $mobile: 'true' })).toBeUndefined()
  })
})

describe('platformOf', () => {
  it('reads the SDK target the read path merges back off the promoted column', () => {
    expect(platformOf({ $platform: 'android' })).toBe('android')
    expect(platformOf({})).toBeUndefined()
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
