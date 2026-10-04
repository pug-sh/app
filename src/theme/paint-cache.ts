import { compileVariant } from './compile'
import { chooseActive, type LibraryEntry } from './library'
import { POLARITIES, type Polarity } from './tokens'

// What the index.html script paints before React loads. Both modes are cached because the OS can
// flip between visits. Keep the key, the shape and the auto-contrast rule in sync with that script —
// paint-script.test.ts runs the real one against this output.

export const PAINT_CACHE_KEY = 'pug:theme-paint'

export type Paint = { builtin: string; standard: boolean } | { vars: Record<string, string>; standard: boolean }

export type PaintCache = { v: 1; autoContrast: boolean } & Record<Polarity, Paint>

export const buildPaintCache = (input: {
  selection: Record<Polarity, string>
  autoContrast: boolean
  library: LibraryEntry[]
}): PaintCache => {
  const paintFor = (polarity: Polarity): Paint => {
    // The script applies auto-contrast itself, against the live media query.
    const active = chooseActive({ ...input, polarity, autoContrast: false, moreContrast: false })
    const standard = active.family.contrast === 'standard'
    if (active.builtin) return { builtin: active.id, standard }
    return { vars: compileVariant(active).vars, standard }
  }
  const [light, dark] = POLARITIES.map(paintFor)
  return { v: 1, autoContrast: input.autoContrast, light, dark }
}

export const writePaintCache = (cache: PaintCache) => {
  try {
    localStorage.setItem(PAINT_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Private mode or a full quota: the next load paints Pug, then React corrects it.
  }
}
