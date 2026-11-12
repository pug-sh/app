import { create } from '@bufbuild/protobuf'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { useLayoutEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DashboardSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { DashboardHeader } from './dashboard-header'

const withTiles = create(DashboardSchema, { id: 'd1', displayName: 'One', tiles: [{ id: 't1' }] })
const noop = () => {}

// The page's text at its first commit, before an effect could load storage and hide the link.
const mount = (Header: typeof DashboardHeader) => {
  let firstCommit = ''
  const FirstCommit = () => {
    useLayoutEffect(() => {
      firstCommit = document.body.textContent ?? ''
    }, [])
    return null
  }
  render(
    <Provider>
      <Header
        dashboard={withTiles}
        editing={false}
        meta={null}
        autoFocusName={false}
        onPatchMeta={noop}
        globalTimeRange={undefined}
        globalGranularity={Granularity.UNSPECIFIED}
        onTimeRangeChange={noop}
        onGranularityChange={noop}
        onEdit={noop}
        onRequestDelete={noop}
        deleting={false}
        shareId=""
        sharing={false}
        onTogglePublic={noop}
      />
      <FirstCommit />
    </Provider>,
  )
  return firstCommit
}

// A page load, not a second mount: getOnInit reads storage when the atom is built, at import, so only
// fresh modules see what the last load stored.
const reload = async () => {
  cleanup()
  vi.resetModules()
  return mount((await import('./dashboard-header')).DashboardHeader)
}

describe('AI setup in the dashboard header', () => {
  it('is offered on a dashboard that already has tiles', () => {
    mount(DashboardHeader)
    expect(screen.getByRole('link', { name: 'AI setup' })).toBeTruthy()
  })

  // A link that flashes back for a commit on every load reads as never dismissed.
  it('stays dismissed on later loads, from their first commit', async () => {
    mount(DashboardHeader)
    fireEvent.click(screen.getByRole('button', { name: 'Hide AI setup' }))
    expect(screen.queryByText('AI setup')).toBeNull()

    expect(await reload()).not.toContain('AI setup')
    expect(screen.queryByText('AI setup')).toBeNull()
  })
})
