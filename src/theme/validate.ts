import { composite, contrast } from '../lib/color/contrast'
import { fromHex, type Oklch } from '../lib/color/oklch'
import type { CompiledDataPalette } from './data-palette'
import { error, type Issue, type RuleId, warning } from './format'
import { IDENTITY_HUES, identityContrast, syntaxGround } from './registry'
import type { Contrast, Polarity, TokenName } from './tokens'

// Validation rules V1–V11. V12 and V13 are raised while parsing, and so is V5 for a surface the file
// sets see-through; here V5 catches an input the registry derived from a see-through line. Standard
// floors are Pug's own measured ratio less 10%, pinned below as constants so retuning Pug forces a
// deliberate floor update — the floors test re-measures them. High-contrast floors are the spec's APCA
// Lc 90 / 75 / 60 in WCAG terms (12 / 7 / 4.5), with 7:1 text on fills and 3:1 for lines and data —
// and never below the standard floor, where that asks for more.

type Ground = TokenName | 'syntax'
type InkClass = 'body' | 'secondary' | 'faint'

export const V2_PAIRS: { ink: TokenName; grounds: Ground[]; cls: InkClass }[] = [
  { ink: 'foreground', grounds: ['background', 'card', 'popover'], cls: 'body' },
  { ink: 'card-foreground', grounds: ['card'], cls: 'body' },
  { ink: 'popover-foreground', grounds: ['popover'], cls: 'body' },
  { ink: 'sidebar-foreground', grounds: ['sidebar'], cls: 'body' },
  { ink: 'sidebar-accent-foreground', grounds: ['sidebar-accent'], cls: 'body' },
  { ink: 'muted-foreground', grounds: ['background', 'card', 'popover', 'muted'], cls: 'secondary' },
  { ink: 'secondary-foreground', grounds: ['secondary'], cls: 'secondary' },
  { ink: 'accent-foreground', grounds: ['accent'], cls: 'secondary' },
  { ink: 'link', grounds: ['background', 'card'], cls: 'secondary' },
  { ink: 'positive', grounds: ['background', 'card'], cls: 'secondary' },
  { ink: 'caution', grounds: ['background', 'card'], cls: 'secondary' },
  { ink: 'negative', grounds: ['background', 'card'], cls: 'secondary' },
  { ink: 'chart-label', grounds: ['chart-background'], cls: 'secondary' },
  { ink: 'chart-marker-foreground', grounds: ['chart-marker-background'], cls: 'secondary' },
  { ink: 'syntax-keyword', grounds: ['syntax'], cls: 'secondary' },
  { ink: 'syntax-string', grounds: ['syntax'], cls: 'secondary' },
  { ink: 'syntax-class', grounds: ['syntax'], cls: 'secondary' },
  { ink: 'faint', grounds: ['background', 'card', 'popover'], cls: 'faint' },
]

const HIGH = { body: 12, secondary: 7, faint: 4.5, fill: 7, data: 3, identity: 4.5, heat: 4.5, nonText: 3 }
const FILL_STANDARD = 4.5
export const FILL_PAIRS: [TokenName, TokenName][] = [
  ['primary-foreground', 'primary'],
  ['destructive-foreground', 'destructive'],
  ['sidebar-primary-foreground', 'sidebar-primary'],
]
const BLACK = { l: 0, c: 0, h: 0, alpha: 1 }

export type Floors = {
  v2: Record<string, number>
  data: number
  avatars: number
  identity: number
  heat: number
}

