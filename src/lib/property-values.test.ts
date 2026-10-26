import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COUNTRY_PROPERTY,
  knownPropertyValues,
  propertyValueKeywords,
  propertyValueLabel,
  resolvePropertyValue,
} from './property-values'
import { twemojiFlagSrc } from './twemoji'

describe('propertyValueLabel', () => {
  it('names a country code', () => {
    expect(propertyValueLabel('$country', 'IN')).toBe('India')
    expect(propertyValueLabel('$country', 'US')).toBe('United States')
  })

  it('shows a $country outside the ISO set as it was sent', () => {
    // Intl names ZZ "Unknown Region", and a lowercase "in" is not what a filter on India (IN) matches.
    expect(propertyValueLabel('$country', 'ZZ')).toBe('ZZ')
    expect(propertyValueLabel('$country', 'in')).toBe('in')
  })

  it('names continents and locales', () => {
    expect(propertyValueLabel('$continent', 'EU')).toBe('Europe')
    expect(propertyValueLabel('$continent', 'T1')).toBe('Tor network')
    expect(propertyValueLabel('$locale', 'en-US')).toBe('English (United States)')
    expect(propertyValueLabel('$locale', 'not a tag')).toBe('not a tag')
  })

  // Ingest stores tags canonical, so "en-us" matches nothing; Intl would name it anyway, and "und" as "root".
  it('shows a $locale that is not a canonical, nameable tag as it was sent', () => {
    expect(propertyValueLabel('$locale', 'en-us')).toBe('en-us')
    expect(propertyValueLabel('$locale', 'und')).toBe('und')
    expect(propertyValueLabel('$locale', 'Purchase')).toBe('Purchase')
  })

  it('leaves other properties alone', () => {
    expect(propertyValueLabel('$browser', 'Chrome')).toBe('Chrome')
    expect(propertyValueLabel('country', 'IN')).toBe('IN')
  })
})

describe('resolvePropertyValue', () => {
  it.each([
    ['india', 'IN'],
    [' INDIA ', 'IN'],
    ['in', 'IN'],
    ['United States', 'US'],
    ['usa', 'US'],
    ['uk', 'GB'],
    ['Turkey', 'TR'],
    ['curacao', 'CW'],
    ["cote d'ivoire", 'CI'],
    ['Saint Kitts and Nevis', 'KN'],
    ['hong kong', 'HK'],
    ['macao', 'MO'],
    ['myanmar', 'MM'],
    ['burma', 'MM'],
    ['palestine', 'PS'],
    ['bosnia', 'BA'],
    ['united states of america', 'US'],
    ['the netherlands', 'NL'],
  ])('resolves %j to %s', (input, code) => {
    expect(resolvePropertyValue('$country', input)).toBe(code)
  })

  it('keeps text it cannot place as typed', () => {
    expect(resolvePropertyValue('$country', 'Atlantis')).toBe('Atlantis')
    expect(resolvePropertyValue('$country', 'Ind')).toBe('Ind')
  })

  it('resolves continents and leaves open sets alone', () => {
    expect(resolvePropertyValue('$continent', 'north america')).toBe('NA')
    expect(resolvePropertyValue('$locale', 'english')).toBe('english')
    expect(resolvePropertyValue('$browser', 'chrome')).toBe('chrome')
  })

  it('resolves every name and alias back to its own code', () => {
    const strays = [COUNTRY_PROPERTY, '$continent'].flatMap(property =>
      knownPropertyValues(property).flatMap(value =>
        propertyValueKeywords(property, value).filter(keyword => resolvePropertyValue(property, keyword) !== value),
      ),
    )
    expect(strays).toEqual([])
  })
})

// The picker lists every code with its flag, and public/ never enters the module graph: a code
// without a file is an <img> that 404s behind aria-hidden. 250 is the backend's geo.countryCodes.
it('lists 250 country codes, each with a flag file and a name of its own', () => {
  const codes = knownPropertyValues(COUNTRY_PROPERTY)
  expect(codes).toHaveLength(250)
  const flags = new Set(readdirSync(join(process.cwd(), 'public/twemoji/flags')))
  expect(codes.filter(code => !flags.has(basename(twemojiFlagSrc(code))))).toEqual([])

  const names = codes.map(code => propertyValueLabel(COUNTRY_PROPERTY, code))
  expect(names.filter((name, i) => name === codes[i])).toEqual([])
  expect(new Set(names).size).toBe(codes.length)
})
