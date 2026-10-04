import { z } from 'zod'
import type { Oklch } from '../lib/color/oklch'
import { MAX_COLOR_LENGTH, parseColor } from '../lib/color/parse'
import { resolveKind } from '../lib/event-aliases'
import {
  type Contrast,
  GROUPS,
  type GroupName,
  isGroupName,
  isTokenName,
  POLARITIES,
  type Polarity,
  SURFACES,
  TOKENS,
  type TokenName,
} from './tokens'

// Theme format v1: parsing a theme file (text or object) into a ThemeFamily plus a list of issues.
// Errors refuse the theme; warnings let it load. Unknown keys are dropped with a warning — the rule
// CSS uses for unknown properties — so a theme using keys a newer Pug added still loads here. A newer
// version number is refused outright.

// Every format version this build reads. Bumping CURRENT_VERSION means adding it here, and then
// MIGRATIONS has to carry an upgrade from each older version — the compiler holds it to that.
type Version = 1
export const CURRENT_VERSION = 1 satisfies Version
export const MAX_THEME_BYTES = 64 * 1024
const MAX_EVENTS = 300

/** V1–V11 are validation; V12 (ignored input) and V13 (refused input) come from parsing. */
export type RuleId = `V${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13}`

export type Issue = { severity: 'error' | 'warning'; rule: RuleId; path: string; message: string }

export type DataSpec = {
  categorical?: Oklch[]
  groups: Partial<Record<GroupName, Oklch>>
  events: Record<string, Oklch>
  avatars?: Oklch[]
  adapt: boolean
}

export type Variant = { colors: Partial<Record<TokenName, Oklch>>; data: DataSpec }

export type ThemeFamily = {
  name: string
  author?: string
  description?: string
  contrast: Contrast
  variants: Partial<Record<Polarity, Variant>>
}

/** The file shape as authored — what presets are written in and what parseThemeObject reads. */
type VariantFile = {
  colors?: Partial<Record<TokenName, string>>
  data?: {
    categorical?: string[]
    groups?: Partial<Record<GroupName, string>>
    events?: Record<string, string>
    avatars?: string[]
    adapt?: boolean
  }
}

export type ThemeFile = {
  $schema?: string
  version: number
  name: string
  author?: string
  description?: string
  contrast?: Contrast
  variants: { light?: VariantFile; dark?: VariantFile }
  seeds?: Record<string, unknown>
}

export type ParseResult = { ok: true; family: ThemeFamily; issues: Issue[] } | { ok: false; issues: Issue[] }

// Structure only — colours are checked against the grammar afterwards so each failure gets a path.
const colorString = z.string().max(MAX_COLOR_LENGTH)
const dataShape = z.looseObject({
  categorical: z.array(colorString).min(3).max(24).optional(),
  groups: z.record(z.string(), colorString).optional(),
  events: z.record(z.string().max(64), colorString).optional(),
  avatars: z.array(colorString).min(1).max(24).optional(),
  adapt: z.boolean().optional(),
})
const variantShape = z.looseObject({
  colors: z.record(z.string(), colorString).optional(),
  data: dataShape.optional(),
})
const fileShape = z.looseObject({
  $schema: z.string().optional(),
  version: z.number().int(),
  name: z.string().min(1).max(64),
  author: z.string().max(64).optional(),
  description: z.string().max(280).optional(),
  contrast: z.enum(['standard', 'high']).optional(),
  variants: z.looseObject({ light: variantShape.optional(), dark: variantShape.optional() }),
  seeds: z.looseObject({}).optional(),
})

/** Strict mirror of the format for editors: every token and group is listed, so names autocomplete. */
export const authoringSchema = (() => {
  const color = z.string().max(MAX_COLOR_LENGTH).describe('A colour: hex, rgb(), hsl() or oklch()')
  const colors = z.strictObject(Object.fromEntries(TOKENS.map(t => [t, color.optional()])))
  const groups = z.strictObject(Object.fromEntries(GROUPS.map(g => [g, color.optional()])))
  const data = z.strictObject({
    categorical: z.array(color).min(3).max(24).optional(),
    groups: groups.optional(),
    events: z.record(z.string().max(64), color).optional(),
    avatars: z.array(color).min(1).max(24).optional(),
    adapt: z.boolean().optional(),
  })
  const variant = z.strictObject({ colors: colors.optional(), data: data.optional() })
  return z.strictObject({
    $schema: z.string().optional(),
    version: z.literal(CURRENT_VERSION),
    name: z.string().min(1).max(64),
    author: z.string().max(64).optional(),
    description: z.string().max(280).optional(),
    contrast: z.enum(['standard', 'high']).optional(),
    variants: z.strictObject({ light: variant.optional(), dark: variant.optional() }),
    seeds: z.looseObject({}).optional(),
  })
})()

