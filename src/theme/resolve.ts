import type { Oklch } from '../lib/color/oklch'
import type { Variant } from './format'
import { dependenciesOf, evaluate, isRoot } from './registry'
import { type Contrast, type Polarity, TOKENS, type TokenName } from './tokens'

// Resolution: each token takes the theme's explicit value, else a root takes the built-in's, else a
// computed token evaluates its formula on the tokens already resolved. Pug lists every token, so
// resolving it changes nothing.

export type Provenance = 'explicit' | 'computed' | 'built-in'

export type Resolved = { tokens: Record<TokenName, Oklch>; provenance: Record<TokenName, Provenance> }

/** Tokens ordered so each comes after everything its formula reads. Throws on a cycle. */
export const RESOLUTION_ORDER = (() => {
  const order: TokenName[] = []
  const state = new Map<TokenName, 'visiting' | 'done'>()
  const visit = (token: TokenName, path: TokenName[]) => {
    if (state.get(token) === 'done') return
    if (state.get(token) === 'visiting') throw new Error(`registry cycle: ${[...path, token].join(' → ')}`)
    state.set(token, 'visiting')
    for (const dep of dependenciesOf(token)) visit(dep, [...path, token])
    state.set(token, 'done')
    order.push(token)
  }
  for (const token of TOKENS) visit(token, [])
  return order
})()

/**
 * @param roots the built-in's values for this mode and contrast level — where an unset root falls back.
 */
export const resolveTokens = (
  variant: Variant | undefined,
  polarity: Polarity,
  level: Contrast,
  roots: Record<TokenName, Oklch>,
): Resolved => {
  const tokens = {} as Record<TokenName, Oklch>
  const provenance = {} as Record<TokenName, Provenance>
  const get = (token: TokenName) => tokens[token]
  for (const token of RESOLUTION_ORDER) {
    const explicit = variant?.colors[token]
    if (explicit) {
      tokens[token] = explicit
      provenance[token] = 'explicit'
    } else if (isRoot(token)) {
      tokens[token] = roots[token]
      provenance[token] = 'built-in'
    } else {
      tokens[token] = evaluate(token, polarity, level, get)
      provenance[token] = 'computed'
    }
  }
  return { tokens, provenance }
}
