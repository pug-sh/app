import { describe, expect, it } from 'bun:test'
import { formatCountryName, formatLocationLabel, formatLocationPrimary } from '@/lib/location'

describe('formatCountryName', () => {
  it('returns an em-dash for empty/undefined input', () => {
    expect(formatCountryName(undefined)).toBe('—')
    expect(formatCountryName('')).toBe('—')
  })

  it('passes through codes that are not two characters', () => {
    expect(formatCountryName('USA')).toBe('USA')
  })

  it('resolves a valid ISO alpha-2 code to its English region name', () => {
    expect(formatCountryName('us')).toBe('United States')
    expect(formatCountryName('de')).toBe('Germany')
  })

  it('falls back to the raw code when Intl rejects the structure', () => {
    expect(formatCountryName('U1')).toBe('U1')
  })
})

describe('formatLocationLabel', () => {
  it('joins city and resolved country name', () => {
    expect(formatLocationLabel('Berlin', 'de')).toBe('Berlin, Germany')
  })

  it('shows only the present part', () => {
    expect(formatLocationLabel('Berlin', undefined)).toBe('Berlin')
    expect(formatLocationLabel(undefined, 'fr')).toBe('France')
    expect(formatLocationLabel('Berlin', '')).toBe('Berlin')
  })

  it('is empty when neither city nor country is present', () => {
    expect(formatLocationLabel(undefined, undefined)).toBe('')
  })
})

describe('formatLocationPrimary', () => {
  it('prefers the city when present', () => {
    expect(formatLocationPrimary('Paris', 'fr')).toBe('Paris')
    expect(formatLocationPrimary('Paris', undefined)).toBe('Paris')
  })

  it('falls back to the country name when there is no city', () => {
    expect(formatLocationPrimary(undefined, 'de')).toBe('Germany')
  })

  it('is empty when neither city nor country is present', () => {
    expect(formatLocationPrimary(undefined, undefined)).toBe('')
  })
})