// Upgrades from older versions, keyed by the version they upgrade from. Empty in v1.
type Migration = (input: Record<string, unknown>) => Record<string, unknown>
const MIGRATIONS: { [V in Exclude<Version, typeof CURRENT_VERSION>]: Migration } = {}

// C0/C1 controls and bidi overrides — a theme name must not be able to reorder the text around it.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g

const KNOWN = {
  root: ['$schema', 'version', 'name', 'author', 'description', 'contrast', 'variants', 'seeds'],
  variants: ['light', 'dark'],
  variant: ['colors', 'data'],
  data: ['categorical', 'groups', 'events', 'avatars', 'adapt'],
}

const distance = (a: string, b: string) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = row[j]
      row[j] = next
    }
  }
  return row[b.length]
}

const suggest = (name: string, options: readonly string[]) => {
  const best = options.map(o => [o, distance(name, o)] as const).sort((x, y) => x[1] - y[1])[0]
  return best && best[1] <= 2 ? ` — did you mean "${best[0]}"?` : ''
}

export const parseThemeText = (text: string): ParseResult => {
  if (text.length > MAX_THEME_BYTES) return { ok: false, issues: [tooLargeIssue()] }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, issues: [error('V13', '', 'Not valid JSON')] }
  }
  return parseThemeObject(json)
}

export const parseThemeObject = (input: unknown): ParseResult => {
  const issues: Issue[] = []
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, issues: [error('V13', '', 'A theme must be a JSON object')] }
  }

  let raw = input as Record<string, unknown>
  const version = raw.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, issues: [error('V13', 'version', '"version" must be a whole number, starting at 1')] }
  }
  if (version > CURRENT_VERSION) {
    return { ok: false, issues: [error('V13', 'version', 'This theme needs a newer version of Pug')] }
  }
  for (let v = version; v < CURRENT_VERSION; v++) raw = (MIGRATIONS as Record<number, Migration>)[v](raw)

  const shape = fileShape.safeParse(raw)
  if (!shape.success) {
    return {
      ok: false,
      issues: shape.error.issues.map(i => error('V13', i.path.join('.'), i.message)),
    }
  }
  const file = shape.data

  unknownKeys(raw, KNOWN.root, '', issues)
  if (file.seeds && Object.keys(file.seeds).length > 0) {
    issues.push(warning('V12', 'seeds', 'Seeds are reserved for a later version and were ignored'))
  }
  unknownKeys(file.variants, KNOWN.variants, 'variants', issues)
  if (!file.variants.light && !file.variants.dark) {
    return { ok: false, issues: [...issues, error('V13', 'variants', 'A theme needs a light or a dark variant')] }
  }

  const variants: Partial<Record<Polarity, Variant>> = {}
  for (const polarity of POLARITIES) {
    const source = file.variants[polarity]
    if (source) variants[polarity] = parseVariant(source, `variants.${polarity}`, issues)
  }
  if (issues.some(i => i.severity === 'error')) return { ok: false, issues }

  const family: ThemeFamily = {
    name: cleanText(file.name, 'name', issues),
    contrast: file.contrast ?? 'standard',
    variants,
  }
  if (file.author !== undefined) family.author = cleanText(file.author, 'author', issues)
  if (file.description !== undefined) family.description = cleanText(file.description, 'description', issues)
  return { ok: true, family, issues }
}

