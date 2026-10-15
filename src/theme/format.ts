import { z } from 'zod'
import type { Oklch } from '../lib/color/oklch'
import { MAX_COLOR_LENGTH, parseColor } from '../lib/color/parse'
import { resolveKind } from '../lib/event-aliases'
import { CALENDAR_DAY_PATTERN, isCalendarDay } from './metadata'
import { MAX_RELEASE_LENGTH, parseRelease, RELEASE_PATTERN } from './release'
import {
  type Contrast,
  GROUPS,
  type GroupName,
  POLARITIES,
  type Polarity,
  SURFACES,
  TOKENS,
  type TokenName,
} from './tokens'

// Theme format v1: parsing a theme file (text or object) into a ThemeFamily plus a list of issues.
// Errors refuse the theme; warnings let it load. Unknown keys are dropped with a warning (the rule
// CSS uses for unknown properties), so a theme using keys a newer Pug added still loads here. A newer
// version number is refused outright.

// Every format version this build reads. Bumping CURRENT_VERSION means adding it here, and then
// MIGRATIONS has to carry an upgrade from each older version; the compiler holds it to that.
type Version = 1
const CURRENT_VERSION = 1 satisfies Version
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
  created?: string
  release?: string
  contrast: Contrast
  variants: Partial<Record<Polarity, Variant>>
}

/** What a file says about itself. Nothing in it draws, so a problem in it never refuses the theme. */
export type ThemeMetadata = { author?: string; description?: string; created?: string; release?: string }

/** The file shape as authored: what presets are written in and what parseThemeObject reads. */
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
  metadata?: ThemeMetadata
  contrast?: Contrast
  variants: { light?: VariantFile; dark?: VariantFile }
  seeds?: Record<string, unknown>
}

export type ParseResult = { ok: true; family: ThemeFamily; issues: Issue[] } | { ok: false; issues: Issue[] }

// The file's structure, written once and built twice: loose for the parser (unknown keys pass through
// to a warning, and colours are checked against the grammar afterwards so each failure gets a path)
// and strict for editors, with every token and group listed so names autocomplete.
const dataFields = <G extends z.ZodType>(color: z.ZodString, groups: G) => ({
  categorical: z.array(color).min(3).max(24).optional(),
  groups: groups.optional(),
  events: z.record(z.string().max(64), color).optional(),
  avatars: z.array(color).min(1).max(24).optional(),
  adapt: z.boolean().optional(),
})
const fileFields = <V extends z.ZodType, S extends z.ZodType, M extends z.ZodType>(
  version: V,
  variants: S,
  metadata: M,
) => ({
  $schema: z.string().optional(),
  version,
  name: z.string().min(1).max(64),
  metadata: metadata.optional(),
  contrast: z.enum(['standard', 'high']).optional(),
  variants,
  seeds: z.looseObject({}).optional(),
})

// Files written before metadata had its own field carry these two at the top level. Still read, and
// refused when malformed as they always were, but no longer offered to editors.
const legacyFields = {
  author: z.string().max(64).optional(),
  description: z.string().max(280).optional(),
}

const colorString = z.string().max(MAX_COLOR_LENGTH)
const dataShape = z.looseObject(dataFields(colorString, z.record(z.string(), colorString)))
const variantShape = z.looseObject({
  colors: z.record(z.string(), colorString).optional(),
  data: dataShape.optional(),
})
// metadata passes through unread here: readMetadata turns each problem in it into a warning, where a
// typed field would refuse the whole theme.
const fileShape = z.looseObject({
  ...fileFields(
    z.number().int(),
    z.looseObject({ light: variantShape.optional(), dark: variantShape.optional() }),
    z.unknown(),
  ),
  ...legacyFields,
})

const METADATA_TEXT = { author: 64, description: 280 } as const
const METADATA_KEYS = ['author', 'description', 'created', 'release']

/** Strict mirror of the format for editors: every token and group is listed, so names autocomplete. */
export const authoringSchema = (() => {
  const color = z.string().max(MAX_COLOR_LENGTH).describe('A colour: hex, rgb(), hsl() or oklch()')
  const colors = z.strictObject(Object.fromEntries(TOKENS.map(t => [t, color.optional()])))
  const groups = z.strictObject(Object.fromEntries(GROUPS.map(g => [g, color.optional()])))
  const data = z.strictObject(dataFields(color, groups))
  const variant = z.strictObject({ colors: colors.optional(), data: data.optional() })
  const metadata = z.strictObject({
    author: z.string().max(METADATA_TEXT.author).describe('Who made the theme').optional(),
    description: z.string().max(METADATA_TEXT.description).describe('One line about the theme').optional(),
    created: z
      .string()
      .regex(new RegExp(CALENDAR_DAY_PATTERN))
      .describe('The day the theme was first made, YYYY-MM-DD')
      .optional(),
    release: z
      .string()
      .max(MAX_RELEASE_LENGTH)
      .regex(new RegExp(RELEASE_PATTERN))
      .describe('This file’s release, MAJOR.MINOR.PATCH')
      .optional(),
  })
  return z.strictObject(
    fileFields(
      z.literal(CURRENT_VERSION),
      z.strictObject({ light: variant.optional(), dark: variant.optional() }),
      metadata,
    ),
  )
})()

