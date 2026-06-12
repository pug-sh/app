import { describe, expect, it } from 'bun:test'
import {
  countryCodeToFlag,
  isCountryCode,
  TILE_ICON_EMOJIS,
  twemojiFlagSrc,
  twemojiSrc,
  usesTwemoji,
} from '@/lib/twemoji'

describe('isCountryCode', () => {
  it('accepts two ASCII letters in either case', () => {
    expect(isCountryCode('us')).toBe(true)
    expect(isCountryCode('US')).toBe(true)
    expect(isCountryCode('In')).toBe(true)
  })

  it('rejects wrong length, non-letters, and empty/undefined', () => {
    expect(isCountryCode('usa')).toBe(false)
    expect(isCountryCode('u')).toBe(false)
    expect(isCountryCode('u1')).toBe(false)
    expect(isCountryCode('12')).toBe(false)
    expect(isCountryCode('')).toBe(false)
    expect(isCountryCode(undefined)).toBe(false)
  })
})

describe('countryCodeToFlag', () => {
  it('maps an ISO alpha-2 code to its regional-indicator emoji', () => {
    expect(countryCodeToFlag('us')).toBe('🇺🇸')
    expect(countryCodeToFlag('IN')).toBe('🇮🇳')
  })

  it('is case-insensitive', () => {
    expect(countryCodeToFlag('gb')).toBe(countryCodeToFlag('GB'))
  })
})

describe('twemojiFlagSrc', () => {
  it('derives the bundled flag SVG path from the codepoints', () => {
    expect(twemojiFlagSrc('us')).toBe('/twemoji/flags/1f1fa-1f1f8.svg')
    expect(twemojiFlagSrc('in')).toBe('/twemoji/flags/1f1ee-1f1f3.svg')
  })

  it('normalizes casing to the same lowercase-codepoint filename', () => {
    expect(twemojiFlagSrc('IN')).toBe('/twemoji/flags/1f1ee-1f1f3.svg')
    expect(twemojiFlagSrc('In')).toBe('/twemoji/flags/1f1ee-1f1f3.svg')
  })

  it('handles the additive math across the alphabet boundaries', () => {
    expect(twemojiFlagSrc('gb')).toBe('/twemoji/flags/1f1ec-1f1e7.svg')
    expect(twemojiFlagSrc('de')).toBe('/twemoji/flags/1f1e9-1f1ea.svg')
    expect(twemojiFlagSrc('jp')).toBe('/twemoji/flags/1f1ef-1f1f5.svg')
    expect(twemojiFlagSrc('za')).toBe('/twemoji/flags/1f1ff-1f1e6.svg')
  })
})

describe('twemojiSrc', () => {
  it('derives the tile SVG path with no variation selector', () => {
    expect(twemojiSrc('📈')).toBe('/twemoji/1f4c8.svg')
    expect(twemojiSrc('⚡')).toBe('/twemoji/26a1.svg')
    expect(twemojiSrc('✨')).toBe('/twemoji/2728.svg')
  })

  it('produces a bundled path for every tile-palette emoji', () => {
    for (const emoji of TILE_ICON_EMOJIS) {
      expect(twemojiSrc(emoji)).toMatch(/^\/twemoji\/[0-9a-f-]+\.svg$/)
    }
  })
})

describe('usesTwemoji', () => {
  it('is true for bundled tile emoji and false otherwise', () => {
    expect(usesTwemoji('📈')).toBe(true)
    expect(usesTwemoji('🔥')).toBe(true)
    expect(usesTwemoji('🦄')).toBe(false)
    expect(usesTwemoji('')).toBe(false)
  })

  it('narrows its argument to the bundled tile-emoji union', () => {
    const emoji: string = '📈'
    if (usesTwemoji(emoji)) {
      // Type-level assertion: inside the guard, `emoji` is a TILE_ICON_EMOJIS member,
      // so it is assignable to that readonly tuple's element type.
      const narrowed: (typeof TILE_ICON_EMOJIS)[number] = emoji
      expect(narrowed).toBe('📈')
    }
  })
})
