// Captures what Pug looks like *today*, before the theme engine moves anything: every colour token in
// index.css (aliases resolved), the sign-in surface, the syntax and name-chip colours, the retention
// ramp, and every series colour event-colors.ts hands out, in both modes. The golden tests compare
// against these files, so they come from the pre-refactor code and are never regenerated.
// Run once, before Task 2: `bun scripts/capture-theme-fixtures.ts`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getIndexedColor, getSeriesColor, setSeriesColorScheme } from '../src/lib/event-colors'

const root = path.resolve(import.meta.dirname, '..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')
const out = path.join(root, 'src/theme/__fixtures__')
mkdirSync(out, { recursive: true })
const write = (file: string, data: unknown) => writeFileSync(path.join(out, file), `${JSON.stringify(data, null, 2)}\n`)

// ── Tokens ──────────────────────────────────────────────────────────────────────────────────────
const css = read('src/index.css').replace(/\/\*[\s\S]*?\*\//g, '')
const block = (selector: RegExp) => {
  const match = css.match(selector)
  if (!match) throw new Error(`index.css has no block matching ${selector}`)
  return Object.fromEntries([...match[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(d => [d[1], d[2].trim()]))
}
const resolveVar = (vars: Record<string, string>, value: string): string => {
  const ref = value.match(/^var\(--([a-z0-9-]+)\)$/)
  return ref ? resolveVar(vars, vars[ref[1]]) : value
}
const colours = (vars: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(vars)
      .filter(([k]) => k !== 'radius')
      .map(([k, v]) => [k, resolveVar(vars, v)]),
  )

const light = block(/\n:root \{\n([\s\S]*?)\n\}/)
const dark = { ...light, ...block(/\n\.dark \{\n([\s\S]*?)\n\}/) }
const sugar = block(/\n\.sugar-high \{\n([\s\S]*?)\n\}/)
const sugarDark = block(/\n\.dark \.sugar-high \{\n([\s\S]*?)\n\}/)
const chip = read('src/components/name-chip.tsx')
const chipColour = (variant: string, prop: 'bg' | 'text') => {
  const m = chip.match(new RegExp(`${variant}${prop}-\\[oklch\\(([\\d.]+)_([\\d.]+)_var\\(--tone\\)\\)\\]`))
  if (!m) throw new Error(`name-chip.tsx: no ${variant}${prop} colour`)
  return `oklch(${m[1]} ${m[2]} 0)`
}
write('tokens.json', {
  light: colours(light),
  dark: colours(dark),
  authSurface: block(/\n:root:not\(\.dark\) \.auth-surface \{\n([\s\S]*?)\n\}/),
  syntax: {
    light: { keyword: sugar['sh-keyword'], string: sugar['sh-string'], class: sugar['sh-class'] },
    dark: { keyword: sugarDark['sh-keyword'], string: sugarDark['sh-string'], class: sugarDark['sh-class'] },
  },
  identity: {
    light: { surface: chipColour('', 'bg'), ink: chipColour('', 'text') },
    dark: { surface: chipColour('dark:', 'bg'), ink: chipColour('dark:', 'text') },
  },
})

// ── Retention ramp ──────────────────────────────────────────────────────────────────────────────
const retention = read('src/pages/routegen/insights/charts/retention-cohort.tsx')
const steps = [...retention.matchAll(/if \(value >= (\d+)\) return '(#[0-9a-f]{6})'/g)].map(m => ({
  min: Number(m[1]),
  fill: m[2],
}))
const lowest = retention.match(/\n {2}return '(#[0-9a-f]{6})'\n\}/)?.[1]
const inks = retention.match(/value >= 35 \? '(#[0-9a-f]{6})' : '(#[0-9a-f]{6})'/)
if (!lowest || !inks || steps.length !== 6) throw new Error('retention-cohort.tsx: ramp not where expected')
write(
  'heat.json',
  [{ min: 0, fill: lowest }, ...steps.reverse()].map(s => ({ ...s, ink: s.min >= 35 ? inks[1] : inks[2] })),
)

// ── Series colours ──────────────────────────────────────────────────────────────────────────────
const source = read('src/lib/event-colors.ts')
const events = [
  ...source
    .slice(source.indexOf('const EVENT_COLORS'), source.indexOf('const FALLBACK_COLORS'))
    .matchAll(/^\s+([a-z_]+): color\(/gm),
].map(m => m[1])
const prefixes = [...source.slice(source.indexOf('const FAMILIES')).matchAll(/'([a-z_]+_)'/g)].map(m => m[1])
const names = [
  ...events,
  ...prefixes.flatMap(p => Array.from({ length: 12 }, (_, i) => `${p}custom_${i}`)),
  ...Array.from({ length: 30 }, (_, i) => `unmapped_thing_${i}`),
]
const capture = (isDark: boolean) => {
  setSeriesColorScheme(isDark)
  return {
    named: Object.fromEntries(names.map(n => [n, getSeriesColor(n).line])),
    generic: Array.from({ length: 24 }, (_, i) => getSeriesColor(`Step ${i + 1}`, i).line),
    indexed: Array.from({ length: 24 }, (_, i) => getIndexedColor(i).line),
  }
}
write('series.json', { light: capture(false), dark: capture(true) })
console.log(
  `captured ${Object.keys(light).length} tokens, ${names.length} series names, ${steps.length + 1} heat stops`,
)
