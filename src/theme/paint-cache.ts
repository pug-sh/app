import { paintKey } from './builtin'
import type { ThemeChoice } from './choice'
import { compileOnce } from './compile'
import { chooseActive, type LibraryEntry } from './library'
import type { Contrast, ContrastSetting, Polarity, Vision } from './tokens'

// What index.html paints before React: each project with a theme of its own, and the member's own, in both modes at
// both contrast levels, all in the member's colour vision. The script picks the level the way it picks the mode, from
// the setting or the OS. Keep the key, shape and contrast rule in sync with it (paint-script.test.ts).

export const PAINT_CACHE_KEY = 'pug:theme-paint'

/** How many projects the cache remembers. The least recently painted go first. */
export const MAX_PAINTED_PROJECTS = 10

export type Paint = { builtin: string } | { vars: Record<string, string> }
export type ModePaints = Record<Polarity, Record<Contrast, Paint>>
export type ProjectPaint = ModePaints & { pin?: Polarity }

export type PaintCache = {
  v: 3
  contrast: ContrastSetting
  vision: Vision
  /** The project visited most recently, while it has a theme of its own: what `/` paints, since it redirects there. */
  last?: string
  /** The member's own choice, for every page without a project paint. */
  personal: ModePaints
  projects: Record<string, ProjectPaint>
}

const paintsFor = (selection: Record<Polarity, string>, library: LibraryEntry[], vision: Vision): ModePaints => {
  const paintFor = (polarity: Polarity, contrast: Contrast): Paint => {
    const active = chooseActive({ selection, library, polarity, access: { contrast, vision } })
    if (active.builtin) return { builtin: paintKey(active.access) }
    return { vars: compileOnce(active).vars }
  }
  const levels = (polarity: Polarity) => ({
    standard: paintFor(polarity, 'standard'),
    high: paintFor(polarity, 'high'),
  })
  return { light: levels('light'), dark: levels('dark') }
}

type Carried = Pick<PaintCache, 'projects' | 'last'>

/**
 * The project paints a stored version 3 cache carries forward, or null. An older cache's paints have another shape, so
 * a project with a theme of its own paints the member's for one load. One carried across a change of colour vision
 * stays in the old one until that project is next visited.
 */
export const readPaintCache = (): Carried | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(PAINT_CACHE_KEY) ?? 'null')
    const { projects, last } = raw?.v === 3 ? raw : {}
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
  contrast: ContrastSetting
  vision: Vision
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
      const paint: ProjectPaint = paintsFor(input.choice.selection, input.library, input.vision)
      if (input.choice.pin) paint.pin = input.choice.pin
      projects[input.projectId] = paint
    }
    last = input.projectId
  }
  const kept = Object.fromEntries(Object.entries(projects).slice(-MAX_PAINTED_PROJECTS))
  const cache: PaintCache = {
    v: 3,
    contrast: input.contrast,
    vision: input.vision,
    personal: paintsFor(input.personal, input.library, input.vision),
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
