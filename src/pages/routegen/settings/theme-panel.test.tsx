import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clayFile } from '@/test/theme-repository'
import clay from '@/theme/__fixtures__/clay.json'
import { parseThemeObject } from '@/theme/format'
import { buildLibrary, type InstalledTheme } from '@/theme/library'
import { ACCESS_MODES, type AccessMode, STANDARD_ACCESS } from '@/theme/tokens'
import { compiledTheme, type GalleryTheme, galleryThemes, type Held } from './gallery-themes'
import ThemeLargePreview from './theme-large-preview'
import ThemePanel, { type ThemeActions } from './theme-panel'
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

const clayTheme: InstalledTheme = { ...grape, id: 'installed-clay', text: JSON.stringify(clay) }

const themeNamed = (name: string, held: Held | null = null) => {
  const library = buildLibrary([grape, midnight, muddy, clayTheme])
  const theme = galleryThemes({ held, shared: false, library, catalog: [] }).find(t => t.name === name)
  if (!theme) throw new Error(`no ${name}`)
  return theme
}

const mount = (theme: GalleryTheme, props: { actions?: ThemeActions; access?: AccessMode } = {}) => {
  const onUse = vi.fn()
  const onRemove = vi.fn()
  const actions = { buttons: [{ id: 'use', label: 'Use this theme', onClick: onUse }] }
  const panel = (next: typeof props) => (
    <ThemePanel
      theme={theme}
      polarity="light"
      access={STANDARD_ACCESS}
      id="panel"
      actions={actions}
      onRemove={onRemove}
      onClose={() => {}}
      {...next}
    />
  )
  const { rerender } = render(panel(props))
  return { onUse, onRemove, rerender: (next: typeof props) => rerender(panel(next)) }
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

  it('says which mode a theme lacks, in place of its versions', () => {
    mount(themeNamed('Grape'))
    expect(screen.getByText('No light version. Pug shows in light.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show light' })).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Show dark/ })).toHaveLength(4)
  })

  it('offers every version a theme holds', () => {
    mount(themeNamed('Pug'))
    for (const mode of ['light', 'dark']) {
      for (const version of [mode, `${mode}, high contrast`, `${mode}, colourblind`, `${mode}, both`]) {
        expect(screen.getByRole('button', { name: `Show ${version}` })).toBeTruthy()
      }
    }
    expect(screen.getAllByRole('button', { name: /^Show / })).toHaveLength(8)
  })

  it('opens on the version you see', () => {
    mount(themeNamed('Pug'), { access: ACCESS_MODES[1] })
    expect(pressed('Show light, high contrast')).toBe('true')
    expect(pressed('Show light')).toBe('false')
  })

  it('shows a version large without changing a setting', () => {
    const setItem = vi.spyOn(localStorage, 'setItem')
    const { onUse } = mount(themeNamed('Pug'))
    const large = () => within(screen.getByRole('region')).getAllByText('Overview')[0].closest('[aria-hidden]')
    const background = () => (large() as HTMLElement).style.getPropertyValue('--background')
    expect(background()).toBe('oklch(1 0 0)')
    fireEvent.click(screen.getByRole('button', { name: 'Show dark, both' }))
    expect(pressed('Show dark, both')).toBe('true')
    expect(pressed('Show light')).toBe('false')
    expect(background()).toBe('oklch(0.13 0.01 265)')
    expect(setItem).not.toHaveBeenCalled()
    expect(onUse).not.toHaveBeenCalled()
    setItem.mockRestore()
  })

  it('says tuned only on a hand-tuned version', () => {
    mount(themeNamed('Pug'))
    const tuned = (name: string) => screen.getByRole('button', { name }).textContent?.includes('tuned')
    for (const mode of ['light', 'dark']) {
      expect(tuned(`Show ${mode}`)).toBe(false)
      expect(tuned(`Show ${mode}, high contrast`)).toBe(true)
      expect(tuned(`Show ${mode}, colourblind`)).toBe(true)
      expect(tuned(`Show ${mode}, both`)).toBe(false)
    }
  })

  it('says nothing on a theme with no hand-tuning', () => {
    mount(themeNamed('Clay'))
    expect(screen.queryByText('tuned')).toBeNull()
  })

  it('applies a theme from its button', () => {
    const { onUse } = mount(themeNamed('Pug'))
    fireEvent.click(screen.getByRole('button', { name: 'Use this theme' }))
    expect(onUse).toHaveBeenCalledOnce()
  })

  it('offers the host’s buttons in order, the first as the main one, and its note under them', () => {
    const actions = {
      buttons: [
        { id: 'project', label: 'Use in this project', onClick: () => {} },
        { id: 'both', label: 'Make it my theme', onClick: () => {} },
      ],
      note: <p>Where it went.</p>,
    }
    mount(themeNamed('Pug'), { actions })
    const [main, other] = within(screen.getByRole('region')).getAllByRole('button', { name: /this project|my theme/ })
    expect(main.textContent).toBe('Use in this project')
    expect(main.className).toContain('bg-primary')
    expect(other.className).not.toContain('bg-primary')
    expect(screen.getByText('Where it went.')).toBeTruthy()
  })

  it('does nothing from a disabled button, and keeps it focusable', () => {
    const onUse = vi.fn()
    mount(themeNamed('Pug'), { actions: { buttons: [{ id: 'use', label: 'In use', disabled: true, onClick: onUse }] } })
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'In use' })
    expect(button.disabled).toBe(false)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(onUse).not.toHaveBeenCalled()
  })

  // A button keyed by its label is replaced when the label changes, and focus drops to the page.
  it('keeps a used button, and the focus, as its label changes and it moves', () => {
    const use = (label: string) => ({ id: 'project', label, onClick: () => {} })
    const mine = { id: 'both', label: 'Use this theme', onClick: () => {} }
    const { rerender } = mount(themeNamed('Pug'), { actions: { buttons: [mine, use('Only in this project')] } })
    const button = screen.getByRole('button', { name: 'Only in this project' })
    button.focus()
    rerender({
      actions: {
        buttons: [
          { ...use('In use'), disabled: true },
          { ...mine, label: 'Make it my theme' },
        ],
      },
    })
    expect(document.activeElement).toBe(button)
    expect(button.textContent).toBe('In use')
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
  const compiled = compiledTheme(
    { ...themeNamed('Pug'), id: 'clay-sample', family: parsed.family },
    'light',
    STANDARD_ACCESS,
  )

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
      <ThemeTile
        theme={theme}
        polarity="light"
        access={STANDARD_ACCESS}
        open={false}
        panelId="panel"
        source={source}
        onToggle={() => {}}
      />,
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
