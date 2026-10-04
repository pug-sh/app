import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatColor, parseColor } from '../lib/color/parse'
import tokens from './__fixtures__/tokens.json'
import { builtinThemesCss } from './css'
import { themeJsonSchema } from './schema'
import { TOKENS } from './tokens'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('generated files', () => {
  it('builtin-themes.css is up to date — run `bun run generate:themes`', () => {
    expect(read('src/theme/generated/builtin-themes.css')).toBe(builtinThemesCss())
  })

  it('schemas/theme/v1.json is up to date — run `bun run generate:themes`', () => {
    expect(read('schemas/theme/v1.json')).toBe(themeJsonSchema())
  })
})

// End to end: the CSS the app now ships declares exactly what index.css declared before.
describe.each([
  ['light', ':root'],
  ['dark', ':root.dark'],
] as const)('the generated Pug %s block', (polarity, selector) => {
  const css = builtinThemesCss()
  const body = css.split(`\n${selector} {\n`)[1]?.split('\n}')[0] ?? ''
  const declared = Object.fromEntries([...body.matchAll(/ {2}--([a-z0-9-]+): ([^;]+);/g)].map(m => [m[1], m[2]]))

  it('matches index.css before the refactor', () => {
    for (const [token, value] of Object.entries(tokens[polarity])) {
      const parsed = parseColor(value)
      expect(declared[token], token).toBe(parsed && formatColor(parsed))
    }
  })
})

it('resets the sign-in surface to Pug in both modes', () => {
  const css = builtinThemesCss()
  expect(css).toContain('\n.auth-surface {\n')
  expect(css).toContain('\n.dark .auth-surface {\n')
  expect(css).toContain(`  --background: ${formatColor(parseColor(tokens.authSurface.background) as never)};`)
})

// A token added to index.css's @theme inline without a registry entry would silently stay at Pug's
// value under every custom theme. This turns that into a failure.
it('registers every colour index.css exposes to Tailwind', () => {
  const css = read('src/index.css')
  const start = css.indexOf('@theme inline {')
  const theme = css.slice(start, css.indexOf('\n}', start))
  const mapped = [...theme.matchAll(/--color-[a-z0-9-]+: var\(--([a-z0-9-]+)\)/g)].map(m => m[1])
  expect(mapped.length).toBeGreaterThan(50)
  for (const token of mapped) expect(TOKENS, token).toContain(token)
})
