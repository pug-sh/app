import { describe, expect, it } from 'vitest'
import { migrateThemeStorage } from './migrate'

const SELECTION = 'pug:theme-selection'
const OVERRIDES = 'pug:theme-project-overrides'
const AUTO = 'pug:theme-auto-contrast'
const CONTRAST = 'pug:theme-contrast'
const VISION = 'pug:theme-vision'

// Stored as atomWithStorage stores it, so a row reads as what's in the browser. `refuse` names the keys it won't write.
const browser = (stored: Record<string, unknown> = {}) => {
  const items = new Map(Object.entries(stored).map(([key, value]) => [key, JSON.stringify(value)]))
  const refuse = new Set<string>()
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (refuse.has(key) || refuse.has('*')) throw new DOMException('full', 'QuotaExceededError')
      items.set(key, value)
    },
    removeItem: (key: string) => items.delete(key),
  } as unknown as Storage
  const read = (key: string) => {
    const value = items.get(key)
    return value === undefined ? undefined : JSON.parse(value)
  }
  return { storage, items, refuse, read }
}

const migrated = (stored: Record<string, unknown>) => {
  const page = browser(stored)
  migrateThemeStorage(page.storage)
  return page
}

const bothHigh = { light: 'pug-high-contrast', dark: 'pug-high-contrast' }
const pug = { light: 'pug', dark: 'pug' }

describe('migrateThemeStorage', () => {
  it('starts anyone new on Match system', () => {
    const { read } = migrated({})
    expect(read(CONTRAST)).toBe('system')
    expect(read(VISION)).toBeUndefined()
  })

  it('keeps auto contrast on as Match system', () => {
    const { read } = migrated({ [AUTO]: true })
    expect(read(CONTRAST)).toBe('system')
    expect(read(AUTO)).toBeUndefined()
  })

  it('turns auto contrast off into Standard', () => {
    const { read } = migrated({ [AUTO]: false })
    expect(read(CONTRAST)).toBe('standard')
    expect(read(AUTO)).toBeUndefined()
  })

  it('moves Pug High Contrast to Pug with contrast High', () => {
    const { read } = migrated({ [SELECTION]: bothHigh })
    expect(read(SELECTION)).toEqual(pug)
    expect(read(CONTRAST)).toBe('high')
  })

  // Contrast is one setting now, and High is the safer reading for someone who asked for it at all.
  it('takes High for both modes if either picked it', () => {
    const { read } = migrated({ [SELECTION]: { light: 'pug', dark: 'pug-high-contrast' } })
    expect(read(SELECTION)).toEqual(pug)
    expect(read(CONTRAST)).toBe('high')
  })

  it('moves Pug Colourblind to Pug with Colourblind-safe, and leaves the other mode', () => {
    const { read } = migrated({ [SELECTION]: { light: 'pug-colourblind', dark: 'installed-a' } })
    expect(read(SELECTION)).toEqual({ light: 'pug', dark: 'installed-a' })
    expect(read(VISION)).toBe('colourblind')
    expect(read(CONTRAST)).toBe('system')
  })

  it('moves both at once', () => {
    const { read } = migrated({ [SELECTION]: { light: 'pug-high-contrast', dark: 'pug-colourblind' } })
    expect(read(SELECTION)).toEqual(pug)
    expect(read(CONTRAST)).toBe('high')
    expect(read(VISION)).toBe('colourblind')
  })

  it('counts an override as a choice, and leaves it', () => {
    const overrides = { p1: 'pug-colourblind#dark', p2: 'pug-high-contrast' }
    const { read } = migrated({ [OVERRIDES]: overrides })
    expect(read(VISION)).toBe('colourblind')
    expect(read(CONTRAST)).toBe('high')
    expect(read(OVERRIDES)).toEqual(overrides)
  })

  it('takes High over auto contrast off', () => {
    expect(migrated({ [SELECTION]: bothHigh, [AUTO]: false }).read(CONTRAST)).toBe('high')
  })

  it('leaves a selection with neither old id as it was', () => {
    const selection = { light: 'installed-a', dark: 'pug' }
    const { items } = migrated({ [SELECTION]: selection })
    expect(items.get(SELECTION)).toBe(JSON.stringify(selection))
  })

  it('runs once, so a later Standard stays', () => {
    const { read } = migrated({ [CONTRAST]: 'standard', [SELECTION]: bothHigh, [AUTO]: true })
    expect(read(CONTRAST)).toBe('standard')
    expect(read(SELECTION)).toEqual(bothHigh)
    expect(read(AUTO)).toBe(true)
  })

  it('doesn’t throw on junk', () => {
    const page = browser()
    page.items.set(SELECTION, '{')
    page.items.set(OVERRIDES, '["pug-high-contrast"]')
    page.items.set(AUTO, 'nope')
    expect(() => migrateThemeStorage(page.storage)).not.toThrow()
    expect(page.read(CONTRAST)).toBe('system')
  })

  it('reads a selection that isn’t text as holding neither old id', () => {
    const { read } = migrated({ [SELECTION]: { light: 5, dark: null }, [OVERRIDES]: { p1: 7 } })
    expect(read(CONTRAST)).toBe('system')
  })

  it('leaves nothing half done when storage refuses, and finishes next load', () => {
    const page = browser({ [SELECTION]: bothHigh })
    page.refuse.add('*')
    expect(() => migrateThemeStorage(page.storage)).not.toThrow()
    expect(page.read(CONTRAST)).toBeUndefined()
    page.refuse.clear()
    migrateThemeStorage(page.storage)
    expect(page.read(CONTRAST)).toBe('high')
    expect(page.read(SELECTION)).toEqual(pug)
  })

  // A full quota refuses a new key while it still takes a shorter value for an old one. If the selection went first,
  // the only record that someone chose High would be gone before the setting that replaces it landed.
  it('keeps the old choice while the setting that replaces it can’t be written', () => {
    const page = browser({ [SELECTION]: bothHigh })
    page.refuse.add(CONTRAST)
    migrateThemeStorage(page.storage)
    expect(page.read(SELECTION)).toEqual(bothHigh)
    page.refuse.clear()
    migrateThemeStorage(page.storage)
    expect(page.read(CONTRAST)).toBe('high')
    expect(page.read(SELECTION)).toEqual(pug)
  })

  it('reads as done when only the selection can’t be rewritten: a retired id reads as Pug anyway', () => {
    const page = browser({ [SELECTION]: bothHigh })
    page.refuse.add(SELECTION)
    migrateThemeStorage(page.storage)
    expect(page.read(CONTRAST)).toBe('high')
    expect(page.read(SELECTION)).toEqual(bothHigh)
  })
})
