import { composite, contrast } from '../lib/color/contrast'
import type { Oklch } from '../lib/color/oklch'
import { parseThemeObject } from './format'
import { pug } from './presets/pug'
import { solveLightness } from './solve'
import { type Contrast, type Polarity, TOKENS, type TokenName } from './tokens'

// The token registry: how every token a theme leaves out is computed from the ones it set — VSCode's
// colour-registry model. Standard-contrast parameters are measured from Pug at load, so applying the
// formulas to Pug's own roots reproduces Pug. High contrast never sits below standard: each target is
// the higher of its tier's level and 115% of Pug's own ratio. The levels are the spec's APCA Lc
// 90 / 75 / 60 in WCAG terms — 12:1 body, 7:1 secondary, 4.5:1 faint — plus headroom, because an ink
// solved against the canvas also lands on popovers and chips, which sit a step lighter.

export type Tier = 'body' | 'secondary' | 'faint' | 'nonText'

export type Rule =
  | { f: 'root' }
  | { f: 'ref'; of: TokenName }
  | { f: 'shift'; base: TokenName; absoluteChroma?: true }
  | { f: 'ink'; ground: TokenName; tier: Tier; capToBody?: true; allHues?: true }
  | { f: 'textFrom'; source: TokenName; ground: TokenName; tier: Tier }
  | { f: 'hueText'; hue: number; tier: Tier }
  | { f: 'onFill'; fill: TokenName }
  | { f: 'translucent'; ground: TokenName }
  | { f: 'pick'; cell: TokenName; a: TokenName; b: TokenName }

type Def = Rule | { light: Rule; dark: Rule; high?: Rule }

const root: Rule = { f: 'root' }
const ref = (of: TokenName): Rule => ({ f: 'ref', of })
const shift = (base: TokenName): Rule => ({ f: 'shift', base })
const ink = (ground: TokenName, tier: Tier): Rule => ({ f: 'ink', ground, tier })
const textFrom = (source: TokenName, tier: Tier = 'secondary'): Rule => ({
  f: 'textFrom',
  source,
  ground: 'background',
  tier,
})
const pick = (cell: TokenName): Rule => ({ f: 'pick', cell, a: 'heat-ink-dark', b: 'heat-ink-light' })

const RULES: Record<TokenName, Def> = {
  background: root,
  foreground: ink('background', 'body'),
  card: shift('background'),
  'card-foreground': ref('foreground'),
  popover: shift('background'),
  'popover-foreground': ref('foreground'),
  primary: root,
  'primary-foreground': { f: 'onFill', fill: 'primary' },
  link: textFrom('primary'),
  secondary: shift('background'),
  'secondary-foreground': { f: 'ink', ground: 'secondary', tier: 'secondary', capToBody: true },
  muted: ref('secondary'),
  'muted-foreground': ink('background', 'secondary'),
  faint: ink('background', 'faint'),
  accent: { light: ref('secondary'), dark: shift('background') },
  'accent-foreground': { f: 'ink', ground: 'accent', tier: 'secondary', capToBody: true },
  destructive: root,
  'destructive-foreground': { f: 'onFill', fill: 'destructive' },
  border: {
    light: shift('background'),
    dark: { f: 'translucent', ground: 'background' },
    high: ink('background', 'nonText'),
  },
  input: { light: ref('border'), dark: ref('secondary'), high: ref('border') },
  ring: textFrom('primary', 'nonText'),
  success: root,
  warning: root,
  positive: textFrom('success'),
  caution: textFrom('warning'),
  negative: textFrom('destructive'),
  'chart-1': root,
  'chart-2': root,
  'chart-3': root,
  'chart-4': root,
  'chart-5': root,
  sidebar: shift('background'),
  'sidebar-foreground': ink('sidebar', 'body'),
  'sidebar-primary': ref('primary'),
  'sidebar-primary-foreground': ref('primary-foreground'),
  'sidebar-accent': { light: ref('accent'), dark: shift('sidebar') },
  // Deliberately above body ink in dark: the active nav item is marked by its ink, not its fill.
  'sidebar-accent-foreground': {
    light: ref('accent-foreground'),
    dark: ink('sidebar-accent', 'body'),
    high: ink('sidebar-accent', 'body'),
  },
  'sidebar-border': {
    light: shift('background'),
    dark: { f: 'translucent', ground: 'background' },
    high: ref('border'),
  },
  'sidebar-ring': ref('ring'),
  'chart-background': ref('background'),
  'chart-foreground': ref('foreground'),
  'chart-foreground-muted': ref('muted-foreground'),
  'chart-label': ref('muted-foreground'),
  'chart-line-primary': ref('chart-1'),
  'chart-line-secondary': ref('chart-2'),
  'chart-crosshair': root,
  'chart-grid': ref('border'),
  'chart-brush-border': ref('border'),
  'chart-tooltip-background': ref('popover'),
  'chart-tooltip-foreground': ref('popover-foreground'),
  'chart-tooltip-muted': ref('muted-foreground'),
  'chart-marker-background': { light: shift('background'), dark: ref('popover') },
  'chart-marker-border': shift('chart-marker-background'),
  'chart-marker-foreground': ink('chart-marker-background', 'secondary'),
  'chart-scale-01': root,
  'chart-scale-02': root,
  'chart-scale-03': root,
  'chart-scale-04': root,
  'chart-scale-05': root,
  'chart-scale-pattern-color': root,
  'heat-1': root,
  'heat-2': root,
  'heat-3': root,
  'heat-4': root,
  'heat-5': root,
  'heat-6': root,
  'heat-7': root,
  'heat-ink-dark': root,
  'heat-ink-light': root,
  'heat-1-ink': pick('heat-1'),
  'heat-2-ink': pick('heat-2'),
  'heat-3-ink': pick('heat-3'),
  'heat-4-ink': pick('heat-4'),
  'heat-5-ink': pick('heat-5'),
  'heat-6-ink': pick('heat-6'),
  'heat-7-ink': pick('heat-7'),
  'identity-surface': { f: 'shift', base: 'background', absoluteChroma: true },
  // Chips take their hue from the name, so the ink has to hold at every hue, not just the stored one.
  'identity-ink': { f: 'ink', ground: 'identity-surface', tier: 'secondary', allHues: true },
  // Setup snippets render on bg-muted/50, so syntax ink is solved against that blend.
  'syntax-keyword': { f: 'hueText', hue: 18, tier: 'secondary' },
  'syntax-string': { f: 'hueText', hue: 160, tier: 'secondary' },
  'syntax-class': { f: 'hueText', hue: 255, tier: 'secondary' },
}

