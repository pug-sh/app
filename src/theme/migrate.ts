// The one move from the two old built-ins and the auto-contrast switch to the two settings. It runs before the theme
// atoms read storage. Either old id anywhere counts as having asked for that look, the safer reading. The settings land
// before the selection loses the ids they're read from: a full quota refuses a new key while it still takes a shorter
// value for an old one, and the selection going first would lose the only record of a choice like High.

const SELECTION = 'pug:theme-selection'
const OVERRIDES = 'pug:theme-project-overrides'
const AUTO_CONTRAST = 'pug:theme-auto-contrast'
const CONTRAST = 'pug:theme-contrast'
const VISION = 'pug:theme-vision'

const OLD_HIGH_CONTRAST = 'pug-high-contrast'
const OLD_COLOURBLIND = 'pug-colourblind'

const read = (storage: Storage, key: string): unknown => {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

const asRecord = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const isOld = (id: unknown) => id === OLD_HIGH_CONTRAST || id === OLD_COLOURBLIND

export const migrateThemeStorage = (given?: Storage) => {
  try {
    // Reached for in here: a browser that blocks storage throws on the name alone, and this runs at import, before
    // main.tsx can show its page for that.
    const storage = given ?? localStorage
    // Written once the settings are safe, so its presence says the move is done and anything short of it runs again.
    if (storage.getItem(CONTRAST) !== null) return
    const selection = asRecord(read(storage, SELECTION))
    const overrides = asRecord(read(storage, OVERRIDES))
    const targets = [selection.light, selection.dark, ...Object.values(overrides)].map(value =>
      typeof value === 'string' ? value.split('#')[0] : null,
    )

    if (targets.includes(OLD_COLOURBLIND)) storage.setItem(VISION, JSON.stringify('colourblind'))
    let contrast = 'system'
    if (targets.includes(OLD_HIGH_CONTRAST)) contrast = 'high'
    else if (read(storage, AUTO_CONTRAST) === false) contrast = 'standard'
    storage.setItem(CONTRAST, JSON.stringify(contrast))

    if (isOld(selection.light) || isOld(selection.dark)) {
      const kept = (id: unknown) => (isOld(id) ? 'pug' : id)
      storage.setItem(SELECTION, JSON.stringify({ light: kept(selection.light), dark: kept(selection.dark) }))
    }
    storage.removeItem(AUTO_CONTRAST)
  } catch {
    // Storage refused: nothing is lost, and the next load tries again. A selection left holding an old id reads as Pug.
  }
}
