import { create } from '@bufbuild/protobuf'
import {
  type DashboardTile,
  type TileHeader,
  TileHeaderSchema,
  type VisualizationOptions,
  VisualizationOptionsSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { TwemojiIcon } from '@/components/twemoji-icon'
import { Checkbox } from '@/components/ui/checkbox'
import { OptionChip } from '../../insights/controls'
import { ACCENT_TOKENS, accentStripClass } from '../accent-palette'
import { TILE_ICON_PALETTE } from '../tile-icons'
import { DASHBOARD_TILE_VIEW_MODES, USER_FLOW_TILE_VIEW_MODES } from '../tile-settings'
import { tileOptionApplicability } from './option-applicability'
import { Section } from './section'

type DisplayTabProps = {
  tile: DashboardTile
  onPatch: (patch: Partial<DashboardTile>) => void
}

export const DisplayTab = ({ tile, onPatch }: DisplayTabProps) => {
  // Spread the existing message so a patch from this tab preserves fields owned by
  // the Format tab (and vice versa) — both tabs edit the same tile. create()
  // clones-or-defaults so the base is always a complete message.
  const setHeader = (next: Partial<TileHeader>) =>
    onPatch({ header: { ...create(TileHeaderSchema, tile.header), ...next } })

  const setViz = (next: Partial<VisualizationOptions>) =>
    onPatch({ visualization: { ...create(VisualizationOptionsSchema, tile.visualization), ...next } })

  const isUserFlow = tile.content.case === 'insight' && tile.content.value.spec?.insightType === InsightType.USER_FLOW
  const viewModeOptions = isUserFlow ? USER_FLOW_TILE_VIEW_MODES : DASHBOARD_TILE_VIEW_MODES
  const { showViewMode, showKpiOptions } = tileOptionApplicability(tile)

  return (
    <div className="space-y-4">
      {showViewMode ? (
        <Section label="View mode">
          <OptionChip
            label="view"
            options={viewModeOptions}
            value={tile.viewMode}
            onChange={next => onPatch({ viewMode: next })}
          />
        </Section>
      ) : null}

      {showKpiOptions ? (
        <Section label="KPI">
          <div className="flex items-center gap-2 text-xs">
            <Checkbox
              id="tile-hide-sparkline"
              checked={tile.visualization?.hideSparkline === true}
              onCheckedChange={checked => setViz({ hideSparkline: checked === true })}
            />
            <label htmlFor="tile-hide-sparkline">Hide sparkline</label>
          </div>
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
        <div className="flex items-center gap-2 text-xs">
          <Checkbox
            id="tile-hide-title"
            checked={tile.header?.hideTitle === true}
            onCheckedChange={checked => setHeader({ hideTitle: checked === true })}
          />
          <label htmlFor="tile-hide-title">Hide title</label>
        </div>
      </Section>

      <Section label="Surface">
        <div className="flex items-center gap-2 text-xs">
          <Checkbox
            id="tile-borderless"
            checked={tile.header?.borderless === true}
            onCheckedChange={checked => setHeader({ borderless: checked === true })}
          />
          <label htmlFor="tile-borderless">Borderless</label>
        </div>
      </Section>
    </div>
  )
}
