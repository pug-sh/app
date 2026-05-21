import { create } from '@bufbuild/protobuf'
import {
  type DashboardTile,
  DashboardTileSchema,
  InsightTileContentSchema,
  MarkdownTileContentSchema,
  type ResponsiveGridLayout,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { QueryRequest } from '@/api/genproto/shared/insights/v1/insights_pb'
import { buildCreatedTileLayouts } from './grid'

const newDraftTileId = () => `draft-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

export const createDraftInsightTile = ({
  tiles,
  displayName,
  description,
  query,
  id,
  layouts,
}: {
  tiles: DashboardTile[]
  displayName: string
  description: string
  query: QueryRequest
  id?: string
  layouts?: ResponsiveGridLayout[]
}) =>
  create(DashboardTileSchema, {
    id: id ?? newDraftTileId(),
    dashboardId: 'draft',
    displayName,
    description,
    content: {
      case: 'insight',
      value: create(InsightTileContentSchema, { query }),
    },
    layouts: layouts ?? buildCreatedTileLayouts(tiles, 'insight'),
  })

export const createDraftMarkdownTile = ({
  tiles,
  displayName,
  description,
  body,
  id,
  layouts,
}: {
  tiles: DashboardTile[]
  displayName: string
  description: string
  body: string
  id?: string
  layouts?: ResponsiveGridLayout[]
}) =>
  create(DashboardTileSchema, {
    id: id ?? newDraftTileId(),
    dashboardId: 'draft',
    displayName,
    description,
    content: {
      case: 'markdown',
      value: create(MarkdownTileContentSchema, { body }),
    },
    layouts: layouts ?? buildCreatedTileLayouts(tiles, 'markdown'),
  })
