import { create } from '@bufbuild/protobuf'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { fetchedThemesAtom } from '@/data/theme.atoms'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { fakeResponse } from '@/test/fake-response'
import { serveByUrl } from '@/test/serve'
import { CLAY_LIST, clayFile, LIST_URL } from '@/test/theme-repository'
import type { RemoteId } from '@/theme/library'
import DefaultThemeControls from './default-theme-controls'

const CLAY_1 = 'https://themes.pug.sh/clay/1/theme.json'
const CLAY_2 = 'https://themes.pug.sh/clay/2/theme.json'
const CLAY_ONE_RELEASE = 'https://themes.pug.sh/clay/1.0.0/theme.json'
const LIGHT_ONLY = JSON.stringify({ ...clayFile('1.0.0'), variants: { light: clayFile('1.0.0').variants.light } })

const mount = ({
  current,
  saving = false,
  fetched = {},
}: {
  current: string
  saving?: boolean
  fetched?: Record<RemoteId, string>
}) => {
  const onSave = vi.fn()
  const store = createStore()
  store.set(fetchedThemesAtom, fetched)
  store.set(activeProjectAtom, create(ProjectSchema, { id: 'p1', displayName: 'Acme', defaultTheme: current }))
  render(
    <Provider store={store}>
      <DefaultThemeControls current={current} saving={saving} onSave={onSave} />
    </Provider>,
  )
  return { onSave, store }
}

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')
const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name })
const onlyRelease = async (release: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Only one release' }))
  fireEvent.click(await screen.findByRole('menuitemradio', { name: release }))
}
// The catalog answers, and every other URL waits on what the test returns.
const deferred = () => {
  const answer = { current: (_: Response) => {} }
  onTestFinished(() => answer.current(fakeResponse('', { status: 404 })))
  vi.stubGlobal(
    'fetch',
    vi.fn((address: string) => {
      if (address === LIST_URL) return Promise.resolve(fakeResponse(CLAY_LIST))
      return new Promise<Response>(resolve => {
        answer.current = resolve
      })
    }),
  )
  return answer
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('DefaultThemeControls', () => {
  it('pins the saved default to a mode, saving at once', () => {
    const { onSave } = mount({ current: 'pug' })
    expect(pressed('Follow each member’s mode')).toBe('true')
    fireEvent.click(button('Always dark'))
    expect(onSave).toHaveBeenCalledWith('pug#dark')
  })

  it('offers nothing for no default', () => {
    mount({ current: '' })
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('holds its controls while a save is in flight', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    mount({ current: CLAY_2, saving: true })
    expect(button('Always dark').disabled).toBe(true)
    expect((await screen.findByRole<HTMLButtonElement>('button', { name: 'Latest' })).disabled).toBe(true)
  })

  it('follows the latest, or pins one release, and keeps a mode pin', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_ONE_RELEASE]: JSON.stringify(clayFile('1.0.0')) })
    const { onSave } = mount({ current: `${CLAY_2}#dark` })
    fireEvent.click(await screen.findByRole('button', { name: 'Latest' }))
    expect(onSave).toHaveBeenLastCalledWith('https://themes.pug.sh/clay/theme.json#dark')
    await onlyRelease('1.0.0')
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(`${CLAY_ONE_RELEASE}#dark`))
  })

  it('saves a named repository’s own address, on any track', async () => {
    vi.stubEnv('VITE_THEME_REPOSITORY', 'https://themes.acme.com')
    serveByUrl({ 'https://themes.acme.com/list.json': CLAY_LIST })
    const { onSave } = mount({ current: 'https://themes.acme.com/clay/2/theme.json' })
    fireEvent.click(await screen.findByRole('button', { name: 'Latest' }))
    expect(onSave).toHaveBeenLastCalledWith('https://themes.acme.com/clay/theme.json')
  })

  it('says what the saved default won’t reach', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_1]: JSON.stringify(clayFile('1.1.0')) })
    mount({ current: CLAY_1 })
    expect(await screen.findByText('2.0.0 is out. You stay on 1.x until you switch.')).toBeTruthy()
    expect(pressed('Follow 1.x')).toBe('true')
  })

  it('needs no read for a track that reaches the latest', async () => {
    const fetcher = serveByUrl({ [LIST_URL]: CLAY_LIST })
    const { onSave } = mount({ current: CLAY_2 })
    fireEvent.click(await screen.findByRole('button', { name: 'Latest' }))
    expect(onSave).toHaveBeenLastCalledWith('https://themes.pug.sh/clay/theme.json')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  // The catalog embeds only the latest file. Going by it, a light-only release looked like it had both modes and
  // saved with no pin, so dark members got Pug with nothing to say why.
  it('reads a release it moves to, and saves the mode that release has', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST, [CLAY_ONE_RELEASE]: LIGHT_ONLY })
    const { onSave } = mount({ current: `${CLAY_2}#dark` })
    await screen.findByRole('button', { name: 'Latest' })
    await onlyRelease('1.0.0')
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(`${CLAY_ONE_RELEASE}#light`))
  })

  it('saves nothing until a release has been read, and says it’s reading', async () => {
    const answer = deferred()
    const { onSave } = mount({ current: CLAY_2 })
    await screen.findByRole('button', { name: 'Latest' })
    await onlyRelease('1.0.0')
    expect(screen.getByText('Checking the file…')).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
    await act(async () => answer.current(fakeResponse(LIGHT_ONLY)))
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(`${CLAY_ONE_RELEASE}#light`))
  })

  it('won’t save a release it couldn’t read, and says why', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    const { onSave } = mount({ current: CLAY_2 })
    await screen.findByRole('button', { name: 'Latest' })
    await onlyRelease('1.0.0')
    expect(await screen.findByText('Last check failed: the host answered 404.')).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
  })

  // A read can take ten seconds, and the default can be saved from the list in the meantime.
  it('drops a read that lands after the default has moved', async () => {
    const answer = deferred()
    const { onSave, store } = mount({ current: CLAY_2 })
    await screen.findByRole('button', { name: 'Latest' })
    await onlyRelease('1.0.0')
    act(() => {
      store.set(activeProjectAtom, create(ProjectSchema, { id: 'p1', displayName: 'Acme', defaultTheme: 'pug' }))
    })
    await act(async () => answer.current(fakeResponse(LIGHT_ONLY)))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('drops a single-variant file’s own pin on moving to a file with both modes', async () => {
    serveByUrl({ [LIST_URL]: CLAY_LIST })
    const { onSave } = mount({ current: `${CLAY_ONE_RELEASE}#light`, fetched: { [CLAY_ONE_RELEASE]: LIGHT_ONLY } })
    expect(screen.getByText('Clay has only a light variant.')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Latest' }))
    expect(onSave).toHaveBeenLastCalledWith('https://themes.pug.sh/clay/theme.json')
  })

  it('treats a saved file as official once the catalog lists it', async () => {
    let answer: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url !== LIST_URL) return Promise.resolve(fakeResponse(JSON.stringify(clayFile('1.1.0'))))
        return new Promise<Response>(resolve => {
          answer = resolve
        })
      }),
    )
    mount({ current: CLAY_1 })
    expect(screen.queryByRole('group', { name: 'Updates' })).toBeNull()
    await act(async () => answer(fakeResponse(CLAY_LIST)))
    expect(await screen.findByRole('group', { name: 'Updates' })).toBeTruthy()
  })
})
