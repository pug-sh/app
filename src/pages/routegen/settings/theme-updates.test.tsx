import { fireEvent, render, screen } from '@testing-library/react'
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

  it('says what an older line won’t reach, and picks another line from its menu', async () => {
    const onChange = mount({ kind: 'major', major: 1 })
    expect(screen.getByText('now 1.1.0')).toBeTruthy()
    expect(screen.getByText('2.0.0 is out. You stay on 1.x until you switch.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Follow 1.x' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '2.x, now 2.0.0' }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'major', major: 2 })
  })

  it('pins one release from the Only menu, and says when a later one is out', async () => {
    const onChange = mount({ kind: 'major', major: 2 })
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
})
