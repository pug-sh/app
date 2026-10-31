import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Track } from '@/theme/repository'
import ThemeUpdates from './theme-updates'

const CLAY = ['2.0.0', '1.1.0', '1.0.0']

const mount = (track: Track, releases = CLAY) => {
  const onChange = vi.fn()
  render(<ThemeUpdates releases={releases} track={track} onChange={onChange} />)
  return onChange
}

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('ThemeUpdates', () => {
  it('shows the line it follows and what that is today', () => {
    mount({ kind: 'major', major: 2 })
    expect(pressed('Follow 2.x')).toBe('true')
    expect(pressed('Latest')).toBe('false')
    expect(screen.getByText('now 2.0.0')).toBeTruthy()
    expect(screen.queryByText(/is out/)).toBeNull()
  })

  it('switches to the latest', () => {
    const onChange = mount({ kind: 'major', major: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'latest' })
  })

  it('presses Latest when it follows the latest, and offers the newest line beside it', () => {
    mount({ kind: 'latest' })
    expect(pressed('Latest')).toBe('true')
    expect(pressed('Follow 2.x')).toBe('false')
  })

  it('says what an older line won’t reach, and picks another line from its menu', async () => {
    const onChange = mount({ kind: 'major', major: 1 })
    expect(screen.getByText('now 1.1.0')).toBeTruthy()
    expect(screen.getByText('2.0.0 is out. You stay on 1.x until you switch.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Follow 1.x' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '2.x, now 2.0.0' }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'major', major: 2 })
  })

  it('pins one release from the Only menu', async () => {
    const onChange = mount({ kind: 'major', major: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Only one release' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '1.0.0' }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'exact', release: '1.0.0' })
  })

  // Base UI leaves a radio item's menu open, and an open menu is modal: the pick saves and the page stays
  // locked behind it.
  it.each([
    ['Follow 1.x', '2.x, now 2.0.0'],
    ['Only one release', '1.1.0'],
  ])('closes the %s menu once something is picked', async (button, item) => {
    mount({ kind: 'major', major: 1 })
    fireEvent.click(screen.getByRole('button', { name: button }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: item }))
    await waitFor(() => expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0))
  })

  it('offers every release of a single line from the Only menu', async () => {
    const onChange = mount({ kind: 'major', major: 1 }, ['1.1.0', '1.0.0'])
    fireEvent.click(screen.getByRole('button', { name: 'Only one release' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '1.0.0' }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'exact', release: '1.0.0' })
  })

  it('reads the release it is pinned to', () => {
    mount({ kind: 'exact', release: '1.0.0' })
    expect(pressed('Only 1.0.0')).toBe('true')
    expect(screen.getByText('2.0.0 is out.')).toBeTruthy()
  })

  it('needs no menus for a theme with one release', () => {
    const onChange = mount({ kind: 'major', major: 1 }, ['1.0.0'])
    fireEvent.click(screen.getByRole('button', { name: 'Only one release' }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'exact', release: '1.0.0' })
    expect(screen.queryByRole('menuitemradio')).toBeNull()
  })

  it('follows with a plain button when there is one line', () => {
    const onChange = mount({ kind: 'latest' }, ['1.0.0'])
    fireEvent.click(screen.getByRole('button', { name: 'Follow 1.x' }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'major', major: 1 })
  })
})
