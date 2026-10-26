import { render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { expect, it, vi } from 'vitest'
import LiveVisitorMap from '@/components/live-map/visitor-map'
import { CRASHED, CrashBoundary, withoutWebGL2 } from '@/test/no-webgl'

// Same constructor, same throw: on Live the map is the page's backdrop, and losing it took the
// visitor panel, which needs no WebGL at all, down with it.
it('keeps the page up with a note where the map would be when the browser has no WebGL2', () => {
  withoutWebGL2()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  render(
    <Provider store={createStore()}>
      <CrashBoundary>
        <LiveVisitorMap visitors={[]} />
      </CrashBoundary>
    </Provider>,
  )

  expect(screen.queryByText(CRASHED)).toBeNull()
  screen.getByText('Map unavailable in this browser')
})
