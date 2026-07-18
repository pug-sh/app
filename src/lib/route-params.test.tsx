import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Route, Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { useRouteParams } from './route-params'

// Profile routes carry a customer distinct ID, which is very often an email. Links encode it, and
// nothing in wouter reverses that — its own unescaping is decodeURI, which leaves `@` alone — so
// reading the param raw yields `a%40b.com` for both display and the RPC lookup.
const Probe = () => {
  const { profileId, sessionId } = useRouteParams<{ profileId: string; sessionId: string }>()
  return (
    <>
      <span data-testid="profile">{profileId}</span>
      <span data-testid="session">{sessionId}</span>
    </>
  )
}

const renderAt = (path: string) =>
  render(
    <Router hook={memoryLocation({ path }).hook}>
      <Route path="/p/:projectId/profiles/:profileId/sessions/:sessionId">
        <Probe />
      </Route>
    </Router>,
  )

describe('useRouteParams', () => {
  it('decodes reserved characters that decodeURI leaves escaped', () => {
    renderAt('/p/proj1/profiles/polurupraveen%40gmail.com/sessions/s1')
    expect(screen.getByTestId('profile').textContent).toBe('polurupraveen@gmail.com')
  })

  it('decodes every param, not just the first', () => {
    renderAt('/p/proj1/profiles/a%40b.com/sessions/sess%2F42')
    expect(screen.getByTestId('profile').textContent).toBe('a@b.com')
    expect(screen.getByTestId('session').textContent).toBe('sess/42')
  })

  it('leaves an already-plain param untouched', () => {
    renderAt('/p/proj1/profiles/anon_8f21c0de/sessions/s1')
    expect(screen.getByTestId('profile').textContent).toBe('anon_8f21c0de')
  })

  it('keeps the raw segment when the escape is malformed rather than throwing', () => {
    renderAt('/p/proj1/profiles/100%/sessions/s1')
    expect(screen.getByTestId('profile').textContent).toBe('100%')
  })
})
