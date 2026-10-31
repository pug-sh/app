import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeResponse } from '@/test/fake-response'
import { CLAY_LIST, clayFile, listOf } from '@/test/theme-repository'
import { fetchCatalog, parseList } from './catalog'

const slugsAndReleases = (text: string) => {
  const read = parseList(text)
  return read.ok ? read.themes.map(theme => [theme.slug, theme.releases, theme.family.release]) : null
}

describe('parseList', () => {
  it('reads each theme’s slug, its releases highest first, and its latest file', () => {
    const text = listOf({ slug: 'clay', releases: ['1.9.0', '2.0.0', '1.10.0'], latest: clayFile('2.0.0') })
    expect(slugsAndReleases(text)).toEqual([['clay', ['2.0.0', '1.10.0', '1.9.0'], '2.0.0']])
  })

  it('leaves out an entry it can’t use, and keeps the rest', () => {
    const text = listOf(
      { slug: 'Bad Slug', releases: ['1.0.0'], latest: clayFile('1.0.0') },
      { slug: 'schema', releases: ['1.0.0'], latest: clayFile('1.0.0') },
      { slug: 'no-release', releases: ['0.1.0', 'v1'], latest: clayFile('1.0.0') },
      { slug: 'broken', releases: ['1.0.0'], latest: { version: 1, name: 'Broken', variants: {} } },
      { slug: 'missing', releases: ['1.0.0'], latest: null },
      { slug: 'clay', releases: ['1.0.0'], latest: clayFile('1.0.0') },
      { slug: 'clay', releases: ['9.0.0'], latest: clayFile('9.0.0') },
    )
    expect(slugsAndReleases(text)).toEqual([['clay', ['1.0.0'], '1.0.0']])
  })

  it('refuses a list from a newer format, or anything that isn’t a list', () => {
    expect(parseList(JSON.stringify({ version: 2, themes: [] }))).toEqual({ ok: false })
    expect(parseList('not json')).toEqual({ ok: false })
    expect(parseList(JSON.stringify(clayFile('1.0.0')))).toEqual({ ok: false })
  })
})

describe('fetchCatalog', () => {
  // A valid list padded to a size with whitespace JSON allows, so only the limit can refuse it.
  const KB = 1024
  const listOfBytes = (bytes: number) => CLAY_LIST + ' '.repeat(bytes - CLAY_LIST.length)
  const answer = (response: Response) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    )

  afterEach(() => vi.unstubAllGlobals())

  it('reads the repository’s list.json', async () => {
    const fetcher = vi.fn(async () => fakeResponse(CLAY_LIST))
    vi.stubGlobal('fetch', fetcher)
    const read = await fetchCatalog('https://themes.pug.sh')
    expect(read.ok && read.themes.map(theme => theme.slug)).toEqual(['clay'])
    expect(fetcher).toHaveBeenCalledWith(
      'https://themes.pug.sh/list.json',
      expect.objectContaining({ credentials: 'omit' }),
    )
  })

  it('gives up on a list that says it’s over 512 KB', async () => {
    answer(fakeResponse(CLAY_LIST, { headers: { 'content-length': String(512 * KB + 1) } }))
    expect(await fetchCatalog('https://themes.pug.sh')).toEqual({ ok: false })
  })

  it('gives up on a list that turns out over 512 KB', async () => {
    answer(fakeResponse(listOfBytes(512 * KB + 1)))
    expect(await fetchCatalog('https://themes.pug.sh')).toEqual({ ok: false })
  })

  // A list embeds every theme's latest file, so it's held to its own limit, not a theme file's 64 KB.
  it('reads a list at 512 KB', async () => {
    answer(fakeResponse(listOfBytes(512 * KB), { headers: { 'content-length': String(512 * KB) } }))
    expect((await fetchCatalog('https://themes.pug.sh')).ok).toBe(true)
  })
})
