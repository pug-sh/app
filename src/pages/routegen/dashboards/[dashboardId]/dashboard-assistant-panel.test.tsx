import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TileOp } from '@/api/genproto/ai/dashboards/v1/assistant_pb'
import { DashboardSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'

const { turn } = vi.hoisted(() => ({ turn: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { dashboardAssistantRPCAtom: atom({ turn }) }
})

const { DashboardAssistantPanel } = await import('./dashboard-assistant-panel')
const { useDashboardAssistant } = await import('./use-dashboard-assistant')
const { activeProjectAtom } = await import('@/data/workspace.atoms')

// Generalizes this repo's hand-held-promise testing pattern (see App.test.tsx) to a stream:
// the test pushes chunks and asserts on state between pushes. Aborting the call's signal
// ends the stream the way connect does, with a Canceled error.
const handHeldStream = () => {
  const chunks: unknown[] = []
  let notify: (() => void) | null = null
  let closed = false
  let aborted = false
  const wake = () => notify?.()
  const stream = async function* (signal?: AbortSignal) {
    signal?.addEventListener('abort', () => {
      aborted = true
      wake()
    })
    let i = 0
    while (true) {
      if (aborted) throw new ConnectError('canceled', Code.Canceled)
      if (i < chunks.length) {
        yield chunks[i++]
        continue
      }
      if (closed) return
      await new Promise<void>(resolve => {
        notify = resolve
      })
    }
  }
  turn.mockImplementation((_req: unknown, opts?: { signal?: AbortSignal }) => stream(opts?.signal))
  return {
    push: (chunk: unknown) => {
      chunks.push(chunk)
      wake()
    },
    close: () => {
      closed = true
      wake()
    },
  }
}

const draft = create(DashboardSchema, { displayName: 'Test dashboard' })
const doneChunk = { chunk: { case: 'done', value: { failed: [] } } }
const textChunk = (value: string) => ({ chunk: { case: 'text', value } })
const opChunk = (op: unknown) => ({ chunk: { case: 'op', value: op } })
const addOp = (displayName: string, violations: string[] = []) => ({
  op: { case: 'add', value: { tile: { displayName } } },
  violations,
})

describe('DashboardAssistantPanel', () => {
  const onApplyOp = vi.fn<(op: TileOp) => string | null>(() => 'tile-1')
  const onOpenTile = vi.fn()
  const onClose = vi.fn()

  const Harness = () => {
    const assistant = useDashboardAssistant({ draft, onApplyOp })
    return <DashboardAssistantPanel assistant={assistant} onOpenTile={onOpenTile} onClose={onClose} />
  }

  const mount = () => {
    const store = createStore()
    store.set(activeProjectAtom, create(ProjectSchema, { id: 'proj-1', displayName: 'P' }))
    render(
      <Provider store={store}>
        <Harness />
      </Provider>,
    )
  }

  const input = () => screen.getByPlaceholderText(/ask the assistant/i)
  const type = (text: string) => fireEvent.change(input(), { target: { value: text } })
  const send = (text: string) => {
    type(text)
    fireEvent.click(screen.getByText('Send'))
  }
  const rowOf = (text: RegExp) => screen.getByText(text).closest('div')

  beforeEach(() => {
    turn.mockReset()
    onApplyOp.mockReset()
    onApplyOp.mockImplementation(() => 'tile-1')
    onOpenTile.mockClear()
    onClose.mockClear()
  })

  it('streams assistant text as it arrives', async () => {
    const held = handHeldStream()
    mount()
    send('show weekly actives')

    held.push(textChunk('Building '))
    await waitFor(() => expect(screen.getByText(/Building/)).toBeTruthy())

    held.push(textChunk('a trends tile.'))
    held.push(doneChunk)
    held.close()

    await waitFor(() => expect(screen.getByText('Send')).toBeTruthy())
    expect(screen.getByText('Building a trends tile.')).toBeTruthy()
  })

  it('applies an op as soon as it arrives', async () => {
    const held = handHeldStream()
    mount()
    send('show weekly actives')

    const op = addOp('Weekly actives')
    held.push(opChunk(op))
    await waitFor(() => expect(onApplyOp).toHaveBeenCalledWith(op))

    held.push(doneChunk)
    held.close()
    await waitFor(() => expect(screen.getByText('Added "Weekly actives"')).toBeTruthy())
  })

  it('flags a violated op with its reason and offers to open the tile', async () => {
    const held = handHeldStream()
    mount()
    send('show a broken funnel')

    held.push(opChunk(addOp('Broken funnel', ['no events'])))
    held.push(doneChunk)
    held.close()

    await waitFor(() => expect(screen.getByText('"Broken funnel" needs a fix: no events')).toBeTruthy())
    fireEvent.click(screen.getByText('open tile'))
    expect(onOpenTile).toHaveBeenCalledWith('tile-1')
  })

  it('reports an op that applied nothing as a failure', async () => {
    onApplyOp.mockReturnValueOnce(null)
    const held = handHeldStream()
    mount()
    send('update a ghost')

    held.push(opChunk(addOp('Ghost')))
    held.push(doneChunk)
    held.close()

    await waitFor(() => expect(screen.getByText('Couldn\'t apply "Ghost"')).toBeTruthy())
    expect(rowOf(/Couldn't apply/)?.className).toContain('text-negative')
    expect(screen.queryByText('open tile')).toBeNull()
  })

  it('surfaces abandoned intents as failures, not successes', async () => {
    const held = handHeldStream()
    mount()
    send('a funnel')

    held.push({ chunk: { case: 'done', value: { failed: [{ intent: 'a funnel', violations: ['needs events'] }] } } })
    held.close()

    await waitFor(() => expect(screen.getByText('Couldn\'t build "a funnel": needs events')).toBeTruthy())
    expect(rowOf(/Couldn't build/)?.className).toContain('text-negative')
  })

  it('keeps applied ops in the transcript when the stream throws', async () => {
    turn.mockImplementation(async function* () {
      yield opChunk(addOp('Kept'))
      throw new Error('stream broke')
    })
    mount()
    send('do something')

    await waitFor(() => expect(screen.getByText('stream broke')).toBeTruthy())
    expect(screen.getByText('Added "Kept"')).toBeTruthy()
  })

  it('shows a ConnectError without its code prefix', async () => {
    turn.mockImplementation(async function* () {
      yield textChunk('Almost')
      throw new ConnectError('assistant unavailable', Code.Unavailable)
    })
    mount()
    send('hello')

    await waitFor(() => expect(screen.getByText('assistant unavailable')).toBeTruthy())
    expect(screen.queryByText(/\[unavailable\]/)).toBeNull()
    expect(screen.getByText('Almost')).toBeTruthy()
  })

  it('Stop ends the turn and keeps what already arrived', async () => {
    const held = handHeldStream()
    mount()
    send('long task')

    held.push(textChunk('Partial'))
    await waitFor(() => expect(screen.getByText('Partial')).toBeTruthy())
    fireEvent.click(screen.getByText('Stop'))

    await waitFor(() => expect(screen.getByText('Send')).toBeTruthy())
    expect(screen.getByText('Partial')).toBeTruthy()
    expect(screen.queryByText(/canceled/i)).toBeNull()
  })

  it('ignores a second submit while a turn is in flight', async () => {
    const held = handHeldStream()
    mount()
    send('first')

    type('second')
    const form = input().closest('form')
    if (form) fireEvent.submit(form)
    expect(turn).toHaveBeenCalledTimes(1)

    held.push(doneChunk)
    held.close()
    await waitFor(() => expect(screen.getByText('Send')).toBeTruthy())
  })

  it('keeps one conversation across turns and scopes the call to the project', async () => {
    turn.mockImplementation(async function* () {
      yield doneChunk
    })
    mount()

    send('first')
    await waitFor(() => expect(screen.getByText('Send')).toBeTruthy())
    send('second')
    await waitFor(() => expect(turn).toHaveBeenCalledTimes(2))

    const [firstRequest, options] = turn.mock.calls[0] ?? []
    const [secondRequest] = turn.mock.calls[1] ?? []
    expect(firstRequest.conversationId).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(secondRequest.conversationId).toBe(firstRequest.conversationId)
    expect(firstRequest.state.draft).toBe(draft)
    expect(options.headers).toEqual({ 'x-project-id': 'proj-1' })
  })
})
