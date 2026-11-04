import { describe, expect, it } from 'vitest'
import { galleryThemes } from '@/pages/routegen/settings/gallery-themes'
import { MOSS } from '@/test/theme-gallery'
import { buildLibrary, type InstalledTheme } from '@/theme/library'
import { applyButtons, mainDestination, mainLabel, type Placement, unseenHint } from './apply'

const GRAPE: InstalledTheme = {
  ...MOSS,
  id: 'installed-grape',
  text: JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } }),
  hash: 'grape',
}

const themeNamed = (name: string) => {
  const theme = galleryThemes({ held: null, shared: false, library: buildLibrary([MOSS, GRAPE]), catalog: [] }).find(
    t => t.name === name,
  )
  if (!theme?.family) throw new Error(`no ${name}`)
  return { ...theme, family: theme.family }
}

const place = (placement: Partial<Placement> = {}): Placement => ({
  hasProject: true,
  split: false,
  mode: 'light',
  selection: { light: 'pug', dark: 'pug' },
  ...placement,
})

const labels = (name: string, placement: Placement) => applyButtons(themeNamed(name), placement).map(b => b.label)

describe('mainDestination', () => {
  it.each([
    [{}, 'both'],
    [{ split: true, mode: 'dark' as const }, 'dark'],
    [{ projectHolds: 'pug' }, 'project'],
    [{ projectHolds: 'pug', split: true }, 'project'],
  ])('goes where it shows: %o', (placement, destination) => {
    expect(mainDestination(place(placement))).toBe(destination)
  })

  it('names its button for where it goes', () => {
    expect(mainLabel(place())).toBe('Use this theme')
    expect(mainLabel(place({ split: true, mode: 'dark' }))).toBe('Use for dark')
    expect(mainLabel(place({ projectHolds: 'pug' }))).toBe('Use in this project')
  })
})

describe('applyButtons', () => {
  it('offers your theme first, then this project alone, when the project has no theme of its own', () => {
    expect(labels('Moss', place())).toEqual(['Use this theme', 'Only in this project'])
    expect(labels('Moss', place({ hasProject: false }))).toEqual(['Use this theme'])
  })

  it('offers this project first, then your theme, when the project has one', () => {
    expect(labels('Moss', place({ projectHolds: 'pug' }))).toEqual(['Use in this project', 'Make it my theme'])
  })

  it('reads what holds the theme already, and marks it held', () => {
    const selection = { light: MOSS.id, dark: MOSS.id }
    expect(labels('Moss', place({ selection }))).toEqual(['In use', 'Only in this project'])
    expect(labels('Moss', place({ projectHolds: MOSS.id }))).toEqual(['In use', 'Make it my theme'])
    expect(labels('Moss', place({ projectHolds: 'pug', selection }))).toEqual(['Use in this project', 'Your theme'])
    expect(applyButtons(themeNamed('Moss'), place({ selection })).map(b => b.held)).toEqual([true, false])
  })

  it('offers each mode once split, the one on screen first, and only modes the theme has', () => {
    expect(labels('Moss', place({ split: true, mode: 'dark' }))).toEqual([
      'Use for dark',
      'Use for light',
      'Only in this project',
    ])
    expect(labels('Grape', place({ split: true, mode: 'light', hasProject: false }))).toEqual(['Use for dark'])
  })

  it('says In use for the mode on screen and names the other', () => {
    const selection = { light: MOSS.id, dark: MOSS.id }
    expect(labels('Moss', place({ split: true, selection, hasProject: false }))).toEqual(['In use', 'Your dark theme'])
  })

  it('offers your light and dark theme in a project with its own, once split', () => {
    expect(labels('Moss', place({ projectHolds: 'pug', split: true, mode: 'dark' }))).toEqual([
      'Use in this project',
      'Make it my light theme',
      'Make it my dark theme',
    ])
  })
})

describe('unseenHint', () => {
  const hint = (placement: Placement, projectShowing = placement.projectHolds !== undefined) =>
    unseenHint(applyButtons(themeNamed('Moss'), placement), placement, projectShowing)
  const mine = { light: MOSS.id, dark: MOSS.id }

  it('says nothing while the theme is on screen, or held nowhere', () => {
    expect(hint(place({ selection: mine }))).toBeNull()
    expect(hint(place({ projectHolds: MOSS.id, selection: mine }))).toBeNull()
    expect(hint(place({ projectHolds: 'pug' }))).toBeNull()
  })

  it('says a project’s own theme covers yours', () => {
    expect(hint(place({ projectHolds: 'pug', selection: mine }))).toBe(
      'This project uses its own theme. Yours shows in projects without one.',
    )
  })

  it('says nothing about a project’s theme that isn’t showing, since yours is', () => {
    expect(hint(place({ projectHolds: 'pug', selection: mine }), false)).toBeNull()
  })

  it('says when you’ll see a mode you aren’t in', () => {
    expect(hint(place({ split: true, selection: { light: 'pug', dark: MOSS.id } }))).toBe('You’ll see it in dark mode.')
    expect(hint(place({ split: true, mode: 'dark', selection: { light: 'pug', dark: MOSS.id } }))).toBeNull()
  })
})
