import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import { DashboardGridMode, DashboardSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { countDashboardChanges, patchDashboardMetadata } from './draft-state'
import { buildUpsertRequest } from './upsert-dashboard'

describe('dashboard grid mode persistence', () => {
  it('marks a grid-mode edit dirty and includes it in the upsert request', () => {
    const original = create(DashboardSchema, {
      id: 'dashboard-1',
      displayName: 'Overview',
      gridMode: DashboardGridMode.FREE,
    })
    const draft = patchDashboardMetadata(original, { gridMode: DashboardGridMode.COLUMNS_12 })

    expect(countDashboardChanges(original, draft)).toBe(1)
    expect(buildUpsertRequest(draft).gridMode).toBe(DashboardGridMode.COLUMNS_12)
  })
})
