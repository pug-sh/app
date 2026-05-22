import { create } from '@bufbuild/protobuf'
import {
  type Dashboard,
  type DashboardsServiceCreateTileRequest,
  DashboardsServiceCreateTileRequestSchema,
  type DashboardTile,
  DashboardTileViewMode,
  InsightTileContentSchema,
  MarkdownTileContentSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { DEFAULT_DASHBOARD_TIME_RANGE_PRESET } from '@/lib/date-presets'
import { toastRPCError } from '@/lib/rpc-error'
import { appendDashboardTile } from './dashboard.atoms'
import { buildCreatedTileLayouts } from './grid'
import type { EditorState, InsightTileInput, MarkdownTileInput } from './types'

type TileCreator = (request: DashboardsServiceCreateTileRequest) => Promise<DashboardTile | null>

export const createInsightTile = async ({
  dashboard,
  createTile,
  setDashboard,
  setEditor,
  setSavingTile,
  input,
}: {
  dashboard: Dashboard
  createTile: TileCreator
  setDashboard: React.Dispatch<React.SetStateAction<Dashboard | null>>
  setEditor: React.Dispatch<React.SetStateAction<EditorState | null>>
  setSavingTile: React.Dispatch<React.SetStateAction<boolean>>
  input: InsightTileInput
}) => {
  setSavingTile(true)
  try {
    const tile = await createTile(
      create(DashboardsServiceCreateTileRequestSchema, {
        dashboardId: dashboard.id,
        displayName: input.displayName,
        description: input.description,
        content: {
          case: 'insight',
          value: create(InsightTileContentSchema, { query: input.query }),
        },
        layouts: buildCreatedTileLayouts(dashboard.tiles, 'insight'),
        viewMode: input.viewMode,
        defaultTimeRange: input.defaultTimeRange,
      }),
    )
    if (tile) {
      setDashboard(current => (current ? appendDashboardTile(current, tile) : current))
      setEditor(null)
    }
  } catch (err) {
    toastRPCError(err, 'Failed to save tile')
  } finally {
    setSavingTile(false)
  }
}

// Rethrow so MarkdownTileEditor keeps the editor open (and the typed note) on failure,
// matching updateMarkdownTile. createInsightTile must NOT rethrow: its editor has no
// catch around onSubmit and stays open by only closing on success.
export const createMarkdownTile = async ({
  dashboard,
  createTile,
  setDashboard,
  setEditor,
  setSavingTile,
  input,
}: {
  dashboard: Dashboard
  createTile: TileCreator
  setDashboard: React.Dispatch<React.SetStateAction<Dashboard | null>>
  setEditor: React.Dispatch<React.SetStateAction<EditorState | null>>
  setSavingTile: React.Dispatch<React.SetStateAction<boolean>>
  input: MarkdownTileInput
}) => {
  setSavingTile(true)
  try {
    const tile = await createTile(
      create(DashboardsServiceCreateTileRequestSchema, {
        dashboardId: dashboard.id,
        displayName: input.displayName,
        description: input.description,
        content: {
          case: 'markdown',
          value: create(MarkdownTileContentSchema, { body: input.body }),
        },
        layouts: buildCreatedTileLayouts(dashboard.tiles, 'markdown'),
        viewMode: DashboardTileViewMode.UNSPECIFIED,
        defaultTimeRange: DEFAULT_DASHBOARD_TIME_RANGE_PRESET,
      }),
    )
    if (tile) {
      setDashboard(current => (current ? appendDashboardTile(current, tile) : current))
      setEditor(null)
    }
  } catch (err) {
    toastRPCError(err, 'Failed to save tile')
    throw err
  } finally {
    setSavingTile(false)
  }
}
