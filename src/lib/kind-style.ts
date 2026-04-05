import { getSeriesColor } from '@/lib/event-colors'

export const kindStyle = (kind: string) => {
  const { dot: hex } = getSeriesColor(kind)
  return {
    bg: hex + '1a',
    dot: hex,
    text: hex,
  }
}
