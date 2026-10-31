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

  it('stops saying it failed while it tries again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const store = createStore()
    await loaded(store, 'failed')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    const unsubscribe = store.sub(themeCatalogAtom, () => {})
    expect(store.get(themeCatalogAtom).status).toBe('loading')
    unsubscribe()
  })

  // Moving between pages while a read hangs starts a second one. The first failing afterwards used to put
  // the failure line over a list that had loaded.
  it('lets the latest read decide when an older one finishes last', async () => {
    let failOlder = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            failOlder = () => reject(new TypeError('Failed to fetch'))
          }),
      ),
    )
    const store = createStore()
    store.sub(themeCatalogAtom, () => {})()
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    await loaded(store, 'ok')
    failOlder()
    await new Promise(resolve => setTimeout(resolve))
    expect(store.get(themeCatalogAtom).status).toBe('ok')
  })
})
