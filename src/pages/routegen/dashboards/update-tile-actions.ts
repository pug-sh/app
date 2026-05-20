import { create } from '@bufbuild/protobuf'
import {
  type Dashboard,
  type DashboardsServiceUpdateTileRequest,
  DashboardsServiceUpdateTileRequestSchema,
  type DashboardTile,
  InsightTileContentSchema,
  MarkdownTileContentSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { QueryRequest } from '@/api/genproto/shared/insights/v1/insights_pb'
import { toastRPCError } from '@/lib/rpc-error'
import { replaceDashboardTile } from './dashboard.atoms'
import { withUpdatedLayouts } from './grid'
import type { EditorState } from './types'

type TileUpdater = (request: DashboardsServiceUpdateTileRequest) => Promise<DashboardTile | null>

export const updateInsightTile = async ({
  dashboard,
  editor,
  updateTile,
  setDashboard,
  setEditor,
  setSavingTile,
  input,
}: {
  dashboard: Dashboard
  editor: Extract<EditorState, { kind: 'edit' }>
  updateTile: TileUpdater
  setDashboard: React.Dispatch<React.SetStateAction<Dashboard | null>>
  setEditor: React.Dispatch<React.SetStateAction<EditorState | null>>
  setSavingTile: React.Dispatch<React.SetStateAction<boolean>>
  input: { displayName: string; description: string; query: QueryRequest }
}) => {
  setSavingTile(true)
  try {
    const tile = await updateTile(
      create(DashboardsServiceUpdateTileRequestSchema, {
        id: editor.tile.id,
        dashboardId: dashboard.id,
        displayName: input.displayName,
        description: input.description,
        content: {
          case: 'insight',
          value: create(InsightTileContentSchema, { query: input.query }),
        },
        layouts: editor.tile.layouts,
      }),
    )
    if (tile) {
      setDashboard(current => (current ? replaceDashboardTile(current, tile) : current))
      setEditor(null)
    }
  } catch (err) {
    toastRPCError(err, 'Failed to update tile')
  } finally {
    setSavingTile(false)
  }
}

export const updateMarkdownTile = async ({
  dashboard,
  editor,
  updateTile,
  setDashboard,
  setEditor,
  setSavingTile,
  input,
}: {
  dashboard: Dashboard
  editor: Extract<EditorState, { kind: 'edit' }>
  updateTile: TileUpdater
  setDashboard: React.Dispatch<React.SetStateAction<Dashboard | null>>
  setEditor: React.Dispatch<React.SetStateAction<EditorState | null>>
  setSavingTile: React.Dispatch<React.SetStateAction<boolean>>
  input: { displayName: string; description: string; body: string }
}) => {
  setSavingTile(true)
  try {
    const tile = await updateTile(
      create(DashboardsServiceUpdateTileRequestSchema, {
        id: editor.tile.id,
        dashboardId: dashboard.id,
        displayName: input.displayName,
        description: input.description,
        content: {
          case: 'markdown',
          value: create(MarkdownTileContentSchema, { body: input.body }),
        },
        layouts: editor.tile.layouts,
      }),
    )
    if (tile) {
      setDashboard(current => (current ? replaceDashboardTile(current, tile) : current))
      setEditor(null)
    }
  } catch (err) {
    toastRPCError(err, 'Failed to update tile')
  } finally {
    setSavingTile(false)
  }
}

export const persistTileLayouts = async ({
  dashboard,
  layouts,
  updateTile,
  setDashboard,
}: {
  dashboard: Dashboard
  layouts: any
  updateTile: TileUpdater
  setDashboard: React.Dispatch<React.SetStateAction<Dashboard | null>>
}) => {
  const changedTiles = dashboard.tiles
    .map(tile => withUpdatedLayouts(tile, layouts))
    .filter((tile, index) => JSON.stringify(tile.layouts) !== JSON.stringify(dashboard.tiles[index]?.layouts))
  if (changedTiles.length === 0) return

  setDashboard(current =>
    current
      ? {
          ...current,
          tiles: current.tiles.map(tile => changedTiles.find(nextTile => nextTile.id === tile.id) ?? tile),
        }
      : current,
  )

  for (const tile of changedTiles) {
    try {
      const nextTile = await updateTile(
        create(DashboardsServiceUpdateTileRequestSchema, {
          id: tile.id,
          dashboardId: tile.dashboardId,
          displayName: tile.displayName,
          description: tile.description,
          content: tile.content,
          layouts: tile.layouts,
        }),
      )
      if (nextTile) {
        setDashboard(current =>
          current
            ? {
                ...current,
                tiles: current.tiles.map(existingTile =>
                  existingTile.id === nextTile.id
                    ? { ...existingTile, layouts: nextTile.layouts, updateTime: nextTile.updateTime }
                    : existingTile,
                ),
              }
            : current,
        )
      }
    } catch (err) {
      toastRPCError(err, `Failed to persist layout for ${tile.displayName}`)
    }
  }
}
