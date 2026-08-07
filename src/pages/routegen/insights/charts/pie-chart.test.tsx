import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AggregationType } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import { buildPieSlices, PieChart } from './pie-chart'
import type { ChartPoint } from './types'

const COLORS: SeriesColor[] = [
  { line: '#2563eb', fill: '#2563eb1a', dot: '#2563eb' },
  { line: '#16a34a', fill: '#16a34a1a', dot: '#16a34a' },
  { line: '#dc2626', fill: '#dc26261a', dot: '#dc2626' },
]

const data: ChartPoint[] = [
  { date: new Date('2026-07-29T00:00:00Z'), values: [10, 4, 0] },
  { date: new Date('2026-07-30T00:00:00Z'), values: [20, 8, 0] },
]

describe('PieChart', () => {
  it('collapses each series with its aggregation rule', () => {
    expect(
      buildPieSlices(data, ['loaded', 'answered', 'unused'], COLORS, [
        AggregationType.TOTAL,
        AggregationType.AVG,
        AggregationType.TOTAL,
      ]).map(slice => slice.value),
    ).toEqual([30, 6, 0])
  })

  it('renders positive series as accessible slices and omits empty ones', () => {
    render(
      <PieChart
        data={data}
        seriesNames={['loaded', 'answered', 'unused']}
        seriesColors={COLORS}
        aggregations={[AggregationType.TOTAL, AggregationType.TOTAL, AggregationType.TOTAL]}
      />,
    )

    expect(screen.getByRole('group', { name: 'Pie chart' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'loaded: 30 (71.4%)' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'answered: 12 (28.6%)' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: /unused/ })).toBeNull()
    expect(document.querySelector('[data-pie-label="loaded"]')).toBeTruthy()
    expect(document.querySelector('[data-pie-label="answered"]')).toBeTruthy()
  })

  it('leaves legend rendering to the shared chart legend', () => {
    render(
      <PieChart
        data={data}
        seriesNames={['loaded', 'answered', 'unused']}
        seriesColors={COLORS}
        aggregations={[AggregationType.TOTAL, AggregationType.TOTAL, AggregationType.TOTAL]}
      />,
    )

    expect(screen.queryByRole('list')).toBeNull()
    expect(document.querySelector('[data-pie-label="loaded"]')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'loaded: 30 (71.4%)' })).toBeTruthy()
  })

  it('humanizes the server Others label', () => {
    expect(buildPieSlices(data, ['$others'], COLORS, [AggregationType.TOTAL])[0]?.name).toBe('Others')
  })

  it('omits collision-prone labels for small slices without hiding their accessible name', () => {
    render(
      <PieChart
        data={[{ date: new Date('2026-07-30T00:00:00Z'), values: [99, 1] }]}
        seriesNames={['large', 'small']}
        seriesColors={COLORS}
        aggregations={[AggregationType.TOTAL, AggregationType.TOTAL]}
      />,
    )

    expect(document.querySelector('[data-pie-label="large"]')).toBeTruthy()
    expect(document.querySelector('[data-pie-label="small"]')).toBeNull()
    expect(screen.getByRole('img', { name: 'small: 1 (1.0%)' })).toBeTruthy()
  })

  it('can hide visual slice labels without hiding accessible slice names', () => {
    render(
      <PieChart
        data={data}
        seriesNames={['loaded', 'answered', 'unused']}
        seriesColors={COLORS}
        aggregations={[AggregationType.TOTAL, AggregationType.TOTAL, AggregationType.TOTAL]}
        showLabels={false}
      />,
    )

    expect(document.querySelector('[data-pie-label="loaded"]')).toBeNull()
    expect(screen.getByRole('img', { name: 'loaded: 30 (71.4%)' })).toBeTruthy()
  })

  it('shows the focused slice name and value in the donut centre', () => {
    render(
      <PieChart
        data={data}
        seriesNames={['loaded', 'answered', 'unused']}
        seriesColors={COLORS}
        aggregations={[AggregationType.TOTAL, AggregationType.TOTAL, AggregationType.TOTAL]}
      />,
    )

    fireEvent.focus(screen.getByRole('img', { name: 'answered: 12 (28.6%)' }))

    expect(document.querySelector('[data-pie-active-label]')?.textContent).toBe('answered')
    expect(screen.getByText('12 · 28.6%')).toBeTruthy()
  })

  it('highlights a keyboard-focused slice', () => {
    render(
      <PieChart
        data={data}
        seriesNames={['loaded', 'answered', 'unused']}
        seriesColors={COLORS}
        aggregations={[AggregationType.TOTAL, AggregationType.TOTAL, AggregationType.TOTAL]}
      />,
    )

    const answered = screen.getByRole('img', { name: 'answered: 12 (28.6%)' })
    fireEvent.focus(answered)

    expect(screen.getByRole('img', { name: 'loaded: 30 (71.4%)' }).getAttribute('opacity')).toBe('0.3')
    expect(answered.getAttribute('opacity')).toBe('0.9')
  })

  it('clears the active selection when refreshed data removes its slice', () => {
    const { rerender } = render(
      <PieChart
        data={data}
        seriesNames={['loaded', 'answered', 'unused']}
        seriesColors={COLORS}
        aggregations={[AggregationType.TOTAL, AggregationType.TOTAL, AggregationType.TOTAL]}
      />,
    )

    fireEvent.focus(screen.getByRole('img', { name: 'answered: 12 (28.6%)' }))
    rerender(
      <PieChart data={data} seriesNames={['loaded']} seriesColors={COLORS} aggregations={[AggregationType.TOTAL]} />,
    )

    expect(screen.getByRole('img', { name: 'loaded: 30 (100.0%)' }).getAttribute('opacity')).toBe('0.9')

    rerender(
      <PieChart
        data={data}
        seriesNames={['loaded', 'answered', 'unused']}
        seriesColors={COLORS}
        aggregations={[AggregationType.TOTAL, AggregationType.TOTAL, AggregationType.TOTAL]}
      />,
    )

    expect(screen.getByRole('img', { name: 'loaded: 30 (71.4%)' }).getAttribute('opacity')).toBe('0.9')
    expect(screen.getByRole('img', { name: 'answered: 12 (28.6%)' }).getAttribute('opacity')).toBe('0.9')
  })

  it('rejects negative collapsed values instead of drawing misleading geometry', () => {
    render(
      <PieChart
        data={[{ date: new Date('2026-07-30T00:00:00Z'), values: [10, -1] }]}
        seriesNames={['positive', 'negative']}
        seriesColors={COLORS}
        aggregations={[AggregationType.SUM, AggregationType.SUM]}
      />,
    )

    expect(screen.getByText('Pie charts require non-negative values')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Pie chart' })).toBeNull()
  })
})
