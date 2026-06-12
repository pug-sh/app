import { create } from '@bufbuild/protobuf'
import type { ReactNode } from 'react'
import {
  type DashboardTile,
  DashboardTileViewMode,
  TileHeaderSchema,
  VisualizationOptions_YAxisFormat,
  VisualizationOptionsSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { TwemojiIcon } from '@/components/twemoji-icon'
import { OptionChip } from '../../insights/controls'
import { ACCENT_TOKENS, accentStripClass } from '../accent-palette'
import { TILE_ICON_PALETTE } from '../tile-icons'
import { DASHBOARD_TILE_VIEW_MODES } from '../tile-settings'

type DisplayTabProps = {
  tile: DashboardTile
  onPatch: (patch: Partial<DashboardTile>) => void
}

export const DisplayTab = ({ tile, onPatch }: DisplayTabProps) => {
  const setHeader = (next: Partial<{ icon: string; accentColor: string; hideTitle: boolean; borderless: boolean }>) => {
    const current = tile.header
    onPatch({
      header: create(TileHeaderSchema, {
        icon: current?.icon ?? '',
        accentColor: current?.accentColor ?? '',
        hideTitle: current?.hideTitle ?? false,
        borderless: current?.borderless ?? false,
        ...next,
      }),
    })
  }

  const setViz = (next: Partial<{ hideSparkline: boolean }>) => {
    const current = tile.visualization
    onPatch({
      visualization: create(VisualizationOptionsSchema, {
        yAxisFormat: current?.yAxisFormat ?? VisualizationOptions_YAxisFormat.UNSPECIFIED,
        logScale: current?.logScale ?? false,
        hideLegend: current?.hideLegend ?? false,
        zeroBaseline: current?.zeroBaseline ?? false,
        hideSparkline: current?.hideSparkline ?? false,
        ...next,
      }),
    })
  }

  const isInsight = tile.content.case === 'insight'

  return (
    <div className="space-y-4">
      {isInsight ? (
        <Section label="View mode">
          <OptionChip
            label="view"
            options={DASHBOARD_TILE_VIEW_MODES}
            value={tile.viewMode}
            onChange={next => onPatch({ viewMode: next })}
          />
        </Section>
      ) : null}

      {isInsight && tile.viewMode === DashboardTileViewMode.KPI ? (
        <Section label="KPI">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={tile.visualization?.hideSparkline === true}
              onChange={e => setViz({ hideSparkline: e.target.checked })}
            />
            Hide sparkline
          </label>
        </Section>
      ) : null}

      <Section label="Icon">
        <div className="flex flex-wrap gap-1.5">
          {TILE_ICON_PALETTE.map(icon => {
            const selected = (tile.header?.icon ?? '') === icon
            return (
              <button
                key={icon || 'none'}
                type="button"
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
                  selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60',
                ].join(' ')}
                onClick={() => setHeader({ icon })}
                aria-label={icon ? `Set icon ${icon}` : 'Clear icon'}
              >
                {icon ? <TwemojiIcon emoji={icon} size={14} /> : '∅'}
              </button>
            )
          })}
        </div>
      </Section>

      <Section label="Accent color">
        <div className="flex flex-wrap gap-1.5">
          {ACCENT_TOKENS.map(token => {
            const selected = (tile.header?.accentColor ?? '') === token
            const strip = accentStripClass(token) || 'border border-dashed border-muted'
            return (
              <button
                key={token || 'none'}
                type="button"
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
                  selected ? 'border-primary' : 'border-border hover:opacity-80',
                ].join(' ')}
                onClick={() => setHeader({ accentColor: token })}
                aria-label={token ? `Set accent ${token}` : 'Clear accent'}
              >
                <span className={`inline-block h-3 w-3 rounded-sm ${strip}`} />
              </button>
            )
          })}
        </div>
      </Section>

      <Section label="Header">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={tile.header?.hideTitle === true}
            onChange={e => setHeader({ hideTitle: e.target.checked })}
          />
          Hide title
        </label>
      </Section>

      <Section label="Surface">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={tile.header?.borderless === true}
            onChange={e => setHeader({ borderless: e.target.checked })}
          />
          Borderless
        </label>
      </Section>
    </div>
  )
}

const Section = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    {children}
  </div>
)
