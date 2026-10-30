import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeResponse } from '@/test/fake-response'
import { CLAY_LIST, clayFile, listOf } from '@/test/theme-repository'
import { fetchCatalog, MAX_LIST_BYTES, parseList } from './catalog'

const slugsAndReleases = (text: string) => {
  const read = parseList(text)
  return read.ok ? read.themes.map(theme => [theme.slug, theme.releases, theme.family.release]) : null
}

describe('parseList', () => {
  it('reads each theme’s slug, its releases highest first, and its latest file', () => {
    const text = listOf({ slug: 'clay', releases: ['1.0.0', '2.0.0', '1.10.0'], latest: clayFile('2.0.0') })
    expect(slugsAndReleases(text)).toEqual([['clay', ['2.0.0', '1.10.0', '1.0.0'], '2.0.0']])
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

  it('gives up on a list over 512 KB', async () => {
    const huge = fakeResponse('x', { headers: { 'content-length': String(MAX_LIST_BYTES + 1) } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => huge),
    )
    expect(await fetchCatalog('https://themes.pug.sh')).toEqual({ ok: false })
  })
})
