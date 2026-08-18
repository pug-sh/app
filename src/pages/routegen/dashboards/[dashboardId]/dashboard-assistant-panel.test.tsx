import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'

const { turn } = vi.hoisted(() => ({ turn: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { dashboardAssistantRPCAtom: atom({ turn }) }
})

const { DashboardAssistantPanel } = await import('./dashboard-assistant-panel')
const { activeProjectAtom } = await import('@/data/workspace.atoms')

// Generalizes this repo's hand-held-promise testing pattern (see App.test.tsx)
// to a stream: the test pushes chunks and asserts on state between pushes.
const handHeldStream = () => {
  const chunks: unknown[] = []
  let notify: (() => void) | null = null
  let closed = false
  return {
    push: (chunk: unknown) => {
      chunks.push(chunk)
      notify?.()
    },
    close: () => {
      closed = true
      notify?.()
    },
    stream: (async function* () {
      let i = 0
      while (true) {
        if (i < chunks.length) {
          yield chunks[i++]
          continue
        }
        if (closed) return
        await new Promise<void>(resolve => {
          notify = resolve
        })
      }
    })(),
  }
}

const draft = create(DashboardSchema, { displayName: 'Test dashboard' })

describe('DashboardAssistantPanel', () => {
  // A flagged tile is still added to the draft (just flagged) — it always gets a
  // real tile id back, regardless of violations.
  const onApplyOp = vi.fn(() => 'tile-1')
  const onOpenTile = vi.fn()
  const onClose = vi.fn()

  const mount = () => {
    const store = createStore()
    store.set(activeProjectAtom, create(ProjectSchema, { id: 'proj-1', displayName: 'P' }))
    render(
      <Provider store={store}>
        <DashboardAssistantPanel draft={draft} onApplyOp={onApplyOp} onOpenTile={onOpenTile} onClose={onClose} />
      </Provider>,
    )
  }

  const send = (text: string) => {
    fireEvent.change(screen.getByPlaceholderText(/ask the assistant/i), { target: { value: text } })
    fireEvent.click(screen.getByText('Send'))
  }

  beforeEach(() => {
    onApplyOp.mockClear()
    onOpenTile.mockClear()
    onClose.mockClear()
  })

  it('streams assistant text as it arrives', async () => {
    const held = handHeldStream()
    turn.mockReturnValue(held.stream)
    mount()

    send('show weekly actives')

    held.push({ chunk: { case: 'text', value: 'Building ' } })
    await waitFor(() => expect(screen.getByText(/Building/)).toBeTruthy())

    held.push({ chunk: { case: 'text', value: 'a trends tile.' } })
    held.push({ chunk: { case: 'done', value: { failed: [] } } })
    held.close()

    await waitFor(() => expect(screen.getByText('Building a trends tile.')).toBeTruthy())
  })

  it('applies an op as soon as it arrives', async () => {
    const held = handHeldStream()
    turn.mockReturnValue(held.stream)
    mount()

    send('show weekly actives')

    const op = { op: { case: 'add', value: { tile: { displayName: 'Weekly actives' } } }, violations: [] }
    held.push({ chunk: { case: 'op', value: op } })
    held.push({ chunk: { case: 'done', value: { failed: [] } } })
    held.close()

    await waitFor(() => expect(onApplyOp).toHaveBeenCalledWith(op))
    await waitFor(() => expect(screen.getByText(/Added "Weekly actives"/)).toBeTruthy())
  })

  it('flags a violated op and offers to open the tile', async () => {
    const held = handHeldStream()
    turn.mockReturnValue(held.stream)
    mount()

    send('show a broken funnel')

    const op = { op: { case: 'add', value: { tile: { displayName: 'Broken funnel' } } }, violations: ['no events'] }
    held.push({ chunk: { case: 'op', value: op } })
    held.push({ chunk: { case: 'done', value: { failed: [] } } })
    held.close()

    await waitFor(() => expect(screen.getByText(/needs a fix/)).toBeTruthy())
    fireEvent.click(screen.getByText('open tile'))
    expect(onOpenTile).toHaveBeenCalled()
  })

  it('shows an inline error and keeps already-applied ops when the stream throws', async () => {
    turn.mockImplementation(async function* () {
      yield { chunk: { case: 'op', value: { op: { case: 'add', value: { tile: {} } }, violations: [] } } }
      throw new Error('stream broke')
    })
    mount()

    send('do something')

    await waitFor(() => expect(onApplyOp).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText(/stream broke/)).toBeTruthy())
  })

  it('disables the input while a turn is in flight', async () => {
    const held = handHeldStream()
    turn.mockReturnValue(held.stream)
    mount()

    send('show weekly actives')

    // No @testing-library/jest-dom in this repo — assert the DOM property
    // directly rather than reaching for a toBeDisabled()-style matcher.
    const input = () => screen.getByPlaceholderText(/ask the assistant/i) as HTMLInputElement
    expect(input().disabled).toBe(true)
    held.push({ chunk: { case: 'done', value: { failed: [] } } })
    held.close()
    await waitFor(() => expect(input().disabled).toBe(false))
  })
})
