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
    expect(screen.getByText('71.4%')).toBeTruthy()
    expect(screen.getByText('28.6%')).toBeTruthy()
  })

  it('highlights a slice from its legend row', () => {
    const { container } = render(
      <PieChart
        data={data}
        seriesNames={['loaded', 'answered', 'unused']}
        seriesColors={COLORS}
        aggregations={[AggregationType.TOTAL, AggregationType.TOTAL, AggregationType.TOTAL]}
      />,
    )

    fireEvent.mouseEnter(screen.getByText('answered').closest('li')!)

    expect(container.querySelector('[data-pie-slice="loaded"]')?.getAttribute('opacity')).toBe('0.3')
    expect(container.querySelector('[data-pie-slice="answered"]')?.getAttribute('opacity')).toBe('0.9')
  })

  it('can hide its legend while preserving accessible slices', () => {
    render(
      <PieChart
        data={data}
        seriesNames={['loaded', 'answered', 'unused']}
        seriesColors={COLORS}
        aggregations={[AggregationType.TOTAL, AggregationType.TOTAL, AggregationType.TOTAL]}
        hideLegend
      />,
    )

    expect(screen.queryByText('loaded')).toBeNull()
    expect(screen.getByRole('img', { name: 'loaded: 30 (71.4%)' })).toBeTruthy()
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
    expect(screen.getByText('loaded').closest('li')?.className).not.toContain('opacity-40')
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
