import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultRepository,
  isRepositoryRelease,
  isSlug,
  majorLines,
  OFFICIAL_REPOSITORY,
  parseDefaultThemeFile,
  parsePugThemeFile,
  parseThemeFileUrl,
  readOfficial,
  repositoryLabel,
  resolveTrack,
  SCHEMA_URL,
  startingTrack,
  type Track,
  themeFileUrl,
  unreachedRelease,
  updateNotice,
} from './repository'

describe('the default repository', () => {
  afterEach(() => vi.unstubAllEnvs())

  const build = (services: string, address = '') => {
    vi.stubEnv('VITE_PUG_SERVICES_ENABLED', services)
    vi.stubEnv('VITE_THEME_REPOSITORY', address)
  }
  const ACME = 'https://themes.acme.com'

  it.each([
    ['', '', null],
    ['', ACME, ACME],
    ['true', '', OFFICIAL_REPOSITORY],
    ['true', ACME, ACME],
  ])('with the switch at "%s" and the address "%s" it is %s', (services, address, expected) => {
    build(services, address)
    expect(defaultRepository()).toBe(expected)
  })

  it.each([
    [' true ', OFFICIAL_REPOSITORY],
    ['TRUE', null],
    ['1', null],
    ['false', null],
  ])('reads the switch "%s" as %s', (services, expected) => {
    build(services)
    expect(defaultRepository()).toBe(expected)
  })

  it('drops trailing slashes and keeps a path', () => {
    build('', 'https://cdn.acme.com/pug-themes/')
    expect(defaultRepository()).toBe('https://cdn.acme.com/pug-themes')
  })

  it('keeps an address in the form every other URL check expects', () => {
    build('', 'HTTPS://Themes.Acme.com/')
    expect(defaultRepository()).toBe('https://themes.acme.com')
  })

  it.each([
    'http://themes.acme.com',
    'themes.acme.com',
    'https://acme.com/?x=1',
    'https://acme.com/#top',
    'https://me:pw@acme.com',
  ])('ignores %s with one warning, and the switch decides', address => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    build('', address)
    expect(defaultRepository()).toBeNull()
    build('true', address)
    expect(defaultRepository()).toBe(OFFICIAL_REPOSITORY)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('VITE_THEME_REPOSITORY')
  })

  it('reads a file in the default repository, path included', () => {
    build('', 'https://cdn.acme.com/pug-themes')
    expect(parseDefaultThemeFile('https://cdn.acme.com/pug-themes/brand/1/theme.json')).toEqual({
      slug: 'brand',
      track: { kind: 'major', major: 1 },
    })
    expect(parseDefaultThemeFile('https://themes.pug.sh/clay/theme.json')).toBeNull()
  })

  it('reads nothing with no default, not even a same-origin path', () => {
    build('')
    expect(parseDefaultThemeFile('/clay/theme.json')).toBeNull()
    expect(parseDefaultThemeFile('https://themes.pug.sh/clay/theme.json')).toBeNull()
  })

  it('calls a file Pug’s only while Pug’s repository is the default', () => {
    const CLAY = 'https://themes.pug.sh/clay/theme.json'
    build('true')
    expect(parsePugThemeFile(CLAY)?.slug).toBe('clay')
    build('true', ACME)
    expect(parsePugThemeFile(CLAY)).toBeNull()
    expect(parsePugThemeFile(`${ACME}/brand/theme.json`)).toBeNull()
    build('')
    expect(parsePugThemeFile(CLAY)).toBeNull()
  })

  it('shows an address without its scheme', () => {
    expect(repositoryLabel('https://cdn.acme.com/pug-themes')).toBe('cdn.acme.com/pug-themes')
  })
})

describe('the repository convention', () => {
  it('takes slugs by the built-in id rule, except reserved ones', () => {
    expect(isSlug('clay')).toBe(true)
    expect(isSlug('warm-linen-2')).toBe(true)
    for (const bad of ['', 'Clay', 'clay_2', 'clay.json', 'a'.repeat(65), 'schema']) expect(isSlug(bad)).toBe(false)
  })

  it('starts a repository’s releases at major 1', () => {
    expect(isRepositoryRelease({ major: 1, minor: 0, patch: 0 })).toBe(true)
    expect(isRepositoryRelease({ major: 0, minor: 9, patch: 0 })).toBe(false)
  })

  it('serves the schema from the official repository', () => {
    expect(SCHEMA_URL).toBe('https://themes.pug.sh/schema/v1.json')
  })
})

