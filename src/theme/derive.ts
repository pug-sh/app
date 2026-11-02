import { contrast } from '../lib/color/contrast'
import { worstDeltaE } from '../lib/color/cvd'
import { clamp01, fromHex, type Oklch } from '../lib/color/oklch'
import { BUILTINS, builtinRoots } from './builtin'
import { EVENT_COLORS, groupOf } from './data-palette'
import type { DataSpec, ModeBlock, ThemeFamily, Variant } from './format'
import { highInkTarget } from './registry'
import { resolveTokens } from './resolve'
import { bisectLightness, fitted, solveFitted } from './solve'
import { type AccessMode, type Contrast, type Polarity, TOKENS, type TokenName } from './tokens'
import { FLOORS } from './validate'

// What a theme becomes in a mode: the colours and data the registry resolves. Colours a theme set are carried across,
// a mode block's values win over anything computed, and whatever's left falls to Pug's version of the mode. Pug itself
// sets every token, so its own values count as unset here, which is what leaves its blocks exact.

type Colors = Partial<Record<TokenName, Oklch>>
type Tokens = Record<TokenName, Oklch>
export type ModeInputs = { colors: Colors; data: DataSpec | undefined; level: Contrast }

const WHITE = { l: 1, c: 0, h: 0, alpha: 1 }
const BLACK = { l: 0, c: 0, h: 0, alpha: 1 }
const NO_DATA: DataSpec = { groups: {}, events: {}, adapt: true }

const FILLS = ['primary', 'destructive', 'success', 'warning'] as const
const CHARTS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const
const RAMPS = [
  'chart-scale-01',
  'chart-scale-02',
  'chart-scale-03',
  'chart-scale-04',
  'chart-scale-05',
  'chart-scale-pattern-color',
  'heat-1',
  'heat-2',
  'heat-3',
  'heat-4',
  'heat-5',
  'heat-6',
  'heat-7',
] as const

/** A colour keeps at least this much more contrast in high contrast than it had at standard. */
const HIGH_KEEPS = 1.15
const LINE_TARGET = 3.3
// V3's 7:1, with headroom. Pug High Contrast's fill lightness clears it at Pug's hue, not at every hue.
const FILL_TARGET = 7.2
const DARK_PAPER_CHROMA = 0.004
const GREY_PAPER = 0.002

const same = (a: Oklch, b: Oklch) => a.l === b.l && a.c === b.c && a.h === b.h && a.alpha === b.alpha

const pugVariant = (polarity: Polarity) => BUILTINS.pug.variants[polarity] as Variant
const pugColors = (polarity: Polarity) => pugVariant(polarity).colors as Tokens

const fillFor = (token: (typeof FILLS)[number], color: Oklch, root: Oklch, polarity: Polarity) => {
  const c = Math.min(color.c, root.c)
  if (token !== 'primary' && token !== 'destructive') return fitted(root.l, c, color.h)
  const ink = polarity === 'light' ? WHITE : BLACK
  const measure = (l: number) => contrast(fitted(l, c, color.h), ink)
  return fitted(bisectLightness(root.l, polarity, FILL_TARGET, measure), c, color.h)
}

const highContrastColors = (variant: Variant | undefined, polarity: Polarity) => {
  const roots = builtinRoots(polarity, 'high')
  const pug = pugColors(polarity)
  const set = variant?.colors ?? {}
  const own = (token: TokenName) => {
    const color = set[token]
    return color && !same(color, pug[token]) ? color : undefined
  }
  const standard = resolveTokens(variant, polarity, 'standard', builtinRoots(polarity, 'standard')).tokens
  const colors: Colors = {}

  const canvas = own('background')
  let paper = roots.background
  if (canvas) {
    if (polarity === 'dark') {
      paper = { ...paper, c: DARK_PAPER_CHROMA, h: canvas.c < GREY_PAPER ? paper.h : canvas.h }
    }
    colors.background = paper
  }
  for (const token of FILLS) {
    const color = own(token)
    if (color) colors[token] = fillFor(token, color, roots[token], polarity)
  }
  const crosshair = own('chart-crosshair')
  if (crosshair) colors['chart-crosshair'] = { ...roots['chart-crosshair'], h: crosshair.h }

  const ownContrast = (token: TokenName) => contrast(standard[token], standard.background) * HIGH_KEEPS
  for (const token of TOKENS) {
    const color = own(token)
    const target = highInkTarget(token, polarity)
    if (color && target !== null) {
      colors[token] = solveFitted(paper, polarity, Math.max(target, ownContrast(token)), color.c, color.h)
    }
  }
  for (const token of CHARTS) {
    const color = own(token)
    if (color) colors[token] = solveFitted(paper, polarity, Math.max(LINE_TARGET, ownContrast(token)), color.c, color.h)
  }
  const moved = paper.l - standard.background.l
  for (const token of RAMPS) {
    const color = own(token)
    if (color) colors[token] = fitted(clamp01(color.l + moved), color.c, color.h)
  }
  return { ...colors, ...variant?.modes?.['high-contrast']?.colors }
}

const overBlock = (data: DataSpec | undefined, block: ModeBlock | undefined) => {
  if (!block) return data
  const base = data ?? NO_DATA
  return {
    ...base,
    ...block.data,
    groups: { ...base.groups, ...block.data.groups },
    events: { ...base.events, ...block.data.events },
    adapt: block.data.adapt ?? base.adapt,
  }
}

type Role = 'good' | 'bad' | 'warn'

