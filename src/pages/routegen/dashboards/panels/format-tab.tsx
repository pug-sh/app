import { create } from '@bufbuild/protobuf'
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  type DashboardTile,
  type ThresholdRule,
  ThresholdRule_Operator,
  ThresholdRule_Tone,
  ThresholdRuleSchema,
  VisualizationOptions_YAxisFormat,
  VisualizationOptionsSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { OptionChip } from '../../insights/controls'
import { ThresholdRuleEditor } from '../threshold-rule-editor'
import { tileOptionApplicability } from './option-applicability'

const Y_FORMAT_OPTIONS = [
  { label: 'Plain', value: VisualizationOptions_YAxisFormat.UNSPECIFIED },
  { label: 'Number', value: VisualizationOptions_YAxisFormat.NUMBER },
  { label: 'Compact (27K)', value: VisualizationOptions_YAxisFormat.COMPACT },
  { label: '%', value: VisualizationOptions_YAxisFormat.PERCENT },
  { label: 'Duration (ms)', value: VisualizationOptions_YAxisFormat.DURATION_MS },
]

type FormatTabProps = {
  tile: DashboardTile
  onPatch: (patch: Partial<DashboardTile>) => void
}

export const FormatTab = ({ tile, onPatch }: FormatTabProps) => {
  const viz = tile.visualization

  const setViz = (
    next: Partial<{
      yAxisFormat: VisualizationOptions_YAxisFormat
      logScale: boolean
      hideLegend: boolean
      zeroBaseline: boolean
    }>,
  ) =>
    onPatch({
      visualization: create(VisualizationOptionsSchema, {
        yAxisFormat: viz?.yAxisFormat ?? VisualizationOptions_YAxisFormat.UNSPECIFIED,
        logScale: viz?.logScale ?? false,
        hideLegend: viz?.hideLegend ?? false,
        zeroBaseline: viz?.zeroBaseline ?? false,
        ...next,
      }),
    })

  const addRule = () => {
    if (tile.thresholds.length >= 5) return
    const next: ThresholdRule = create(ThresholdRuleSchema, {
      operator: ThresholdRule_Operator.GTE,
      value: 0,
      tone: ThresholdRule_Tone.GOOD,
    })
    onPatch({ thresholds: [...tile.thresholds, next] })
  }

  const updateRule = (index: number, rule: ThresholdRule) => {
    const next = [...tile.thresholds]
    next[index] = rule
    onPatch({ thresholds: next })
  }

  const removeRule = (index: number) => {
    onPatch({ thresholds: tile.thresholds.filter((_, i) => i !== index) })
  }

  const { showKpiOptions, showAxisOptions, showLegendOption } = tileOptionApplicability(tile)
  const hasAnyOption = showKpiOptions || showAxisOptions || showLegendOption

  return (
    <div className="space-y-4">
      {showKpiOptions ? (
        <Section label="Thresholds">
          <div className="space-y-2">
            {tile.thresholds.map((rule, idx) => (
              <ThresholdRuleEditor
                key={idx}
                rule={rule}
                onChange={next => updateRule(idx, next)}
                onRemove={() => removeRule(idx)}
              />
            ))}
            <Button size="sm" variant="ghost" onClick={addRule} disabled={tile.thresholds.length >= 5}>
              <Plus className="size-3.5" />
              Add rule
            </Button>
          </div>
        </Section>
      ) : null}

      {showKpiOptions || showAxisOptions ? (
        <Section label="Y-axis format">
          <OptionChip
            label="format"
            options={Y_FORMAT_OPTIONS}
            value={viz?.yAxisFormat ?? VisualizationOptions_YAxisFormat.UNSPECIFIED}
            onChange={fmt => setViz({ yAxisFormat: fmt })}
          />
        </Section>
      ) : null}

      {showAxisOptions ? (
        <Section label="Axis options">
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <Checkbox
                id="tile-log-scale"
                checked={viz?.logScale === true}
                onCheckedChange={checked => setViz({ logScale: checked === true })}
              />
              <label htmlFor="tile-log-scale">Log scale</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="tile-zero-baseline"
                checked={viz?.zeroBaseline === true}
                onCheckedChange={checked => setViz({ zeroBaseline: checked === true })}
              />
              <label htmlFor="tile-zero-baseline">Zero baseline</label>
            </div>
          </div>
        </Section>
      ) : null}

      {showLegendOption ? (
        <Section label="Legend">
          <div className="flex items-center gap-2 text-xs">
            <Checkbox
              id="tile-hide-legend"
              checked={viz?.hideLegend === true}
              onCheckedChange={checked => setViz({ hideLegend: checked === true })}
            />
            <label htmlFor="tile-hide-legend">Hide legend</label>
          </div>
        </Section>
      ) : null}

      {hasAnyOption ? null : <p className="text-muted-foreground text-xs">No format options for this insight type.</p>}
    </div>
  )
}

const Section = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <div className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    {children}
  </div>
)
