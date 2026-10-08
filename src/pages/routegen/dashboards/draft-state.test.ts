import { create } from '@bufbuild/protobuf'
import { expect, test } from 'vitest'
import { DashboardSchema, DashboardTileInputSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  appendDraftTile,
  cloneForDraft,
  countDashboardChanges,
  patchDashboardMetadata,
  patchTile,
  removeDraftTile,
} from './draft-state'

const dashboard = () =>
  create(DashboardSchema, {
    id: 'd',
    displayName: 'D',
    tiles: [{ id: 't1', displayName: 'A', content: { case: 'markdown', value: { body: 'x' } } }],
  })

test('a rename counts as exactly one change', () => {
  const before = dashboard()
  expect(countDashboardChanges(cloneForDraft(before), patchTile(before, 't1', { displayName: 'B' }))).toBe(1)
})

test('an identical patch counts as no change', () => {
  const before = dashboard()
  expect(countDashboardChanges(cloneForDraft(before), patchTile(before, 't1', { displayName: 'A' }))).toBe(0)
  expect(countDashboardChanges(cloneForDraft(before), patchDashboardMetadata(before, { displayName: 'D' }))).toBe(0)
})

test('adding then removing a tile leaves no change behind', () => {
  const before = dashboard()
  const input = create(DashboardTileInputSchema, {
    displayName: 'New',
    content: { case: 'markdown', value: { body: 'y' } },
  })
  const added = appendDraftTile(before, input)
  expect(countDashboardChanges(cloneForDraft(before), added)).toBe(1)
  expect(countDashboardChanges(cloneForDraft(before), removeDraftTile(added, added.tiles[1]?.id ?? ''))).toBe(0)
})
