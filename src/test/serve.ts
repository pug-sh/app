import { vi } from 'vitest'
import { fakeResponse } from './fake-response'

// A fetch that answers by URL and 404s everything else, for tests that mount a theme picker. The pickers
// ask for the catalog on mount, so a single canned answer would be read as the catalog too.
export const serveByUrl = (routes: Record<string, string>) => {
  const fetcher = vi.fn(async (url: string) =>
    Object.hasOwn(routes, url) ? fakeResponse(routes[url]) : fakeResponse('', { status: 404 }),
  )
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
