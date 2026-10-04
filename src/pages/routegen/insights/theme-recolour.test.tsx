import { create } from '@bufbuild/protobuf'
import { act, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { GetFilterSchemaResponseSchema } from '@/api/genproto/common/v1/filter_schema_pb'
import { QueryResponseSchema } from '@/api/genproto/shared/insights/v1/insights_pb'

const { query, getFilterSchema } = vi.hoisted(() => ({ query: vi.fn(), getFilterSchema: vi.fn() }))

vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 400 }),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { insightsRPCAtom: atom({ query, getFilterSchema }) }
})

vi.mock('@/data/workspace.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/workspace.atoms')>()
  const { atom } = await import('jotai')
  return {
    ...actual,
    activeProjectAtom: atom({ id: 'p1', displayName: 'Test' }),
    projectHeaderAtom: atom({ 'x-project-id': 'p1' }),
    activeProjectTimezoneAtom: atom('UTC'),
  }
})

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  analyticsEnabled: false,
}))

const Insights = (await import('./index.page')).default
const { compiledThemeAtom, installedThemesAtom, themeModeAtom, themeSelectionAtom } = await import('@/data/theme.atoms')
const { setSeriesPalette } = await import('@/lib/event-colors')

// A dark theme that recolours page_view and nothing else of note.
const EMBER = {
  id: 'installed-ember',
  text: JSON.stringify({
    version: 1,
    name: 'Ember',
    variants: { dark: { data: { events: { page_view: '#ff5f5f' } } } },
  }),
  hash: 'ember',
  installedAt: 0,
  source: 'file' as const,
}

// Two dark themes share a polarity, so a marker cached on anything but the theme revision keeps the
// first theme's colour while the chart beside it moves to the second's.
it('re-colours the event row markers when switching between two dark themes', async () => {
  query.mockResolvedValue(create(QueryResponseSchema, {}))
  getFilterSchema.mockResolvedValue(create(GetFilterSchemaResponseSchema, {}))
  const ef = JSON.stringify([
    { kind: 'page_view', filters: [] },
    { kind: 'click', filters: [] },
  ])
  window.history.replaceState(null, '', `/insights?ef=${encodeURIComponent(ef)}`)

  const store = createStore()
  store.set(themeModeAtom, 'dark')
  setSeriesPalette(store.get(compiledThemeAtom).data)
  render(
    <Provider store={store}>
      <Insights />
    </Provider>,
  )
  await waitFor(() => expect(query).toHaveBeenCalled())

  const marker = () => (screen.getByText('A').previousElementSibling as HTMLElement).style.background
  const pugDark = marker()
  expect(pugDark).not.toBe('')

  act(() => {
    store.set(installedThemesAtom, [EMBER])
    store.set(themeSelectionAtom, { light: 'pug', dark: EMBER.id })
    setSeriesPalette(store.get(compiledThemeAtom).data)
  })

  expect(marker()).not.toBe(pugDark)
})
