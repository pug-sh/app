import { describe, expect, it } from 'vitest'
import { formatReference, parsePastedUrl, parseReference, type ThemeReference } from './reference'

const LINEN = 'https://themes.pug.sh/linen/theme.json'

describe('parseReference', () => {
  it.each([
    ['pug', { target: 'pug' }],
    ['pug#dark', { target: 'pug', pin: 'dark' }],
    ['installed-3f9a01bc', { target: 'installed-3f9a01bc' }],
    [LINEN, { target: LINEN }],
    [`${LINEN}#light`, { target: LINEN, pin: 'light' }],
  ])('reads %s', (value, expected) => {
    expect(parseReference(value)).toEqual(expected)
  })

  // A project's stored default can still name one. Their looks are modes of Pug now, which each member chooses.
  it.each([
    ['pug-colourblind', { target: 'pug' }],
    ['pug-high-contrast', { target: 'pug' }],
    ['pug-colourblind#dark', { target: 'pug', pin: 'dark' }],
  ])('reads a retired id as Pug: %s', (value, expected) => {
    expect(parseReference(value)).toEqual(expected)
  })

  it.each([
    '',
    '#dark',
    'pug#dim',
    'pug#',
    'Pug',
    'http://themes.pug.sh/t.json',
    `https://x/${'a'.repeat(2048)}`,
    // The URL parser refuses a port past 65535.
    'https://themes.pug.sh:99999/t.json',
  ])('refuses %j', value => {
    expect(parseReference(value)).toBeNull()
  })

  it('round-trips through formatReference', () => {
    for (const value of ['pug', 'pug#light', `${LINEN}#dark`]) {
      expect(formatReference(parseReference(value) as ThemeReference)).toBe(value)
    }
  })
})

describe('parsePastedUrl', () => {
  it('adds https, and tries the repository folder second', () => {
    expect(parsePastedUrl(' themes.pug.sh/linen ')).toEqual({
      urls: ['https://themes.pug.sh/linen', LINEN],
    })
  })

  it('keeps a direct link first, and carries its pin', () => {
    expect(parsePastedUrl('https://raw.githubusercontent.com/acme/brand/main/pug.json#dark')).toEqual({
      urls: [
        'https://raw.githubusercontent.com/acme/brand/main/pug.json',
        'https://raw.githubusercontent.com/acme/brand/main/pug.json/theme.json',
      ],
      pin: 'dark',
    })
  })

  // The server refuses an uppercase host; the URL parser lowercases it.
  it('lowercases the host', () => {
    expect(parsePastedUrl('https://Themes.Pug.sh/linen/theme.json')?.urls[0]).toBe(LINEN)
  })

  it.each(['', '   ', 'http://themes.pug.sh/linen', 'ftp://x/y', 'https://'])('refuses %j', input => {
    expect(parsePastedUrl(input)).toBeNull()
  })
})
