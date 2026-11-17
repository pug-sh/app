import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serveByUrl } from '@/test/serve'
import { fetchFeed, parseFeed } from './feed'

const entry = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug,
  title: `Title ${slug}`,
  summary: `**${slug}**`,
  date: '2026-11-10',
  tags: ['Dashboard'],
  pinned: false,
  url: `https://docs.pug.sh/changelog/${slug}/`,
  ...extra,
})

const feed = (entries: unknown[], version: unknown = 1) => JSON.stringify({ version, entries })

beforeEach(() => {
  vi.stubEnv('VITE_CHANGELOG_ENABLED', 'true')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parseFeed', () => {
  it('reads entries newest first', () => {
    const read = parseFeed(feed([entry('old', { date: '2026-11-04' }), entry('new', { date: '2026-11-17' })]))
    expect(read?.map(e => e.slug)).toEqual(['new', 'old'])
    expect(read?.[0]).toEqual({ ...entry('new', { date: '2026-11-17' }) })
  })

  it.each([
    ['text that is not JSON', 'not json'],
    ['a newer format', feed([entry('a')], 2)],
    ['a feed with no entries list', JSON.stringify({ version: 1 })],
  ])('refuses %s', (_kind, text) => {
    expect(parseFeed(text)).toBeNull()
  })

  it.each([
    ['no slug', { slug: '' }],
    ['no title', { title: ' ' }],
    ['a date that is not a day', { date: 'Nov 10' }],
    ['a page that is not https', { url: 'http://docs.pug.sh/changelog/a/' }],
    ['a day that does not exist', { date: '2026-13-01' }],
    ['a day past the end of its month', { date: '2026-02-30' }],
    ['February 29 outside a leap year', { date: '2026-02-29' }],
  ])('leaves out an entry with %s and keeps the rest', (_kind, bad) => {
    expect(parseFeed(feed([entry('bad', bad), entry('good')]))?.map(e => e.slug)).toEqual(['good'])
  })

  it('keeps February 29 in a leap year', () => {
    expect(parseFeed(feed([entry('leap', { date: '2024-02-29' })]))?.map(e => e.date)).toEqual(['2024-02-29'])
  })

  it('keeps the first of two entries with one slug', () => {
    expect(parseFeed(feed([entry('a'), entry('a', { title: 'Second' })]))?.map(e => e.title)).toEqual(['Title a'])
  })

  it('defaults what an entry may leave out or get wrong', () => {
    const [read] = parseFeed(feed([entry('a', { summary: 3, tags: ['x', 4], pinned: 'yes' })])) ?? []
    expect(read).toMatchObject({ summary: '', tags: ['x'], pinned: false })
  })
})

describe('fetchFeed', () => {
  it.each(['true', ' true '])('reads the docs feed when the deployment turns it on (%j)', async enabled => {
    vi.stubEnv('VITE_CHANGELOG_ENABLED', enabled)
    serveByUrl({ 'https://docs.pug.sh/changelog/feed.json': feed([entry('a')]) })
    expect((await fetchFeed())?.map(e => e.slug)).toEqual(['a'])
  })

  it.each(['', 'yes', 'TRUE '])('asks for nothing unless the deployment turns it on (%j)', async enabled => {
    vi.stubEnv('VITE_CHANGELOG_ENABLED', enabled)
    const fetcher = serveByUrl({ 'https://docs.pug.sh/changelog/feed.json': feed([entry('a')]) })
    expect(await fetchFeed()).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each(['true', ' true'])('asks for nothing when air-gapped, even turned on (%j)', async airGap => {
    vi.stubEnv('VITE_AIR_GAP', airGap)
    const fetcher = serveByUrl({ 'https://docs.pug.sh/changelog/feed.json': feed([entry('a')]) })
    expect(await fetchFeed()).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