const parseVariant = (source: z.infer<typeof variantShape>, path: string, issues: Issue[]): Variant => {
  unknownKeys(source, KNOWN.variant, path, issues)
  const colors: Partial<Record<TokenName, Oklch>> = {}
  const rawColors = source.colors ?? {}
  for (const key of Object.keys(rawColors)) {
    if (!isTokenName(key)) {
      issues.push(warning('V12', `${path}.colors.${key}`, `Unknown token "${key}"${suggest(key, TOKENS)}`))
    }
  }
  // Read through the registry, never by copying the file's keys: __proto__ and friends stay inert.
  for (const token of TOKENS) {
    if (!Object.hasOwn(rawColors, token)) continue
    const at = `${path}.colors.${token}`
    const parsed = colorAt(rawColors[token], at, issues)
    if (parsed && parsed.alpha < 0.999 && SURFACES.has(token)) {
      issues.push(error('V5', at, `${token} must be opaque — text is drawn on it`))
    }
    if (parsed) colors[token] = parsed
  }

  const rawData = source.data ?? {}
  unknownKeys(rawData, KNOWN.data, `${path}.data`, issues)
  const data: DataSpec = { groups: {}, events: {}, adapt: rawData.adapt ?? true }

  if (rawData.categorical) {
    data.categorical = dataColorList(rawData.categorical, `${path}.data.categorical`, issues)
  }
  if (rawData.avatars) data.avatars = dataColorList(rawData.avatars, `${path}.data.avatars`, issues)

  const rawGroups = rawData.groups ?? {}
  for (const key of Object.keys(rawGroups)) {
    if (!isGroupName(key)) {
      issues.push(warning('V12', `${path}.data.groups.${key}`, `Unknown group "${key}"${suggest(key, GROUPS)}`))
    }
  }
  for (const group of GROUPS) {
    if (!Object.hasOwn(rawGroups, group)) continue
    const parsed = dataColorAt(rawGroups[group], `${path}.data.groups.${group}`, issues)
    if (parsed) data.groups[group] = parsed
  }

  const rawEvents = rawData.events ?? {}
  const eventKeys = Object.keys(rawEvents)
  if (eventKeys.length > MAX_EVENTS) {
    issues.push(error('V13', `${path}.data.events`, `At most ${MAX_EVENTS} event colours`))
  }
  for (const key of eventKeys.slice(0, MAX_EVENTS)) {
    const kind = resolveKind(key)
    const parsed = dataColorAt(rawEvents[key], `${path}.data.events.${key}`, issues)
    if (parsed && kind) data.events[kind] = parsed
  }
  return { colors, data }
}

const colorAt = (value: unknown, path: string, issues: Issue[]) => {
  const parsed = typeof value === 'string' ? parseColor(value) : null
  if (!parsed) issues.push(error('V13', path, `${JSON.stringify(value)} is not a colour`))
  return parsed
}

// Data colours are drawn solid — series lines, dots, discs — so alpha on one is dropped. Say so.
const dataColorAt = (value: unknown, path: string, issues: Issue[]) => {
  const parsed = colorAt(value, path, issues)
  if (parsed && parsed.alpha < 0.999)
    issues.push(warning('V12', path, 'Data colours are drawn solid; its alpha was ignored'))
  return parsed
}

const dataColorList = (values: string[], path: string, issues: Issue[]) =>
  values.map((v, i) => dataColorAt(v, `${path}.${i}`, issues)).filter((c): c is Oklch => c !== null)

const unknownKeys = (obj: object, known: string[], path: string, issues: Issue[]) => {
  for (const key of Object.keys(obj)) {
    if (!known.includes(key)) {
      const at = path ? `${path}.${key}` : key
      issues.push(warning('V12', at, `Unknown key "${key}" was ignored${suggest(key, known)}`))
    }
  }
}

/**
 * A theme's name read straight from its text, cleaned like any name — for a theme that no longer
 * parses, so it can still be named. Null when there's no usable name in it.
 */
export const readableName = (text: string) => {
  try {
    const name = (JSON.parse(text) as { name?: unknown } | null)?.name
    if (typeof name !== 'string') return null
    return name.replace(UNSAFE_TEXT, '').trim().slice(0, 64) || null
  } catch {
    return null
  }
}

const cleanText = (value: string, path: string, issues: Issue[]) => {
  const cleaned = value.replace(UNSAFE_TEXT, '')
  if (cleaned !== value) issues.push(warning('V12', path, 'Control and direction-override characters were removed'))
  return cleaned
}

// An issue repeats the file's own keys and values, and the install report renders it — so it gets the
// same cleaning as a name.
const issue = (severity: Issue['severity'], rule: RuleId, path: string, message: string): Issue => ({
  severity,
  rule,
  path: path.replace(UNSAFE_TEXT, ''),
  message: message.replace(UNSAFE_TEXT, ''),
})
export const error = (rule: RuleId, path: string, message: string) => issue('error', rule, path, message)
export const warning = (rule: RuleId, path: string, message: string) => issue('warning', rule, path, message)

/** The refusal for a file over MAX_THEME_BYTES — raised before parsing, and by the UI before reading. */
export const tooLargeIssue = () => error('V13', '', `Theme files are limited to ${MAX_THEME_BYTES / 1024} KB`)
