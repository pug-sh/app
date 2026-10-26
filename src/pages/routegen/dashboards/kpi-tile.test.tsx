import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DashboardTileSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  DataPointSchema,
  type TrendSeries,
  TrendSeriesSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { DeltaBadge, KpiTile, Sparkline } from './kpi-tile'

// happy-dom reports the container as 0x0, and an unsized chart renders nothing at all.
vi.mock('@/components/charts/chart-parent-size', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 200, height: 40 }),
}))

// The badge encodes two separate things: the arrow is the direction the number moved, the color is
// whether that direction is good. Reading the color straight off the sign shipped a doubling bounce
// rate as a green win, so the two are asserted apart here.
describe('DeltaBadge', () => {
  it('colors a climbing lower-is-better metric as a regression', () => {
    render(<DeltaBadge pct={105.3} label="105.3%" lowerIsBetter />)
    expect(screen.getByText('105.3%').className).toContain('text-negative')
  })

  it('colors a falling lower-is-better metric as an improvement', () => {
    render(<DeltaBadge pct={-63.6} label="63.6%" lowerIsBetter />)
    expect(screen.getByText('63.6%').className).toContain('text-positive')
  })

  it('keeps the arrow on the direction the number moved, not on the color', () => {
    const { container } = render(<DeltaBadge pct={105.3} label="105.3%" lowerIsBetter />)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('trending-up')
  })

  it('leaves higher-is-better metrics reading off the sign', () => {
    const { unmount } = render(<DeltaBadge pct={12} label="12.0%" />)
    expect(screen.getByText('12.0%').className).toContain('text-positive')
    unmount()

    render(<DeltaBadge pct={-12} label="12.0%" />)
    expect(screen.getByText('12.0%').className).toContain('text-negative')
  })

  // Two equal windows are not a regression, so flat stays green whichever way the metric runs.
  it('treats no change as unremarkable in both polarities', () => {
    const { unmount } = render(<DeltaBadge pct={0} label="0.0%" lowerIsBetter />)
    expect(screen.getByText('0.0%').className).toContain('text-positive')
    unmount()

    render(<DeltaBadge pct={0} label="0.0%" />)
    expect(screen.getByText('0.0%').className).toContain('text-positive')
  })
})

describe('Sparkline', () => {
  const linePath = (container: HTMLElement) => container.querySelector('path[fill="none"]')?.getAttribute('d')

  it('lays an all-zero window on the floor', () => {
    const { container } = render(<Sparkline points={Array.from({ length: 5 }, () => ({ value: 0 }))} />)
    expect(linePath(container)).toMatch(/^M0,40\D/)
  })

  it('floors baseline zero at 0', () => {
    const { container } = render(<Sparkline points={[{ value: 10 }, { value: 20 }]} baseline="zero" />)
    expect(linePath(container)).toMatch(/^M0,20\D/)
  })
})

describe('KpiTile', () => {
  const series = (values: number[]) =>
    create(TrendSeriesSchema, {
      points: values.map((value, i) =>
        create(DataPointSchema, { time: timestampFromDate(new Date(Date.UTC(2026, 6, i + 1))), value }),
      ),
    })
  const kpi = (currentSeries: TrendSeries[]) => (
    <KpiTile
      tile={create(DashboardTileSchema)}
      currentSeries={currentSeries}
      aggregationFor={() => AggregationType.TOTAL}
      compare={{ series: [series([75])], label: 'vs previous' }}
      formatValue={String}
      formatDate={date => date.toISOString().slice(0, 10)}
    />
  )
  const sparklineIn = (container: HTMLElement) => container.querySelector('svg[role="img"]') as SVGSVGElement

  it('reads the hovered bucket into the headline and gives the window back on leave', () => {
    const { container } = render(kpi([series([10, 20, 0, 40, 50])]))
    expect(screen.queryByRole('img')).toBeNull()

    fireEvent.pointerMove(sparklineIn(container), { clientX: 100 })
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText('2026-07-03')).toBeTruthy()
    expect(screen.getByText('vs previous').closest('.invisible')).toBeTruthy()

    fireEvent.pointerLeave(sparklineIn(container))
    expect(screen.getByText('120')).toBeTruthy()
    expect(screen.queryByText('2026-07-03')).toBeNull()
    expect(screen.getByText('vs previous').closest('.invisible')).toBeNull()
  })

  it('leaves a multi-series headline on the window', () => {
    const { container } = render(kpi([series([10, 20, 30, 40, 50]), series([1, 2, 3, 4, 5])]))
    fireEvent.pointerMove(sparklineIn(container), { clientX: 100 })
    expect(screen.getByText('165')).toBeTruthy()
    expect(screen.queryByText('2026-07-03')).toBeNull()
  })

  it('drops the readout when the sparkline unmounts under the pointer', () => {
    const { container, rerender } = render(kpi([series([10, 20, 30, 40, 50])]))
    fireEvent.pointerMove(sparklineIn(container), { clientX: 100 })
    expect(screen.getByText('30')).toBeTruthy()

    rerender(kpi([series([7])]))
    rerender(kpi([series([10, 20, 30, 40, 50])]))
    expect(screen.getByText('150')).toBeTruthy()
    expect(screen.queryByText('2026-07-03')).toBeNull()
  })
})
