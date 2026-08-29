import { create } from '@bufbuild/protobuf'
import { act, renderHook } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TileOpSchema } from '@/api/genproto/ai/dashboards/v1/assistant_pb'
import { DashboardSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'

const { turn, upsert, toastError } = vi.hoisted(() => ({ turn: vi.fn(), upsert: vi.fn(), toastError: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    dashboardsRPCAtom: atom({ upsert }),
    dashboardAssistantRPCAtom: atom({ turn }),
    insightsRPCAtom: atom({}),
    projectsRPCAtom: atom({}),
    orgsRPCAtom: atom({}),
    authRPCAtom: atom({}),
    customersRPCAtom: atom({}),
  }
})

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  analyticsEnabled: false,
}))

vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn(), info: vi.fn() } }))

const { useDashboardEditor } = await import('./use-dashboard-editor')
const { activeOrgAtom } = await import('@/data/workspace.atoms')

const dashboard = create(DashboardSchema, { id: 'd1', displayName: 'Dashboard' })

const addOp = (displayName: string, violations: string[] = []) =>
  create(TileOpSchema, {
    op: { case: 'add', value: { tile: { displayName, content: { case: 'markdown', value: { body: 'x' } } } } },
    violations,
  })

const updateOp = (tileId: string, displayName: string, violations: string[] = []) =>
  create(TileOpSchema, {
    op: {
      case: 'update',
      value: { tileId, tile: { displayName, content: { case: 'markdown', value: { body: 'x' } } } },
    },
    violations,
  })

const doneChunk = { chunk: { case: 'done', value: { failed: [] } } }

// The editor in edit mode as an admin (enterEditMode is gated on dashboard:update).
const mountEditor = () => {
  const store = createStore()
  store.set(activeOrgAtom, create(OrgSchema, { id: 'org-1', displayName: 'Org', role: OrgRole.ADMIN }))
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  const hook = renderHook(() => useDashboardEditor({ dashboardId: 'd1', dashboard, setDashboard: vi.fn() }), {
    wrapper,
  })
  act(() => hook.result.current.enterEditMode())
  return hook.result
}

const tileNames = (result: ReturnType<typeof mountEditor>) =>
  result.current.effectiveDashboard?.tiles.map(tile => tile.displayName)

describe('useDashboardEditor', () => {
  beforeEach(() => {
    localStorage.clear()
    turn.mockReset()
    upsert.mockReset()
    toastError.mockReset()
  })

  it('applies every op of a turn through one callback reference', () => {
    const result = mountEditor()
    // The stream loop holds the applyTileOp it started with for the whole turn.
    const apply = result.current.applyTileOp
    act(() => {
      apply(addOp('First'))
      apply(addOp('Second'))
    })
    expect(tileNames(result)).toEqual(['First', 'Second'])
    act(() => result.current.undo())
    expect(tileNames(result)).toEqual(['First'])
  })

  it('lands every op streamed in one turn', async () => {
    turn.mockImplementation(async function* () {
      yield { chunk: { case: 'op', value: addOp('First') } }
      yield { chunk: { case: 'op', value: addOp('Second') } }
      yield doneChunk
    })
    const result = mountEditor()
    await act(() => result.current.assistant.sendMessage('two tiles'))
    expect(tileNames(result)).toEqual(['First', 'Second'])
    expect(result.current.assistant.messages[1]?.ops.map(op => op.kind)).toEqual(['applied', 'applied'])
  })

  it('stops blocking Save once a flagged tile is undone or removed', () => {
    const result = mountEditor()
    act(() => {
      result.current.applyTileOp(addOp('Broken', ['needs an event']))
    })
    expect(result.current.flaggedTileIds.size).toBe(1)

    act(() => result.current.undo())
    expect(result.current.flaggedTileIds.size).toBe(0)
    act(() => result.current.redo())
    expect(result.current.flaggedTileIds.size).toBe(1)

    act(() => result.current.selectTile(result.current.effectiveDashboard?.tiles[0]?.id ?? ''))
    act(() => result.current.removeSelectedTile())
    expect(tileNames(result)).toEqual([])
    expect(result.current.flaggedTileIds.size).toBe(0)
  })

  it('refuses to save while a tile is flagged', async () => {
    const result = mountEditor()
    act(() => {
      result.current.applyTileOp(addOp('Broken', ['needs an event']))
    })
    await act(() => result.current.handleSave())
    expect(toastError).toHaveBeenCalledWith('Fix 1 flagged tile before saving')
    expect(upsert).not.toHaveBeenCalled()
  })

  it('applies nothing for an update naming an unknown tile', () => {
    const result = mountEditor()
    let applied: string | null = 'unset'
    act(() => {
      applied = result.current.applyTileOp(updateOp('ghost', 'Ghost', ['bad']))
    })
    expect(applied).toBeNull()
    expect(result.current.flaggedTileIds.size).toBe(0)
    expect(result.current.dirtyCount).toBe(0)
    expect(result.current.canUndo).toBe(false)
  })

  it('keeps the transcript across the panel closing and resets it with the edit session', async () => {
    turn.mockImplementation(async function* () {
      yield { chunk: { case: 'text', value: 'Hello' } }
      yield doneChunk
    })
    const result = mountEditor()
    act(() => result.current.toggleAssistant())
    await act(() => result.current.assistant.sendMessage('hi'))
    expect(result.current.assistant.messages.map(message => message.content)).toEqual(['hi', 'Hello'])

    act(() => result.current.selectTile('any'))
    expect(result.current.assistantOpen).toBe(false)
    act(() => result.current.toggleAssistant())
    expect(result.current.assistant.messages).toHaveLength(2)

    act(() => result.current.handleDiscard())
    expect(result.current.assistant.messages).toHaveLength(0)

    act(() => result.current.enterEditMode())
    await act(() => result.current.assistant.sendMessage('again'))
    const conversationIds = turn.mock.calls.map(call => call[0].conversationId)
    expect(conversationIds).toHaveLength(2)
    expect(conversationIds[0]).not.toBe(conversationIds[1])
  })
})
