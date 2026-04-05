export interface ChartPoint {
  date: Date
  values: number[]
}

export type InsightsDatum = {
  axisLabel: string
  tooltipLabel: string
} & Record<`series${number}`, number>
