import { create } from '@bufbuild/protobuf'
import { act, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { jwtFor } from '@/test/jwt'

const { orgsList, batchGet } = vi.hoisted(() => ({ orgsList: vi.fn(), batchGet: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    projectsRPCAtom: atom({ batchGet }),
    orgsRPCAtom: atom({ list: orgsList, get: vi.fn() }),
  }
})

// Beside the point here, and GoogleLogin throws outside the provider main.tsx (not App) supplies.
vi.mock('@/auth/google-sign-in-button', () => ({ GoogleSignInButton: () => null }))

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  isAnalyticsEnabled: () => false,
}))

const App = (await import('@/App')).default
const { jwtAtom, refreshTokenAtom } = await import('@/auth/jwt.atoms')

describe('the auth canvas across a change of screen', () => {
  // restoreMocks clears the factory's implementations before each test, and an undefined batchGet
  // fails the project fetch — which sets workspaceError, which is itself an auth screen.
  beforeEach(() => {
    batchGet.mockResolvedValue({ projects: [] })
  })

  it('holds one wall from sign-in through bootstrap to the org picker', async () => {
    orgsList.mockResolvedValue({
      orgs: [
        create(OrgSchema, { id: 'org-a', displayName: 'Acme', role: OrgRole.ADMIN }),
        create(OrgSchema, { id: 'org-b', displayName: 'Globex', role: OrgRole.MEMBER }),
      ],
    })

    const store = createStore()
    const { container } = render(
      <Provider store={store}>
        <Router hook={memoryLocation({ path: '/' }).hook}>
          <App />
        </Router>
      </Provider>,
    )

    await screen.findByText('Sign in to Pug')
    // Awaited, not read straight off: the wall is its own lazy chunk, so it arrives a tick behind
    // the form. Without this the test is vacuous — happy-dom reports 1024px so the wall's own media
    // query matches and it renders; a narrower default would leave both queries null and toBe would
    // then pass against nothing at all.
    await waitFor(() => expect(container.querySelector('.auth-wall-track')).not.toBeNull())
    const wall = container.querySelector('.auth-wall-track')

    // What signInAtom writes. App walks sign-in → bootstrap → picker from here, three different
    // children in the same slot, and only a canvas hoisted above them survives the walk.
    act(() => {
      store.set(refreshTokenAtom, 'refresh-token')
      store.set(jwtAtom, jwtFor('cust-1'))
    })

    // Generous: the picker is a lazy chunk, and vitest transforms it on first import.
    await screen.findByText('Pick where to start', {}, { timeout: 5000 })
    // Same node, not merely another one matching: a remount discards the element, and with it the
    // drift animation's position — the cards jump back to where they started.
    expect(container.querySelector('.auth-wall-track')).toBe(wall)
  })

  // The other half of the latch in App: bootstrap straddles both flows, so it cannot decide the
  // canvas on its own. A session restored from storage boots straight into it having shown no auth
  // screen at all, and must spend that wait on the plain spinner.
  it('boots a restored session on the plain spinner, never flashing the wall', async () => {
    // Held open so the checks below land mid-bootstrap — the one window a flash could occupy.
    let landOrg = () => {}
    orgsList.mockReturnValue(
      new Promise(resolve => {
        landOrg = () =>
          resolve({ orgs: [create(OrgSchema, { id: 'org-a', displayName: 'Acme', role: OrgRole.ADMIN })] })
      }),
    )

    const store = createStore()
    // What makes it *restored*: jwt.atoms reads storage synchronously, so App's very first render is
    // already authenticated and no auth screen precedes the bootstrap.
    store.set(refreshTokenAtom, 'refresh-token')
    store.set(jwtAtom, jwtFor('cust-1'))

    const { container } = render(
      <Provider store={store}>
        <Router hook={memoryLocation({ path: '/' }).hook}>
          <App />
        </Router>
      </Provider>,
    )

    // Bootstrap is genuinely in flight. Without this the two null checks pass against a tree that
    // never rendered — the same vacuous pass the test above guards against, in reverse.
    await waitFor(() => expect(orgsList).toHaveBeenCalled())
    expect(container.querySelector('.auth-wall-track')).toBeNull()
    // The canvas as a whole, not only the wall: its ground is the other half of the flash.
    expect(container.querySelector('.auth-surface')).toBeNull()

    await act(async () => {
      landOrg()
    })

    // Reached the app proper, so the spinner above was the bootstrap rather than a stalled render.
    expect(container.querySelector('[data-pug-no-capture]')).not.toBeNull()
    expect(container.querySelector('.auth-wall-track')).toBeNull()
  })
})