const STATUS = { good: 'positive', bad: 'negative', warn: 'caution' } as const
const OKABE_ITO: Record<Role, string[]> = {
  good: ['#0072b2', '#009e73'],
  bad: ['#d55e00', '#cc79a7'],
  warn: ['#f0e442', '#e69f00'],
}
// A link is underlined, so a status colour only has to avoid reading as one.
const LINK_GAP = 30
const LINK_CHROMA = 0.04
const SEARCH_STEPS = 8
const DATA_HEADROOM = 0.05

const hueGap = (a: number, b: number) => {
  const gap = Math.abs(a - b) % 360
  return gap > 180 ? 360 - gap : gap
}

/** The first candidate clear of the link. With none clear, the last: the link is already the odd one out. */
export const statusHue = (role: Role, link: Oklch) => {
  const hues = OKABE_ITO[role].map(hex => fromHex(hex).h)
  return hues.find(h => link.c < LINK_CHROMA || hueGap(h, link.h) > LINK_GAP) ?? hues[hues.length - 1]
}

const highest = <T>(items: T[], score: (item: T) => number) => {
  let best = items[0]
  let top = -1
  for (const item of items) {
    const value = score(item)
    if (value > top + 1e-9) {
      top = value
      best = item
    }
  }
  return best
}

// Each status colour is searched from its own contrast toward body text: it can gain contrast, never lose it, and
// never passes body text. Good against bad comes first, under the worst of the three deficiencies. Chroma stays at
// least Pug's, or a grey status colour leaves the hue nothing to carry.
const statusColors = (tokens: Tokens, polarity: Polarity, block: ModeBlock | undefined, exact: boolean) => {
  const pug = pugColors(polarity)
  const paper = tokens.background
  const body = tokens.foreground
  const stops = (role: Role) => {
    const token = STATUS[role]
    const tuned = block?.colors[token]
    if (tuned && exact) return [tuned]
    const h = tuned?.h ?? statusHue(role, tokens.link)
    const c = Math.max(tuned?.c ?? tokens[token].c, pug[token].c)
    const start = solveFitted(paper, polarity, contrast(tokens[token], paper), c, h)
    const spent = polarity === 'light' ? start.l <= body.l : start.l >= body.l
    if (spent) return [start]
    return Array.from({ length: SEARCH_STEPS + 1 }, (_, i) =>
      fitted(start.l + ((body.l - start.l) * i) / SEARCH_STEPS, c, h),
    )
  }
  const bads = stops('bad')
  const pairs = stops('good').flatMap(good => bads.map(bad => ({ good, bad })))
  const { good, bad } = highest(pairs, pair => worstDeltaE(pair.good, pair.bad))
  const warn = highest(stops('warn'), stop =>
    Math.min(worstDeltaE(stop, good), worstDeltaE(stop, bad), worstDeltaE(stop, body)),
  )
  return {
    positive: good,
    negative: bad,
    caution: warn,
    success: fitted(tokens.success.l, tokens.success.c, good.h),
    warning: fitted(tokens.warning.l, tokens.warning.c, warn.h),
  }
}

const isOutcome = (event: string) => {
  if (!Object.hasOwn(EVENT_COLORS, event)) return false
  const group = groupOf(event)
  return group === 'failure' || group === 'success'
}

// A breakdown colour stays as hand-fitted unless the paper leaves it short of the data floor. Moving the whole list
// together bunches it up on the palest dark canvases.
const reachData = (color: Oklch, paper: Oklch, polarity: Polarity) => {
  const floor = FLOORS[polarity].data + DATA_HEADROOM
  return contrast(color, paper) >= floor ? color : solveFitted(paper, polarity, floor, color.c, color.h)
}

// Outcomes take Pug Colourblind-safe's two anchors in every theme. Those are the pair that stays apart, and a chart
// has no link to step around.
const colourblindData = (
  data: DataSpec | undefined,
  paper: Oklch,
  polarity: Polarity,
  block: ModeBlock | undefined,
  exact: boolean,
) => {
  const pug = pugVariant(polarity).modes?.colourblind?.data as ModeBlock['data'] & { categorical: Oklch[] }
  const events = Object.fromEntries(Object.entries(data?.events ?? {}).filter(([event]) => !isOutcome(event)))
  const groups = { ...data?.groups, failure: pug.groups.failure, success: pug.groups.success }
  const tuned = block?.data.categorical
  const categorical = tuned && exact ? tuned : (tuned ?? pug.categorical).map(c => reachData(c, paper, polarity))
  return { ...overBlock({ ...(data ?? NO_DATA), events, groups }, block), categorical } as DataSpec
}

export const modeInputs = (family: ThemeFamily, polarity: Polarity, access: AccessMode): ModeInputs => {
  const variant = family.variants[polarity]
  // A file marked high contrast says its own colours already are, so raising it would change nothing it means.
  const raised = access.contrast === 'high' && family.contrast === 'standard'
  const level = raised || family.contrast === 'high' ? 'high' : 'standard'
  const colors = raised ? highContrastColors(variant, polarity) : (variant?.colors ?? {})
  const data = raised ? overBlock(variant?.data, variant?.modes?.['high-contrast']) : variant?.data
  if (access.vision === 'standard') return { colors, data, level }

  // Both at once is always computed: the colourblind block's hues carry over, its other colours don't.
  const block = variant?.modes?.colourblind
  const exact = !raised
  const { tokens } = resolveTokens({ colors }, polarity, level, builtinRoots(polarity, level))
  return {
    colors: { ...colors, ...statusColors(tokens, polarity, block, exact), ...(exact ? block?.colors : undefined) },
    data: colourblindData(data, tokens.background, polarity, block, exact),
    level,
  }
}
