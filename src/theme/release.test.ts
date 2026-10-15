import { describe, expect, it } from 'vitest'
import { compareReleases, formatRelease, parseRelease } from './release'

const release = (text: string) => {
  const parsed = parseRelease(text)
  if (!parsed) throw new Error(`not a release: ${text}`)
  return parsed
}

describe('parseRelease', () => {
  it('reads MAJOR.MINOR.PATCH as numbers', () => {
    expect(parseRelease('1.10.0')).toEqual({ major: 1, minor: 10, patch: 0 })
    expect(parseRelease('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0 })
  })

  it.each(['1.0', '1.0.0.0', 'v1.0.0', '01.0.0', '1.00.0', '1.0.0-beta', '1.0.0+build', ' 1.0.0', '', '1.a.0'])(
    'refuses %j',
    text => expect(parseRelease(text)).toBeNull(),
  )

  it('refuses one over 32 characters, or with a number it can’t hold exactly', () => {
    expect(parseRelease(`1.0.${'1'.repeat(29)}`)).toBeNull()
    expect(parseRelease('1.99999999999999999999.0')).toBeNull()
  })
})

describe('compareReleases', () => {
  it('orders by number, not by text', () => {
    const sorted = ['1.10.0', '1.2.0', '2.0.0', '1.2.10', '1.2.9'].map(release).sort(compareReleases).map(formatRelease)
    expect(sorted).toEqual(['1.2.0', '1.2.9', '1.2.10', '1.10.0', '2.0.0'])
  })
})
