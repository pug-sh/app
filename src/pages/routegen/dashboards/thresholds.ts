import {
  type ThresholdRule,
  ThresholdRule_Operator,
  ThresholdRule_Tone,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'

// First-match-wins. Returns null when no rule matches or value is non-finite.
export const evaluateThresholds = (value: number, rules: ThresholdRule[]): ThresholdRule_Tone | null => {
  if (!Number.isFinite(value)) return null
  for (const rule of rules) {
    if (!matches(value, rule)) continue
    if (rule.tone === ThresholdRule_Tone.UNSPECIFIED) continue
    return rule.tone
  }
  return null
}

const matches = (value: number, rule: ThresholdRule) => {
  switch (rule.operator) {
    case ThresholdRule_Operator.LT:
      return value < rule.value
    case ThresholdRule_Operator.LTE:
      return value <= rule.value
    case ThresholdRule_Operator.GT:
      return value > rule.value
    case ThresholdRule_Operator.GTE:
      return value >= rule.value
    case ThresholdRule_Operator.UNSPECIFIED:
      return false
  }
}
