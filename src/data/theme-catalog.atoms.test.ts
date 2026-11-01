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
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('loads when something starts reading it', async () => {
    const fetcher = serveByUrl({ [LIST_URL]: CLAY_LIST })
    const store = createStore()
    expect(store.get(themeCatalogAtom)).toEqual({ themes: [], status: 'loading' })
    expect(fetcher).not.toHaveBeenCalled()
    await loaded(store, 'ok')
    expect(store.get(themeCatalogAtom).themes.map(theme => theme.slug)).toEqual(['clay'])
  })

  it('fetches nothing and fails nothing with no default repository', async () => {
    vi.stubEnv('VITE_PUG_SERVICES_ENABLED', '')
    const fetcher = serveByUrl({ [LIST_URL]: CLAY_LIST })
    const store = createStore()
    await loaded(store, 'ok')
    expect(fetcher).not.toHaveBeenCalled()
    expect(store.get(themeCatalogAtom).themes).toEqual([])
  })

  it('reads a named repository instead of Pug’s, and stamps its themes', async () => {
    vi.stubEnv('VITE_THEME_REPOSITORY', 'https://cdn.acme.com/pug-themes/')
    const fetcher = serveByUrl({ 'https://cdn.acme.com/pug-themes/list.json': CLAY_LIST })
    const store = createStore()
    await loaded(store, 'ok')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(store.get(themeCatalogAtom).themes[0].repository).toBe('https://cdn.acme.com/pug-themes')
  })

  it('says so when a named repository is down', async () => {
    vi.stubEnv('VITE_PUG_SERVICES_ENABLED', '')
    vi.stubEnv('VITE_THEME_REPOSITORY', 'https://themes.acme.com')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await loaded(createStore(), 'failed')
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