// Upgrades from older versions, keyed by the version they upgrade from. Empty in v1.
type Migration = (input: Record<string, unknown>) => Record<string, unknown>
const MIGRATIONS: { [V in Exclude<Version, typeof CURRENT_VERSION>]: Migration } = {}

// C0/C1 controls and bidi overrides: a theme name must not be able to reorder the text around it.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g

// The keys each level knows, read off the shapes above so a new field can't be warned about as unknown.
const KNOWN = {
  root: Object.keys(fileShape.shape),
  variants: [...POLARITIES],
  variant: Object.keys(variantShape.shape),
  data: Object.keys(dataShape.shape),
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
  return best && best[1] <= 2 ? ` (did you mean "${best[0]}"?)` : ''
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
    if (!source) continue
    variants[polarity] = parseVariant(source, `variants.${polarity}`, issues)
    if (hasProtoEventKey(raw, polarity)) {
      const at = `variants.${polarity}.data.events.__proto__`
      issues.push(warning('V12', at, '"__proto__" can’t name an event, so it was ignored'))
    }
  }
  // Ahead of the gate, so a file whose variants and name are both broken hears about both at once.
  const name = cleanText(file.name, 'name', issues).trim()
  if (!hasVisibleText(name)) issues.push(error('V13', 'name', 'A theme needs a visible name'))
  if (issues.some(i => i.severity === 'error')) return { ok: false, issues }

  const family: ThemeFamily = {
    name,
    contrast: file.contrast ?? 'standard',
    variants,
  }
  const metadata = readMetadata(file.metadata, issues)
  const author = metadata.author ?? legacyText(file.author, 'author', issues)
  const description = metadata.description ?? legacyText(file.description, 'description', issues)
  if (author !== undefined) family.author = author
  if (description !== undefined) family.description = description
  if (metadata.created !== undefined) family.created = metadata.created
  if (metadata.release !== undefined) family.release = metadata.release
  return { ok: true, family, issues }
}

const legacyText = (value: string | undefined, path: string, issues: Issue[]) =>
  value === undefined ? undefined : cleanText(value, path, issues)

// Everything in metadata describes the theme and nothing in it draws, so a problem there is a warning and
// the value is dropped: a typo in a date must never cost a project its colours.
const readMetadata = (input: unknown, issues: Issue[]) => {
  const metadata: ThemeMetadata = {}
  if (input === undefined) return metadata
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    issues.push(warning('V12', 'metadata', '"metadata" must be an object, so it was ignored'))
    return metadata
  }
  const raw = input as Record<string, unknown>
  unknownKeys(raw, METADATA_KEYS, 'metadata', issues)
  const text = (key: string) => {
    if (!Object.hasOwn(raw, key)) return undefined
    const value = raw[key]
    if (typeof value === 'string') return value
    issues.push(warning('V12', `metadata.${key}`, `"${key}" must be text, so it was ignored`))
    return undefined
  }
  for (const key of ['author', 'description'] as const) {
    const value = text(key)
    if (value === undefined) continue
    const limit = METADATA_TEXT[key]
    if (value.length > limit) {
      issues.push(warning('V12', `metadata.${key}`, `"${key}" is limited to ${limit} characters, so it was ignored`))
    } else {
      metadata[key] = cleanText(value, `metadata.${key}`, issues)
    }
  }
  const created = text('created')
  if (created !== undefined) {
    if (isCalendarDay(created)) metadata.created = created
    else {
      const message = `${JSON.stringify(created)} isn’t a day written YYYY-MM-DD, so it was ignored`
      issues.push(warning('V12', 'metadata.created', message))
    }
  }
  const release = text('release')
  if (release !== undefined) {
    if (parseRelease(release)) metadata.release = release
    else {
      const message = `${JSON.stringify(release)} isn’t a release written MAJOR.MINOR.PATCH, so it was ignored`
      issues.push(warning('V12', 'metadata.release', message))
    }
  }
  return metadata
}

// zod drops a "__proto__" record key, so it never reaches the parsed file to be warned about. JSON.parse
// made it an ordinary own key, so look for it on the raw input.
const hasProtoEventKey = (raw: Record<string, unknown>, polarity: Polarity) => {
  let at: unknown = raw
  for (const key of ['variants', polarity, 'data', 'events']) {
    if (typeof at !== 'object' || at === null || !Object.hasOwn(at, key)) return false
    at = (at as Record<string, unknown>)[key]
  }
  return typeof at === 'object' && at !== null && Object.hasOwn(at, '__proto__')
}