const R = OFFICIAL_REPOSITORY
const CLAY = ['2.0.0', '1.4.1', '1.2.0', '1.0.0']

describe('official theme files', () => {
  it.each<[Track, string]>([
    [{ kind: 'latest' }, 'https://themes.pug.sh/clay/theme.json'],
    [{ kind: 'major', major: 1 }, 'https://themes.pug.sh/clay/1/theme.json'],
    [{ kind: 'exact', release: '1.2.0' }, 'https://themes.pug.sh/clay/1.2.0/theme.json'],
  ])('names %j at %s, and reads it back', (track, url) => {
    expect(themeFileUrl(R, 'clay', track)).toBe(url)
    expect(parseThemeFileUrl(R, url)).toEqual({ slug: 'clay', track })
  })

  it.each([
    'https://themes.pug.sh/clay',
    'https://themes.pug.sh/clay/theme.json?x=1',
    'https://themes.pug.sh/clay/0/theme.json',
    'https://themes.pug.sh/clay/01/theme.json',
    'https://themes.pug.sh/clay/0.9.0/theme.json',
    'https://themes.pug.sh/clay/1.0/theme.json',
    'https://themes.pug.sh/schema/theme.json',
    'https://themes.pug.sh/clay/1/2/theme.json',
    'https://themes.pug.sh/clay/9007199254740993/theme.json',
    'https://cdn.example.com/clay/theme.json',
  ])('reads %s as a plain URL', url => expect(parseThemeFileUrl(R, url)).toBeNull())
})

describe('following a theme’s releases', () => {
  it('resolves each track, a backport included', () => {
    expect(resolveTrack(CLAY, { kind: 'latest' })).toBe('2.0.0')
    expect(resolveTrack(CLAY, { kind: 'major', major: 1 })).toBe('1.4.1')
    expect(resolveTrack(CLAY, { kind: 'exact', release: '1.2.0' })).toBe('1.2.0')
    expect(resolveTrack(CLAY, { kind: 'major', major: 3 })).toBeNull()
    expect(resolveTrack(CLAY, { kind: 'exact', release: '1.3.0' })).toBeNull()
  })

  it('lists the major lines newest first, each with its newest release', () => {
    expect(majorLines(['1.0.0', '2.0.0', '1.4.1'])).toEqual([
      { major: 2, release: '2.0.0' },
      { major: 1, release: '1.4.1' },
    ])
  })

  it('starts a new pick on the newest major line', () => {
    expect(startingTrack(CLAY)).toEqual({ kind: 'major', major: 2 })
  })

  it('names the highest release a track won’t reach', () => {
    expect(unreachedRelease(CLAY, { kind: 'latest' })).toBeNull()
    expect(unreachedRelease(CLAY, { kind: 'major', major: 2 })).toBeNull()
    expect(unreachedRelease(CLAY, { kind: 'major', major: 1 })).toBe('2.0.0')
    expect(unreachedRelease(CLAY, { kind: 'exact', release: '1.0.0' })).toBe('2.0.0')
    expect(unreachedRelease(CLAY, { kind: 'exact', release: '2.0.0' })).toBeNull()
  })

  it('says what a track won’t reach, and how it stays put', () => {
    expect(updateNotice(CLAY, { kind: 'latest' })).toBeNull()
    expect(updateNotice(CLAY, { kind: 'major', major: 2 })).toBeNull()
    expect(updateNotice(CLAY, { kind: 'major', major: 1 })).toBe('2.0.0 is out. You stay on 1.x until you switch.')
    expect(updateNotice(CLAY, { kind: 'exact', release: '1.0.0' })).toBe('2.0.0 is out.')
  })

  it('reads a reference in words', () => {
    expect(readOfficial('Clay', { kind: 'major', major: 1 }, '1.1.0')).toBe('Clay, following 1.x (now 1.1.0)')
    expect(readOfficial('Clay', { kind: 'latest' }, '2.0.0')).toBe('Clay, latest (now 2.0.0)')
    expect(readOfficial('Clay', { kind: 'latest' })).toBe('Clay, latest')
    expect(readOfficial('Clay', { kind: 'exact', release: '1.1.0' })).toBe('Clay 1.1.0')
  })
})
