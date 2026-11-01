import type { ThemeChoice } from './choice'
import { compileOnce } from './compile'
import { chooseActive, type LibraryEntry } from './library'
import { POLARITIES, type Polarity, STANDARD_ACCESS } from './tokens'

// What index.html paints before React: each project with a theme of its own, and the member's own, both
// modes each. Keep the key, shape and auto-contrast rule in sync with it (paint-script.test.ts).

export const PAINT_CACHE_KEY = 'pug:theme-paint'

/** How many projects the cache remembers. The least recently painted go first. */
export const MAX_PAINTED_PROJECTS = 10

export type Paint = { builtin: string; standard: boolean } | { vars: Record<string, string>; standard: boolean }
export type ModePaints = Record<Polarity, Paint>
export type ProjectPaint = ModePaints & { pin?: Polarity }

export type PaintCache = {
  v: 2
  autoContrast: boolean
  /** The project visited most recently, while it has a theme of its own: what `/` paints, since it redirects there. */
  last?: string
  /** The member's own choice, for every page without a project paint. */
  personal: ModePaints
  projects: Record<string, ProjectPaint>
}

const paintsFor = (selection: Record<Polarity, string>, library: LibraryEntry[]): ModePaints => {
  const paintFor = (polarity: Polarity): Paint => {
    // The script applies auto-contrast itself, against the live media query.
    const active = chooseActive({ selection, library, polarity, access: STANDARD_ACCESS })
    const standard = active.family.contrast === 'standard'
    if (active.builtin) return { builtin: active.id, standard }
    return { vars: compileOnce(active).vars, standard }
  }
  const [light, dark] = POLARITIES.map(paintFor)
  return { light, dark }
}

type Carried = Pick<PaintCache, 'projects' | 'last'>

/** The project paints a stored version 2 cache carries forward, or null. */
export const readPaintCache = (): Carried | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(PAINT_CACHE_KEY) ?? 'null')
    const { projects, last } = raw?.v === 2 ? raw : {}
    if (typeof projects !== 'object' || projects === null || Array.isArray(projects)) return null
    return { projects, last: typeof last === 'string' ? last : undefined }
  } catch {
    // Unreadable is the same as absent.
    return null
  }
}

export const buildPaintCache = (input: {
  previous: Carried | null
  projectId: string | null
  choice: ThemeChoice
  personal: Record<Polarity, string>
  autoContrast: boolean
  library: LibraryEntry[]
}): PaintCache => {
  const projects = { ...input.previous?.projects }
  let last = input.previous?.last
  if (input.projectId) {
    // Re-inserted so it moves to the end: key order is the recency the trim below reads. Project ids
    // are 20-character xids, never integer-like keys that objects would sort first.
    delete projects[input.projectId]
    // A project on the member's own theme gets no entry: the script paints `personal` there, which
    // follows their choice wherever they change it. An entry would keep the theme it had at the time.
    if (input.choice.source !== 'personal') {
      const paint: ProjectPaint = paintsFor(input.choice.selection, input.library)
      if (input.choice.pin) paint.pin = input.choice.pin
      projects[input.projectId] = paint
    }
    last = input.projectId
  }
  const kept = Object.fromEntries(Object.entries(projects).slice(-MAX_PAINTED_PROJECTS))
  const cache: PaintCache = {
    v: 2,
    autoContrast: input.autoContrast,
    personal: paintsFor(input.personal, input.library),
    projects: kept,
  }
  if (last && Object.hasOwn(kept, last)) cache.last = last
  return cache
}

export const writePaintCache = (cache: PaintCache) => {
  try {
    localStorage.setItem(PAINT_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Private mode or a full quota. A refused write leaves the old cache, which may name a theme
    // that's gone: drop it, so the next load paints Pug and React corrects it.
    try {
      localStorage.removeItem(PAINT_CACHE_KEY)
    } catch {
      // Storage refuses even that: the next load paints whatever is left, and React still corrects it.
    }
  }
}
