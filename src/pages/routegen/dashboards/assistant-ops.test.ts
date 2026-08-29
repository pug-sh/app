import { create } from '@bufbuild/protobuf'
import { expect, test } from 'vitest'
import { TileOpSchema } from '@/api/genproto/ai/dashboards/v1/assistant_pb'
import { DashboardSchema, DashboardTileSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { applyOpToDashboard, nextFlaggedIds, summarizeOp } from './assistant-ops'

const dashboard = (
  tiles: {
    id: string
    displayName: string
    description?: string
    position?: { x: number; y: number; w: number; h: number }
  }[] = [],
) =>
  create(DashboardSchema, {
    displayName: 'Test dashboard',
    tiles: tiles.map(t =>
      create(DashboardTileSchema, {
        id: t.id,
        displayName: t.displayName,
        description: t.description,
        content: { case: 'markdown', value: { body: 'x' } },
        position: t.position ?? { x: 0, y: 0, w: 36, h: 18 },
      }),
    ),
  })

const addOp = (displayName: string, violations: string[] = []) =>
  create(TileOpSchema, {
    op: { case: 'add', value: { tile: { displayName, content: { case: 'markdown', value: { body: 'y' } } } } },
    violations,
  })

const updateOp = (tileId: string, displayName: string, violations: string[] = []) =>
  create(TileOpSchema, {
    op: {
      case: 'update',
      value: { tileId, tile: { displayName, content: { case: 'markdown', value: { body: 'y' } } } },
    },
    violations,
  })

const removeOp = (tileId: string) => create(TileOpSchema, { op: { case: 'remove', value: { tileId } } })

test('applyOpToDashboard adds a tile and returns its new id', () => {
  const result = applyOpToDashboard(dashboard(), addOp('Weekly actives'))
  expect(result?.dashboard.tiles).toHaveLength(1)
  expect(result?.dashboard.tiles[0]?.displayName).toBe('Weekly actives')
  expect(result?.tileId).toBe(result?.dashboard.tiles[0]?.id)
})

test('applyOpToDashboard replaces a tile in place, keeping only its position', () => {
  const before = dashboard([
    { id: 't1', displayName: 'Old name', description: 'Old description', position: { x: 5, y: 5, w: 20, h: 10 } },
  ])
  const result = applyOpToDashboard(before, updateOp('t1', 'New name'))
  expect(result?.tileId).toBe('t1')
  const tile = result?.dashboard.tiles[0]
  expect(tile?.displayName).toBe('New name')
  expect(tile?.description).toBe('')
  expect(tile?.position).toMatchObject({ x: 5, y: 5, w: 20, h: 10 })
})

test('applyOpToDashboard removes a tile by id', () => {
  const before = dashboard([{ id: 't1', displayName: 'Gone soon' }])
  const result = applyOpToDashboard(before, removeOp('t1'))
  expect(result?.tileId).toBe('t1')
  expect(result?.dashboard.tiles).toHaveLength(0)
})

test('applyOpToDashboard leaves other tiles untouched', () => {
  const before = dashboard([
    { id: 't1', displayName: 'Stays' },
    { id: 't2', displayName: 'Also stays' },
  ])
  const result = applyOpToDashboard(before, updateOp('t1', 'Stays (renamed)'))
  expect(result?.dashboard.tiles.find(t => t.id === 't2')?.displayName).toBe('Also stays')
})

test('applyOpToDashboard applies nothing for an unknown tile id', () => {
  const before = dashboard([{ id: 't1', displayName: 'Stays' }])
  expect(applyOpToDashboard(before, updateOp('ghost', 'Ghost'))).toBeNull()
  expect(applyOpToDashboard(before, removeOp('ghost'))).toBeNull()
})

test('applyOpToDashboard applies nothing for an add without a tile or an empty op', () => {
  expect(applyOpToDashboard(dashboard(), create(TileOpSchema, { op: { case: 'add', value: {} } }))).toBeNull()
  expect(applyOpToDashboard(dashboard(), create(TileOpSchema))).toBeNull()
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

test('summarizeOp describes an applied add and update', () => {
  expect(summarizeOp(addOp('Weekly actives'), 'tile-1')).toEqual({
    kind: 'applied',
    text: 'Added "Weekly actives"',
    tileId: 'tile-1',
  })
  expect(summarizeOp(updateOp('t1', 'Weekly actives'), 't1')).toEqual({
    kind: 'applied',
    text: 'Updated "Weekly actives"',
    tileId: 't1',
  })
})

test('summarizeOp flags a tile with violations and carries the reason', () => {
  expect(summarizeOp(addOp('Broken funnel', ['needs at least one event']), 'tile-1')).toEqual({
    kind: 'flagged',
    text: '"Broken funnel" needs a fix: needs at least one event',
    tileId: 'tile-1',
  })
})

test('summarizeOp reports an op that applied nothing as failed', () => {
  expect(summarizeOp(addOp('Ghost'), null)).toEqual({ kind: 'failed', text: 'Couldn\'t apply "Ghost"' })
  expect(summarizeOp(removeOp('ghost'), null)).toEqual({ kind: 'failed', text: "Couldn't remove the tile" })
})

test('summarizeOp describes a removal', () => {
  expect(summarizeOp(removeOp('t1'), 't1')).toEqual({ kind: 'applied', text: 'Removed a tile', tileId: 't1' })
})
