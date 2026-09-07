import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  type DashboardTile,
  DashboardTileSchema,
  InsightTileContentSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { AggregationType, InsightQuerySpecSchema, InsightType } from '@/api/genproto/shared/insights/v1/insights_pb'
import { DataTab } from './data-tab'

const tileWith = (aggregation: AggregationType) =>
  create(DashboardTileSchema, {
    id: 'tile-1',
    content: {
      case: 'insight',
      value: create(InsightTileContentSchema, {
        spec: create(InsightQuerySpecSchema, {
          insightType: InsightType.TRENDS,
          events: [{ event: { kind: 'page_view' }, aggregation }],
        }),
      }),
    },
  })

const specOf = (patch: Partial<DashboardTile>) =>
  patch.content?.case === 'insight' ? patch.content.value.spec : undefined

const renderTab = (aggregation: AggregationType) => {
  const patches: Partial<DashboardTile>[] = []
  render(<DataTab tile={tileWith(aggregation)} onPatch={patch => patches.push(patch)} />)
  return () => specOf(patches[patches.length - 1])
}

describe('dashboard tile editor cookieless opt-in', () => {
  // The editor rebuilds the spec in an effect whose deps are hand-maintained under a
  // useExhaustiveDependencies suppression, so a flag missing from that list flips the chip and
  // saves the old spec — silently, and with nothing for lint to catch.
  it('re-patches the tile spec when the toggle is flipped', () => {
    const spec = renderTab(AggregationType.UNIQUE_USERS)
    expect(spec()?.includeCookieless).toBe(false)

    fireEvent.click(screen.getByText('Cookieless excluded'))

    expect(spec()?.includeCookieless).toBe(true)
  })

  it('hides the toggle on a measure that counts events', () => {
    renderTab(AggregationType.TOTAL)
    expect(screen.queryByText('Cookieless excluded')).toBeNull()
  })
})
