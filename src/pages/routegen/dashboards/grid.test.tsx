import { create } from '@bufbuild/protobuf'
import { render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { expect, it, vi } from 'vitest'
import { DashboardTileSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'

const { widths } = vi.hoisted(() => ({ widths: [] as number[] }))

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('react-grid-layout/legacy', async importOriginal => {
  const actual = await importOriginal<typeof import('react-grid-layout/legacy')>()
  const Responsive = (props: ComponentProps<typeof actual.Responsive>) => {
    widths.push(props.width)
    return <actual.Responsive {...props} />
  }
  return { ...actual, Responsive }
})

const { DashboardGrid } = await import('./grid')

it('lays tiles out at the measured container width from the first render', () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900)
  render(<DashboardGrid tiles={[create(DashboardTileSchema, { id: 't1' })]} renderTile={() => null} />)
  expect(widths[0]).toBe(900)
})
