export interface ChartPoint {
  date: Date
  values: number[]
}

export type InsightsDatum = {
  axisLabel: string
  tooltipLabel: string
  [k: string]: string | number
}