/** Pinned standard floors per mode. Regenerate with measureFloors() when Pug is retuned. */
export const FLOORS: Record<Polarity, Floors> = {
  light: {
    v2: {
      'foreground@background': 7,
      'foreground@card': 7,
      'foreground@popover': 7,
      'card-foreground@card': 7,
      'popover-foreground@popover': 7,
      'sidebar-foreground@sidebar': 7,
      'sidebar-accent-foreground@sidebar-accent': 6.31,
      'muted-foreground@background': 4.77,
      'muted-foreground@card': 4.98,
      'muted-foreground@popover': 4.98,
      'muted-foreground@muted': 4.32,
      'secondary-foreground@secondary': 6.31,
      'accent-foreground@accent': 6.31,
      'link@background': 5.77,
      'link@card': 6.03,
      'positive@background': 5.77,
      'positive@card': 6.03,
      'caution@background': 5.78,
      'caution@card': 6.04,
      'negative@background': 5.78,
      'negative@card': 6.04,
      'chart-label@chart-background': 4.77,
      'chart-marker-foreground@chart-marker-background': 7,
      'syntax-keyword@syntax': 3.82,
      'syntax-string@syntax': 4.13,
      'syntax-class@syntax': 4.01,
      'faint@background': 2.87,
      'faint@card': 3,
      'faint@popover': 3,
    },
    data: 3.7,
    avatars: 6.72,
    identity: 4.5,
    heat: 2.83,
  },
  dark: {
    v2: {
      'foreground@background': 7,
      'foreground@card': 7,
      'foreground@popover': 7,
      'card-foreground@card': 7,
      'popover-foreground@popover': 7,
      'sidebar-foreground@sidebar': 7,
      'sidebar-accent-foreground@sidebar-accent': 7,
      'muted-foreground@background': 6.1,
      'muted-foreground@card': 6.1,
      'muted-foreground@popover': 5.7,
      'muted-foreground@muted': 5.54,
      'secondary-foreground@secondary': 7,
      'accent-foreground@accent': 6.43,
      'link@background': 5.5,
      'link@card': 5.5,
      'positive@background': 6.37,
      'positive@card': 6.37,
      'caution@background': 6.25,
      'caution@card': 6.25,
      'negative@background': 5.65,
      'negative@card': 5.65,
      'chart-label@chart-background': 6.1,
      'chart-marker-foreground@chart-marker-background': 7,
      'syntax-keyword@syntax': 6.87,
      'syntax-string@syntax': 7,
      'syntax-class@syntax': 7,
      'faint@background': 4.07,
      'faint@card': 4.07,
      'faint@popover': 3.8,
    },
    data: 3.76,
    avatars: 6.72,
    identity: 4.5,
    heat: 2.83,
  },
}

export type Subject = {
  tokens: Record<TokenName, Oklch>
  data: CompiledDataPalette
  polarity: Polarity
  contrast: Contrast
}

const groundValue = (s: Subject, ground: Ground) =>
  ground === 'syntax' ? syntaxGround(t => s.tokens[t]) : s.tokens[ground]

const dataColors = (data: CompiledDataPalette) => [
  ...Object.values(data.events).map(c => c.line),
  ...data.families.flatMap(f => f.palette.map(c => c.line)),
  ...data.categorical.map(c => c.line),
]

const minOf = (values: number[]) => Math.min(...values)

// Each ratio is measured one way, shared by the floor generator and the rules, so the two can't drift.
const HEAT_STOPS = [1, 2, 3, 4, 5, 6, 7] as const
const heatRatio = (t: Record<TokenName, Oklch>, n: (typeof HEAT_STOPS)[number]) =>
  contrast(t[`heat-${n}-ink`], t[`heat-${n}`])
const dataRatio = (hex: string, canvas: Oklch) => contrast(fromHex(hex), canvas)
const avatarRatio = (hex: string) => contrast(BLACK, fromHex(hex))

// Pug's ratio less 10%, capped at 7:1 — past AAA, more contrast is taste, not legibility, and a
// lighter canvas can't always reach what Pug's does.
const floor90 = (ratio: number) => Math.min(7, Math.floor(ratio * 0.9 * 100) / 100)

/** Measures every standard floor from a subject (Pug) — what FLOORS was generated from. */
export const measureFloors = (s: Subject): Floors => {
  const v2: Record<string, number> = {}
  for (const pair of V2_PAIRS) {
    for (const ground of pair.grounds) {
      v2[`${pair.ink}@${ground}`] = floor90(contrast(s.tokens[pair.ink], groundValue(s, ground)))
    }
  }
  const surface = s.tokens['identity-surface']
  const identityInk = s.tokens['identity-ink']
  return {
    v2,
    data: floor90(minOf(dataColors(s.data).map(hex => dataRatio(hex, s.tokens.background)))),
    avatars: floor90(minOf(s.data.avatars.map(avatarRatio))),
    // Chips are aria-hidden initials — AA is the bar, even where Pug clears more.
    identity: Math.min(4.5, floor90(identityContrast(identityInk, surface))),
    heat: floor90(minOf(HEAT_STOPS.map(n => heatRatio(s.tokens, n)))),
  }
}

