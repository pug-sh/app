import { ThresholdRule_Tone } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'

// Semantic accent tokens accepted by the proto. Keep this set in sync with the
// proto's TileHeader.accent_color buf.validate string.in list.
export type AccentToken = '' | 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'gray'

export const ACCENT_TOKENS: AccentToken[] = ['', 'blue', 'green', 'red', 'amber', 'purple', 'gray']

export const accentStripClass = (token: string): string => {
  switch (token) {
    case 'blue':
      return 'bg-blue-500'
    case 'green':
      return 'bg-emerald-500'
    case 'red':
      return 'bg-red-500'
    case 'amber':
      return 'bg-amber-500'
    case 'purple':
      return 'bg-purple-500'
    case 'gray':
      return 'bg-muted-foreground/40'
    default:
      return 'bg-transparent'
  }
}

// Default big-number color when no threshold tone applies; the accent strip is
// the affordance for the header's chosen color, the number stays neutral so
// data state (via tone) and config (via accent) read distinctly.
export const accentTextClass = (_token: string): string => 'text-display-foreground'

export const toneTextClass = (tone: ThresholdRule_Tone): string => {
  switch (tone) {
    case ThresholdRule_Tone.GOOD:
      return 'text-emerald-500'
    case ThresholdRule_Tone.WARN:
      return 'text-amber-500'
    case ThresholdRule_Tone.BAD:
      return 'text-red-500'
    case ThresholdRule_Tone.NEUTRAL:
      return 'text-muted-foreground'
    case ThresholdRule_Tone.UNSPECIFIED:
      return 'text-display-foreground'
  }
}

export const toneSwatchClass = (tone: ThresholdRule_Tone): string => {
  switch (tone) {
    case ThresholdRule_Tone.GOOD:
      return 'bg-emerald-500'
    case ThresholdRule_Tone.WARN:
      return 'bg-amber-500'
    case ThresholdRule_Tone.BAD:
      return 'bg-red-500'
    case ThresholdRule_Tone.NEUTRAL:
      return 'bg-muted-foreground'
    case ThresholdRule_Tone.UNSPECIFIED:
      return 'bg-transparent'
  }
}
