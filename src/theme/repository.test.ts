import { describe, expect, it } from 'vitest'
import {
  isRepositoryRelease,
  isSlug,
  majorLines,
  OFFICIAL_REPOSITORY,
  parseThemeFileUrl,
  readOfficial,
  resolveTrack,
  SCHEMA_URL,
  startingTrack,
  type Track,
  themeFileUrl,
  unreachedRelease,
  updateNotice,
} from './repository'

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
