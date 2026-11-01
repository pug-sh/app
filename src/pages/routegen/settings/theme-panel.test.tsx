import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clayFile } from '@/test/theme-repository'
import { parseThemeObject } from '@/theme/format'
import { buildLibrary, type InstalledTheme } from '@/theme/library'
import { compiledTheme, type GalleryTheme, galleryThemes, type Held } from './gallery-themes'
import ThemeLargePreview from './theme-large-preview'
import ThemePanel from './theme-panel'
import ThemeTile from './theme-tile'

const grape: InstalledTheme = {
  id: 'installed-grape',
  text: JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } }),
  hash: 'grape',
  installedAt: 0,
  source: 'file',
}
const midnight: InstalledTheme = { ...grape, id: 'installed-midnight', text: '{"version":2,"name":"Midnight"}' }
const muddy: InstalledTheme = {
  ...grape,
  id: 'installed-muddy',
  text: JSON.stringify({
    version: 1,
    name: 'Muddy',
    variants: { light: { colors: { foreground: '#bbbbbb' } } },
  }),
}

const themeNamed = (name: string, held: Held | null = null) => {
  const library = buildLibrary([grape, midnight, muddy])
  const theme = galleryThemes({ held, shared: false, library, catalog: [] }).find(t => t.name === name)
  if (!theme) throw new Error(`no ${name}`)
  return theme
}

const mount = (theme: GalleryTheme, props: { useLabel?: string; heldLabel?: string } = {}) => {
  const onUse = vi.fn()
  const onRemove = vi.fn()
  render(
    <ThemePanel
      theme={theme}
      polarity="light"
      id="panel"
      useLabel="Use this theme"
      heldLabel="In use"
      onUse={onUse}
      onRemove={onRemove}
      onClose={() => {}}
      {...props}
    />,
  )
  return { onUse, onRemove }
}

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ThemePanel', () => {
  it('shows every mode a theme has, and looking at one changes no setting', () => {
    const { onUse } = mount(themeNamed('Pug'))
    expect(pressed('Show light')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Show dark' }))
    expect(pressed('Show dark')).toBe('true')
    expect(pressed('Show light')).toBe('false')
    expect(onUse).not.toHaveBeenCalled()
  })

  it('says which mode a theme lacks, in place of its row', () => {
    mount(themeNamed('Grape'))
    expect(screen.getByText('No light version. Pug shows in light.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show light' })).toBeNull()
  })

  it('applies a theme from its button', () => {
    const { onUse } = mount(themeNamed('Pug'))
    fireEvent.click(screen.getByRole('button', { name: 'Use this theme' }))
    expect(onUse).toHaveBeenCalledOnce()
  })

  it('reads In use on what the slot holds, does nothing, and stays focusable', () => {
    const { onUse } = mount(themeNamed('Pug', { target: 'pug', family: null }))
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'In use' })
    expect(button.disabled).toBe(false)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(onUse).not.toHaveBeenCalled()
  })

  it('keeps its label on a held theme when no held label is given', () => {
    const { onUse } = mount(themeNamed('Pug', { target: 'pug', family: null }), {
      useLabel: 'Choose this theme',
      heldLabel: undefined,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Choose this theme' }))
    expect(onUse).toHaveBeenCalledOnce()
  })

  it('shows an installed theme’s checks, and removes it on the second click', () => {
    const { onRemove } = mount(themeNamed('Muddy'))
    expect(screen.getAllByText(/foreground on background is/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Remove theme' }))
    expect(onRemove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('says when an installed theme passed its checks', () => {
    mount(themeNamed('Grape'))
    expect(screen.getByText('Checks passed.')).toBeTruthy()
  })

  it('offers an unusable theme its issues and Remove, and nothing to use', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const theme = themeNamed('Midnight')
    mount(theme)
    expect(theme.entry?.issues.length).toBeGreaterThan(0)
    expect(screen.getByText(theme.entry?.issues[0].message ?? '')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use this theme' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show light' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove theme' })).toBeTruthy()
  })
})

describe('ThemeLargePreview', () => {
  const parsed = parseThemeObject({
    ...clayFile('1.0.0'),
    variants: { light: { colors: { background: '#f3eee4', primary: '#8a3b12' } } },
  })
  if (!parsed.ok) throw new Error('refused')
  const compiled = compiledTheme({ ...themeNamed('Pug'), id: 'clay-sample', family: parsed.family }, 'light')

  it('scopes the theme’s own tokens onto itself', () => {
    const { container } = render(<ThemeLargePreview compiled={compiled} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.getPropertyValue('--primary')).toBe(compiled.vars['--primary'])
    expect(root.getAttribute('aria-hidden')).toBe('true')
  })

  it('shows the status colours a tile can’t', () => {
    const { container } = render(<ThemeLargePreview compiled={compiled} />)
    expect(container.querySelector('.text-positive')).toBeTruthy()
    expect(container.querySelector('.text-negative')).toBeTruthy()
  })
})

describe('ThemeTile', () => {
  const mountTile = (theme: GalleryTheme, source?: string) =>
    render(
      <ThemeTile theme={theme} polarity="light" open={false} panelId="panel" source={source} onToggle={() => {}} />,
    )

  it('says only its name and mode note, and carries its source as a description', () => {
    mountTile(themeNamed('Grape'), 'Installed')
    const tile = screen.getByRole('button', { name: 'Grape, Dark only' })
    const described = document.getElementById(tile.getAttribute('aria-describedby') ?? '')
    expect(described?.textContent).toContain('Installed')
  })

  it('marks what the slot holds with more than colour', () => {
    mountTile(themeNamed('Pug', { target: 'pug', family: null }))
    const tile = screen.getByRole('button', { name: 'Pug' })
    expect(tile.getAttribute('aria-pressed')).toBe('true')
    expect(tile.querySelector('.lucide-check')).toBeTruthy()
  })

  it('draws no preview for a theme it can’t use', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mountTile(themeNamed('Midnight'))
    expect(screen.getByRole('button', { name: 'Midnight, Can’t be used' }).querySelector('svg')).toBeNull()
  })
})