export const validateTheme = (s: Subject): Issue[] => {
  const issues: Issue[] = []
  const high = s.contrast === 'high'
  const floors = FLOORS[s.polarity]
  const t = s.tokens
  const warn = (rule: RuleId, path: string, message: string) => issues.push(warning(rule, path, message))
  const ratio = (r: number) => `${r.toFixed(2)}:1`

  // V1 — the variant's mode has to agree with its canvas, or every dark: style is wrong.
  const bgL = t.background.l
  if (s.polarity === 'dark' ? bgL >= 0.5 : bgL <= 0.5) {
    issues.push(error('V1', 'background', `A ${s.polarity} variant needs a ${s.polarity} background`))
  }

  // V2 — ink on every ground it renders on.
  for (const pair of V2_PAIRS) {
    // Faint is decorative at standard contrast: FLOORS measures it, but only high contrast holds it.
    if (pair.cls === 'faint' && !high) continue
    for (const ground of pair.grounds) {
      const measured = contrast(t[pair.ink], groundValue(s, ground))
      const floor = high ? HIGH[pair.cls] : floors.v2[`${pair.ink}@${ground}`]
      if (measured < floor)
        warn('V2', pair.ink, `${pair.ink} on ${ground} is ${ratio(measured)}; needs ${ratio(floor)}`)
    }
  }

  // V3 — text on filled controls.
  for (const [inkName, fill] of FILL_PAIRS) {
    const measured = contrast(t[inkName], t[fill])
    const floor = high ? HIGH.fill : FILL_STANDARD
    if (measured < floor) warn('V3', inkName, `${inkName} on ${fill} is ${ratio(measured)}; needs ${ratio(floor)}`)
  }

  // V4 — the surface ladder.
  const below = (a: TokenName, b: TokenName, orEqual = false) => {
    const ok = orEqual ? t[a].l <= t[b].l + 1e-9 : t[a].l < t[b].l
    if (!ok) warn('V4', a, `${a} must sit ${orEqual ? 'at or ' : ''}below ${b}`)
  }
  if (s.polarity === 'dark') {
    below('sidebar', 'background')
    below('background', 'card', true)
    below('card', 'popover')
    below('popover', 'accent')
    below('sidebar-accent', 'card')
  } else {
    for (const chip of ['secondary', 'muted', 'accent'] as const) below(chip, 'background')
    below('background', 'card', true)
    below('card', 'popover', true)
    below('sidebar', 'background')
  }

  // V5 — form controls use dark:bg-input/30, and /NN multiplies alpha away.
  if (t.input.alpha < 0.999) warn('V5', 'input', 'input must be opaque')

  // V6 — chip ink never louder than body ink.
  const body = contrast(t.foreground, t.background)
  for (const [inkName, surface] of [
    ['secondary-foreground', 'secondary'],
    ['accent-foreground', 'accent'],
  ] as const) {
    if (contrast(t[inkName], t[surface]) > body + 1e-9) {
      warn('V6', inkName, `${inkName} must not have more contrast than foreground on background`)
    }
  }

  // V7 — every fitted data colour reads against the canvas.
  const dataFloor = high ? Math.max(HIGH.data, floors.data) : floors.data
  for (const hex of new Set(dataColors(s.data))) {
    const measured = dataRatio(hex, t.background)
    if (measured < dataFloor)
      warn('V7', 'data', `data colour ${hex} is ${ratio(measured)} on the canvas; needs ${ratio(dataFloor)}`)
  }

  // V8 — avatar discs carry DiceBear's black line art.
  for (const hex of s.data.avatars) {
    const measured = avatarRatio(hex)
    if (measured < floors.avatars)
      warn('V8', 'data.avatars', `avatar ${hex} is ${ratio(measured)} under black line art`)
  }

  // V9 — name chips, sampled at 12 hues, every 30°: a name can hash to any degree in between.
  const identityFloor = high ? Math.max(HIGH.identity, floors.identity) : floors.identity
  for (const h of IDENTITY_HUES) {
    const measured = contrast({ ...t['identity-ink'], h }, { ...t['identity-surface'], h })
    if (measured < identityFloor) {
      warn('V9', 'identity-ink', `identity-ink at hue ${h} is ${ratio(measured)}; needs ${ratio(identityFloor)}`)
      break
    }
  }

  // V10 — heatmap cell text.
  const heatFloor = high ? Math.max(HIGH.heat, floors.heat) : floors.heat
  for (const n of HEAT_STOPS) {
    const measured = heatRatio(t, n)
    if (measured < heatFloor)
      warn('V10', `heat-${n}-ink`, `heat-${n}-ink is ${ratio(measured)}; needs ${ratio(heatFloor)}`)
  }

  // V11 — in high contrast, lines must be visible as non-text.
  if (high) {
    for (const line of ['border', 'input', 'sidebar-border'] as const) {
      const measured = contrast(composite(t[line], t.background), t.background)
      if (measured < HIGH.nonText) warn('V11', line, `${line} is ${ratio(measured)}; needs ${ratio(HIGH.nonText)}`)
    }
  }
  return issues
}