const parseVariant = (source: z.infer<typeof variantShape>, path: string, issues: Issue[]): Variant => {
  unknownKeys(source, KNOWN.variant, path, issues)
  const colors = namedColors(source.colors ?? {}, TOKENS, 'token', `${path}.colors`, issues, (value, at, token) => {
    const parsed = colorAt(value, at, issues)
    if (parsed && parsed.alpha < 0.999 && SURFACES.has(token)) {
      issues.push(error('V5', at, `${token} must be opaque, since text is drawn on it`))
    }
    return parsed
  })

  const rawData = source.data ?? {}
  unknownKeys(rawData, KNOWN.data, `${path}.data`, issues)
  const data: DataSpec = { groups: {}, events: {}, adapt: rawData.adapt ?? true }

  if (rawData.categorical) {
    data.categorical = dataColorList(rawData.categorical, `${path}.data.categorical`, issues)
  }
  if (rawData.avatars) data.avatars = dataColorList(rawData.avatars, `${path}.data.avatars`, issues)

  data.groups = namedColors(rawData.groups ?? {}, GROUPS, 'group', `${path}.data.groups`, issues, (value, at) =>
    dataColorAt(value, at, issues),
  )

  const rawEvents = rawData.events ?? {}
  const eventKeys = Object.keys(rawEvents)
  if (eventKeys.length > MAX_EVENTS) {
    issues.push(error('V13', `${path}.data.events`, `At most ${MAX_EVENTS} event colours`))
  }
  // The file key that claimed each event, so a second key for the same event can say which one won.
  const claimedBy = new Map<string, string>()
  for (const key of eventKeys.slice(0, MAX_EVENTS)) {
    const at = `${path}.data.events.${key}`
    const parsed = dataColorAt(rawEvents[key], at, issues)
    const kind = resolveKind(key)
    const first = claimedBy.get(kind)
    if (!kind) {
      issues.push(warning('V12', at, `"${key}" names no event, so it was ignored`))
    } else if (first !== undefined) {
      issues.push(warning('V12', at, `"${key}" is the same event as "${first}", so it was ignored`))
    } else {
      claimedBy.set(kind, key)
      if (parsed) data.events[kind] = parsed
    }
  }
  return { colors, data }
}

// Colours keyed by a registry name: tokens or groups. An unknown name gets a warning; known ones are
// read through the registry, never by copying the file's keys, so __proto__ and friends stay inert.
const namedColors = <N extends string>(
  raw: Record<string, string>,
  names: readonly N[],
  noun: string,
  path: string,
  issues: Issue[],
  read: (value: unknown, at: string, name: N) => Oklch | null,
) => {
  for (const key of Object.keys(raw)) {
    if (!(names as readonly string[]).includes(key)) {
      issues.push(warning('V12', `${path}.${key}`, `Unknown ${noun} "${key}"${suggest(key, names)}`))
    }
  }
  const colors: Partial<Record<N, Oklch>> = {}
  for (const name of names) {
    if (!Object.hasOwn(raw, name)) continue
    const parsed = read(raw[name], `${path}.${name}`, name)
    if (parsed) colors[name] = parsed
  }
  return colors
}

const colorAt = (value: unknown, path: string, issues: Issue[]) => {
  const parsed = typeof value === 'string' ? parseColor(value) : null
  if (!parsed) issues.push(error('V13', path, `${JSON.stringify(value)} is not a colour`))
  return parsed
}

// Data colours are drawn solid (series lines, dots, discs), so alpha on one is dropped. Say so.
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
 * A theme's name read straight from its text, cleaned like any name, for a theme that no longer
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

// Whether a name (already cleaned and trimmed) has anything that draws: a letter, number, punctuation
// mark or symbol. The installed list, the swatch's accessible name and the install toast show the name
// and nothing else, so one of only zero-width, combining or private-use characters is refused like an
// empty one. Unicode has no "draws nothing" property, so this is a line rather than a proof: a blank
// letter (U+3164) or symbol (U+2800) still passes.
const hasVisibleText = (name: string) => /[\p{L}\p{N}\p{P}\p{S}]/u.test(name)

// An issue repeats the file's own keys and values, and the install report renders it, so it gets the
// same cleaning as a name.
const issue = (severity: Issue['severity'], rule: RuleId, path: string, message: string): Issue => ({
  severity,
  rule,
  path: path.replace(UNSAFE_TEXT, ''),
  message: message.replace(UNSAFE_TEXT, ''),
})
export const error = (rule: RuleId, path: string, message: string) => issue('error', rule, path, message)
export const warning = (rule: RuleId, path: string, message: string) => issue('warning', rule, path, message)

/** The refusal for a file over MAX_THEME_BYTES, raised before parsing, and by the UI before reading. */
export const tooLargeIssue = () => error('V13', '', `Theme files are limited to ${MAX_THEME_BYTES / 1024} KB`)
