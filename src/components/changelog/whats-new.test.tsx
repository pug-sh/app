import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serveByUrl } from '@/test/serve'
import { inZoneAsync } from '@/test/timezone'

vi.mock('@/analytics/pug', () => ({ trackEvent: vi.fn(), trackFeature: vi.fn() }))

const { ChangelogUnreadMark, WhatsNew } = await import('./whats-new')

const FEED = 'https://docs.pug.sh/changelog/feed.json'

const entry = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug,
  title: `Title ${slug}`,
  summary: `Read **${slug}** in [the docs](https://docs.pug.sh/${slug}/).`,
  date: '2026-11-10',
  tags: ['Dashboard'],
  pinned: false,
  url: `https://docs.pug.sh/changelog/${slug}/`,
  ...extra,
})

const ENTRIES = [
  entry('fresh', { date: '2026-11-17' }),
  entry('pinned', { date: '2026-11-10', pinned: true }),
  entry('old', { date: '2026-11-04' }),
]

const stored = () => JSON.parse(localStorage.getItem('pug:changelog') ?? 'null')

// A fresh store each time: the feed's hourly gate lives in the store, so a shared one would skip every later fetch.
const renderWhatsNew = () =>
  act(async () => {
    render(
      <Provider store={createStore()}>
        <WhatsNew />
      </Provider>,
    )
  })

const mount = async (record?: unknown, entries = ENTRIES) => {
  if (record !== undefined) localStorage.setItem('pug:changelog', JSON.stringify(record))
  const fetcher = serveByUrl({ [FEED]: JSON.stringify({ version: 1, entries }) })
  await renderWhatsNew()
  return fetcher
}