export const ruleFor = (token: TokenName, polarity: Polarity, level: Contrast): Rule => {
  const def = RULES[token]
  if ('f' in def) return def
  if (level === 'high' && def.high) return def.high
  return def[polarity]
}

export const isRoot = (token: TokenName) => RULES[token] === root

export const HIGH_TARGETS: Record<Tier, number> = { body: 13, secondary: 8, faint: 4.8, nonText: 3.3 }

// Inks on a filled control: the light candidate is Pug's own (per mode), the dark one pure black —
// between them, any fill clears 4.5:1.
const BLACK_ON_FILL = { l: 0, c: 0 }

export const IDENTITY_HUES = Array.from({ length: 12 }, (_, i) => i * 30)

/** Worst contrast across every hue a name can hash to — chips swap in the hue at render. */
export const identityContrast = (ink: Oklch, surface: Oklch) =>
  Math.min(...IDENTITY_HUES.map(h => contrast({ ...ink, h }, { ...surface, h })))

export type Get = (token: TokenName) => Oklch

export const syntaxGround = (get: Get) => composite(get('muted'), get('background'), 0.5)

const groundOf = (rule: Rule, get: Get) => {
  if (rule.f === 'hueText') return syntaxGround(get)
  if (rule.f === 'ink' || rule.f === 'textFrom') return get(rule.ground)
  throw new Error(`no ground for ${rule.f}`)
}

// ── Parameters measured from Pug ────────────────────────────────────────────────────────────────

const reference = (() => {
  const parsed = parseThemeObject(pug)
  if (!parsed.ok) throw new Error('registry: the Pug preset does not parse')
  const out = {} as Record<Polarity, Record<TokenName, Oklch>>
  for (const polarity of ['light', 'dark'] as const) {
    out[polarity] = parsed.family.variants[polarity]?.colors as Record<TokenName, Oklch>
  }
  return out
})()

type Params = { l: number; dl: number; c: number; h: number; alpha: number; target: number; chromaRatio: number }

const measure = (token: TokenName, rule: Rule, polarity: Polarity): Params => {
  const pugGet: Get = t => reference[polarity][t]
  const self = reference[polarity][token]
  const params: Params = { l: self.l, dl: 0, c: self.c, h: self.h, alpha: self.alpha, target: 0, chromaRatio: 1 }
  if (rule.f === 'shift') {
    const base = pugGet(rule.base)
    params.dl = self.l - base.l
    params.chromaRatio = self.c / Math.max(base.c, 1e-6)
  }
  if (rule.f === 'ink' && rule.allHues) params.target = identityContrast(self, groundOf(rule, pugGet))
  else if (rule.f === 'ink' || rule.f === 'textFrom' || rule.f === 'hueText') {
    params.target = contrast(self, groundOf(rule, pugGet))
  }
  return params
}

