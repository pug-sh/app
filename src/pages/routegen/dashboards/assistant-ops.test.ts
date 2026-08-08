import { create } from '@bufbuild/protobuf'
import { expect, test } from 'vitest'
import { TileOpSchema } from '@/api/genproto/ai/dashboards/v1/assistant_pb'
import { DashboardSchema, DashboardTileInputSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { applyOpToDashboard, nextFlaggedIds, summarizeOp, tileInputToPatch } from './assistant-ops'

const dashboard = (
  tiles: { id: string; displayName: string; position?: { x: number; y: number; w: number; h: number } }[] = [],
) =>
  create(DashboardSchema, {
    displayName: 'Test dashboard',
    tiles: tiles.map(t => ({
      id: t.id,
      displayName: t.displayName,
      content: { case: 'markdown', value: { body: 'x' } },
      position: t.position ?? { x: 0, y: 0, w: 36, h: 18 },
    })),
  } as never)

const addOp = (displayName: string, violations: string[] = []) =>
  create(TileOpSchema, {
    op: { case: 'add', value: { tile: { displayName, content: { case: 'markdown', value: { body: 'y' } } } } },
    violations,
  } as never)

const updateOp = (tileId: string, displayName: string, violations: string[] = []) =>
  create(TileOpSchema, {
    op: { case: 'update', value: { tileId, tile: { displayName, content: { case: 'markdown', value: { body: 'y' } } } } },
    violations,
  } as never)

const removeOp = (tileId: string) => create(TileOpSchema, { op: { case: 'remove', value: { tileId } } } as never)

test('applyOpToDashboard adds a tile and returns its new id', () => {
  const { dashboard: next, tileId } = applyOpToDashboard(dashboard(), addOp('Weekly actives'))
  expect(next.tiles).toHaveLength(1)
  expect(next.tiles[0]?.displayName).toBe('Weekly actives')
  expect(tileId).toBe(next.tiles[0]?.id)
})

test('applyOpToDashboard updates a tile by id without moving it', () => {
  const before = dashboard([{ id: 't1', displayName: 'Old name', position: { x: 5, y: 5, w: 20, h: 10 } }])
  const { dashboard: next, tileId } = applyOpToDashboard(before, updateOp('t1', 'New name'))
  expect(tileId).toBe('t1')
  expect(next.tiles[0]?.displayName).toBe('New name')
  // The point of tileInputToPatch: position is untouched by an update, regardless
  // of whatever position (if any) came back on the assistant's tile payload.
  expect(next.tiles[0]?.position).toMatchObject({ x: 5, y: 5, w: 20, h: 10 })
})

test('applyOpToDashboard removes a tile by id', () => {
  const before = dashboard([{ id: 't1', displayName: 'Gone soon' }])
  const { dashboard: next, tileId } = applyOpToDashboard(before, removeOp('t1'))
  expect(tileId).toBe('t1')
  expect(next.tiles).toHaveLength(0)
})

test('applyOpToDashboard leaves other tiles untouched', () => {
  const before = dashboard([
    { id: 't1', displayName: 'Stays' },
    { id: 't2', displayName: 'Also stays' },
  ])
  const { dashboard: next } = applyOpToDashboard(before, updateOp('t1', 'Stays (renamed)'))
  expect(next.tiles.find(t => t.id === 't2')?.displayName).toBe('Also stays')
})

test('tileInputToPatch carries display/content fields but not position', () => {
  const input = create(DashboardTileInputSchema, {
    displayName: 'X',
    content: { case: 'markdown', value: { body: 'hi' } },
    position: { x: 1, y: 2, w: 3, h: 4 },
  } as never)
  const patch = tileInputToPatch(input)
  expect(patch.displayName).toBe('X')
  expect(patch.position).toBeUndefined()
})

test('nextFlaggedIds adds an id when flagged', () => {
  expect(nextFlaggedIds(new Set(), 't1', true).has('t1')).toBe(true)
})

test('nextFlaggedIds removes an id when no longer flagged', () => {
  expect(nextFlaggedIds(new Set(['t1']), 't1', false).has('t1')).toBe(false)
})

test('nextFlaggedIds returns the same set reference when nothing changes', () => {
  const current = new Set(['t1'])
  expect(nextFlaggedIds(current, 't1', true)).toBe(current)
})

test('nextFlaggedIds is a no-op for an undefined tile id', () => {
  const current = new Set(['t1'])
  expect(nextFlaggedIds(current, undefined, true)).toBe(current)
})

test('summarizeOp describes an added tile', () => {
  const { text, flagged } = summarizeOp(addOp('Weekly actives'))
  expect(text).toContain('Weekly actives')
  expect(flagged).toBe(false)
})

test('summarizeOp flags a tile with violations', () => {
  const { text, flagged } = summarizeOp(
    addOp('Broken funnel', ['funnel and retention insight types require at least one event']),
  )
  expect(flagged).toBe(true)
  expect(text).toContain('Broken funnel')
})

test('summarizeOp describes a removal', () => {
  const { text, flagged } = summarizeOp(removeOp('t1'))
  expect(text.length).toBeGreaterThan(0)
  expect(flagged).toBe(false)
})
