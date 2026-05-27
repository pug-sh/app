import { create } from '@bufbuild/protobuf'
import { Trash2 } from 'lucide-react'
import {
  type ThresholdRule,
  ThresholdRule_Operator,
  ThresholdRule_Tone,
  ThresholdRuleSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Button } from '@/components/ui/button'
import { OptionChip } from '../insights/controls'
import { toneSwatchClass } from './accent-palette'

const OPERATOR_OPTIONS = [
  { label: '<', value: ThresholdRule_Operator.LT },
  { label: '≤', value: ThresholdRule_Operator.LTE },
  { label: '>', value: ThresholdRule_Operator.GT },
  { label: '≥', value: ThresholdRule_Operator.GTE },
]

const TONE_OPTIONS = [
  { label: 'Good', value: ThresholdRule_Tone.GOOD },
  { label: 'Warn', value: ThresholdRule_Tone.WARN },
  { label: 'Bad', value: ThresholdRule_Tone.BAD },
  { label: 'Neutral', value: ThresholdRule_Tone.NEUTRAL },
]

export type ThresholdRuleEditorProps = {
  rule: ThresholdRule
  onChange: (rule: ThresholdRule) => void
  onRemove: () => void
}

export const ThresholdRuleEditor = ({ rule, onChange, onRemove }: ThresholdRuleEditorProps) => {
  const patch = (next: Partial<{ operator: ThresholdRule_Operator; value: number; tone: ThresholdRule_Tone }>) => {
    onChange(
      create(ThresholdRuleSchema, {
        operator: rule.operator,
        value: rule.value,
        tone: rule.tone,
        ...next,
      }),
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm ${toneSwatchClass(rule.tone)}`} aria-hidden />
      <OptionChip
        label="op"
        options={OPERATOR_OPTIONS}
        value={rule.operator}
        onChange={op => patch({ operator: op })}
      />
      <input
        type="number"
        value={Number.isFinite(rule.value) ? rule.value : 0}
        onChange={e => {
          const parsed = Number.parseFloat(e.target.value)
          // Mid-typing states like "-" or "" parse to NaN. Preserve the current
          // value so the input doesn't snap to 0 and block entering negatives.
          if (Number.isNaN(parsed)) return
          patch({ value: parsed })
        }}
        className="w-20 rounded border border-border bg-background px-1.5 py-1 text-xs tabular-nums"
      />
      <OptionChip label="tone" options={TONE_OPTIONS} value={rule.tone} onChange={tone => patch({ tone })} />
      <Button size="icon-xs" variant="ghost" onClick={onRemove} aria-label="Remove threshold rule">
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