const PARAMS = (() => {
  const out = { light: {}, dark: {} } as Record<Polarity, Partial<Record<TokenName, Params>>>
  for (const polarity of ['light', 'dark'] as const) {
    for (const token of TOKENS) out[polarity][token] = measure(token, ruleFor(token, polarity, 'standard'), polarity)
  }
  return out
})()

// solveLightness for the worst hue: bisect on the minimum contrast across IDENTITY_HUES.
const solveIdentityInk = (surface: Oklch, polarity: Polarity, target: number, c: number) => {
  const at = (l: number) => identityContrast({ l, c, h: 0, alpha: 1 }, surface)
  let near = surface.l
  let far = polarity === 'dark' ? 1 : 0
  if (at(far) <= target) return far
  for (let i = 0; i < 40; i++) {
    const mid = (near + far) / 2
    if (at(mid) < target) near = mid
    else far = mid
  }
  return far
}

// A grey ground has no hue to lend, so its inks keep Pug's — otherwise they'd take hue 0, a red cast.
const hueOf = (ground: Oklch, p: Params) => (ground.c < 0.002 ? p.h : ground.h)

/** Evaluates one computed token. `get` returns tokens already resolved this pass. */
export const evaluate = (token: TokenName, polarity: Polarity, level: Contrast, get: Get): Oklch => {
  const rule = ruleFor(token, polarity, level)
  const p = PARAMS[polarity][token] as Params
  const target = (tier: Tier) => (level === 'high' ? Math.max(HIGH_TARGETS[tier], p.target * 1.15) : p.target)
  switch (rule.f) {
    case 'root':
      throw new Error(`registry: ${token} is a root and has no formula`)
    case 'ref':
      return get(rule.of)
    case 'shift': {
      const base = get(rule.base)
      const l = Math.max(0, Math.min(1, base.l + p.dl))
      if (rule.absoluteChroma) return { l, c: p.c, h: p.h, alpha: 1 }
      return { l, c: base.c * p.chromaRatio, h: base.h, alpha: 1 }
    }
    case 'ink': {
      const ground = get(rule.ground)
      let goal = target(rule.tier)
      if (rule.capToBody) goal = Math.min(goal, contrast(get('foreground'), get('background')))
      if (rule.allHues) return { l: solveIdentityInk(ground, polarity, goal, p.c), c: p.c, h: ground.h, alpha: 1 }
      const h = hueOf(ground, p)
      return { l: solveLightness(ground, polarity, goal, p.c, h), c: p.c, h, alpha: 1 }
    }
    case 'textFrom': {
      const source = get(rule.source)
      const c = Math.min(source.c, p.c)
      return { l: solveLightness(get(rule.ground), polarity, target(rule.tier), c, source.h), c, h: source.h, alpha: 1 }
    }
    case 'hueText':
      return {
        l: solveLightness(syntaxGround(get), polarity, target(rule.tier), p.c, rule.hue),
        c: p.c,
        h: rule.hue,
        alpha: 1,
      }
    case 'onFill': {
      const fill = get(rule.fill)
      const light = level === 'high' ? { l: 1, c: 0 } : { l: p.l, c: p.c }
      const dark = BLACK_ON_FILL
      const candidates = [light, dark].map(x => ({ l: x.l, c: x.c, h: fill.h, alpha: 1 }))
      return contrast(candidates[0], fill) >= contrast(candidates[1], fill) ? candidates[0] : candidates[1]
    }
    case 'translucent':
      return { l: p.l, c: p.c, h: hueOf(get(rule.ground), p), alpha: p.alpha }
    case 'pick': {
      const cell = get(rule.cell)
      const a = get(rule.a)
      const b = get(rule.b)
      return contrast(a, cell) >= contrast(b, cell) ? a : b
    }
  }
}

/** Every token a rule reads, across both modes and both contrast levels — for the resolution order. */
export const dependenciesOf = (token: TokenName): TokenName[] => {
  const deps = new Set<TokenName>()
  for (const polarity of ['light', 'dark'] as const) {
    for (const level of ['standard', 'high'] as const) {
      const rule = ruleFor(token, polarity, level)
      if (rule.f === 'ref') deps.add(rule.of)
      if (rule.f === 'shift') deps.add(rule.base)
      if (rule.f === 'ink') {
        deps.add(rule.ground)
        if (rule.capToBody) for (const t of ['foreground', 'background'] as const) deps.add(t)
      }
      if (rule.f === 'textFrom') for (const t of [rule.source, rule.ground]) deps.add(t)
      if (rule.f === 'hueText') for (const t of ['muted', 'background'] as const) deps.add(t)
      if (rule.f === 'onFill') deps.add(rule.fill)
      if (rule.f === 'translucent') deps.add(rule.ground)
      if (rule.f === 'pick') for (const t of [rule.cell, rule.a, rule.b]) deps.add(t)
    }
  }
  return [...deps]
}
