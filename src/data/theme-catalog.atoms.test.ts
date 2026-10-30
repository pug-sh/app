import { createStore } from 'jotai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serveByUrl } from '@/test/serve'
import { CLAY_LIST, LIST_URL } from '@/test/theme-repository'
import { themeCatalogAtom } from './theme-catalog.atoms'

const loaded = async (store: ReturnType<typeof createStore>, status: 'ok' | 'failed') => {
  const unsubscribe = store.sub(themeCatalogAtom, () => {})
  await vi.waitFor(() => expect(store.get(themeCatalogAtom).status).toBe(status))
  unsubscribe()
}

describe('the theme catalog', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads when something starts reading it', async () => {
    const fetcher = serveByUrl({ [LIST_URL]: CLAY_LIST })
    const store = createStore()
    expect(store.get(themeCatalogAtom)).toEqual({ themes: [], status: 'loading' })
    expect(fetcher).not.toHaveBeenCalled()
    await loaded(store, 'ok')
    expect(store.get(themeCatalogAtom).themes.map(theme => theme.slug)).toEqual(['clay'])
  })

  it('keeps the themes it had when a later read fails, and says so', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    const store = createStore()
    await loaded(store, 'ok')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await loaded(store, 'failed')
    expect(store.get(themeCatalogAtom).themes.map(theme => theme.slug)).toEqual(['clay'])
  })
})