const button = () => screen.getByRole('button', { name: /^What's new/ })

beforeEach(() => {
  vi.stubEnv('VITE_CHANGELOG_ENABLED', 'true')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('WhatsNew', () => {
  it('reads everything already published as read on a first visit', async () => {
    await mount()
    expect(button().getAttribute('aria-label')).toBe("What's new")
    expect(stored()).toEqual({ seen: ['fresh', 'pinned', 'old'] })
  })

  it('counts what is unread, and opening the list reads it', async () => {
    await mount({ seen: ['pinned', 'old'] })
    expect(button().getAttribute('aria-label')).toBe("What's new, 1 unread")

    fireEvent.click(button())
    const link = await screen.findByRole('link', { name: 'Title fresh' })
    expect(link.getAttribute('href')).toBe('https://docs.pug.sh/changelog/fresh/')
    // The mark stays on what was new when the list opened.
    expect(link.closest('li')?.textContent).toContain('New:')
    expect(screen.getByRole('link', { name: 'Title old' }).closest('li')?.textContent).not.toContain('New:')

    const summary = link.closest('li')?.querySelector('.markdown-body a') as HTMLAnchorElement
    expect(summary.getAttribute('href')).toBe('https://docs.pug.sh/fresh/')
    expect(summary.getAttribute('target')).toBe('_blank')
    expect(summary.parentElement?.querySelector('strong')?.textContent).toBe('fresh')

    expect(button().getAttribute('aria-label')).toBe("What's new")
    expect(stored()).toEqual({ seen: ['fresh', 'pinned', 'old'] })
  })

  it('lists pins first', async () => {
    await mount({ seen: ['fresh', 'pinned', 'old'] })
    fireEvent.click(button())
    await screen.findByRole('link', { name: 'Title pinned' })
    const titles = screen.getAllByRole('link', { name: /^Title / }).map(link => link.textContent)
    expect(titles).toEqual(['Title pinned', 'Title fresh', 'Title old'])
  })

  it('keeps what another tab read', async () => {
    await mount({ seen: ['elsewhere', 'pinned', 'old'] })
    fireEvent.click(button())
    expect(stored()).toEqual({ seen: ['fresh', 'pinned', 'old', 'elsewhere'] })
  })

  it('counts a first feed with nothing usable as nothing read', async () => {
    await mount(undefined, [entry('bad', { url: 'http://docs.pug.sh/changelog/bad/' })])
    expect(stored()).toBeNull()
    expect(screen.queryByRole('button', { name: /^What's new/ })).toBeNull()
  })

  it('still opens when storage refuses the write', async () => {
    await mount({ seen: ['pinned', 'old'] })
    const refuse = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    fireEvent.click(button())
    refuse.mockRestore()
    await screen.findByRole('link', { name: 'Title fresh' })
    expect(button().getAttribute('aria-label')).toBe("What's new")
  })

  it('looks again when the tab comes back, at most hourly, even after a failure', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    await mount()
    const withLater = JSON.stringify({ version: 1, entries: [entry('later', { date: '2026-11-18' }), ...ENTRIES] })
    const returnToTab = async (routes: Record<string, string>) => {
      const fetcher = serveByUrl(routes)
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      return fetcher
    }
    const anHourOn = () => vi.setSystemTime(Date.now() + 60 * 60 * 1000)

    expect(await returnToTab({ [FEED]: withLater })).not.toHaveBeenCalled()
    anHourOn()
    expect(await returnToTab({ [FEED]: withLater })).toHaveBeenCalledOnce()
    expect(button().getAttribute('aria-label')).toBe("What's new, 1 unread")

    anHourOn()
    expect(await returnToTab({})).toHaveBeenCalledOnce()
    expect(button().getAttribute('aria-label')).toBe("What's new, 1 unread")
    expect(await returnToTab({ [FEED]: withLater })).not.toHaveBeenCalled()
  })

  it('dates an entry by its UTC day, with the year only when it is not this one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T20:00:00Z'))
    await inZoneAsync('America/Los_Angeles', async () => {
      const days = ['2026-11-17', '2026-01-01', '2025-12-31']
      await mount(
        { seen: days },
        days.map(date => entry(date, { date })),
      )
      fireEvent.click(button())
      await screen.findByRole('link', { name: 'Title 2026-11-17' })
      expect([...document.querySelectorAll('time')].map(time => time.textContent)).toEqual([
        'Nov 17',
        'Jan 1',
        'Dec 31, 2025',
      ])
    })
  })

  it('lists every entry, so opening it reads nothing it hides', async () => {
    const many = Array.from({ length: 12 }, (_, i) => entry(`e${i}`, { date: `2026-10-${10 + i}` }))
    await mount({ seen: [] }, many)
    fireEvent.click(button())
    await screen.findByRole('link', { name: 'Title e0' })
    expect(screen.getAllByRole('link', { name: /^Title / })).toHaveLength(12)
  })

  it.each([['junk'], [{}], [{ seen: 'x' }]])(
    'treats a stored record it cannot read as a first visit (%j)',
    async record => {
      await mount(record)
      expect(button().getAttribute('aria-label')).toBe("What's new")
      expect(stored()).toEqual({ seen: ['fresh', 'pinned', 'old'] })
    },
  )

  it('renders nothing when the feed fails', async () => {
    serveByUrl({})
    await renderWhatsNew()
    expect(screen.queryByRole('button', { name: /^What's new/ })).toBeNull()
  })

  it('asks for nothing and renders nothing unless the deployment turns it on', async () => {
    vi.stubEnv('VITE_CHANGELOG_ENABLED', '')
    const fetcher = await mount()
    expect(fetcher).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /^What's new/ })).toBeNull()
  })

  it('asks for nothing and renders nothing when air-gapped, even turned on', async () => {
    vi.stubEnv('VITE_AIR_GAP', 'true')
    const fetcher = await mount()
    expect(fetcher).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /^What's new/ })).toBeNull()
  })
})

describe('ChangelogUnreadMark', () => {
  const mountMark = async (record: unknown) => {
    localStorage.setItem('pug:changelog', JSON.stringify(record))
    const fetcher = serveByUrl({ [FEED]: JSON.stringify({ version: 1, entries: ENTRIES }) })
    let container = document.body
    await act(async () => {
      container = render(
        <Provider store={createStore()}>
          <ChangelogUnreadMark />
        </Provider>,
      ).container
    })
    return { fetcher, container }
  }

  it('loads the feed itself, since the sidebar may not be mounted, and shows while anything is unread', async () => {
    const { fetcher, container } = await mountMark({ seen: ['pinned', 'old'] })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(container.firstChild).not.toBeNull()
  })

  it('shows nothing once everything is read', async () => {
    const { container } = await mountMark({ seen: ['fresh', 'pinned', 'old'] })
    expect(container.firstChild).toBeNull()
  })
})
