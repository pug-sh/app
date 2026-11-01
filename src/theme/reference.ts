import type { Polarity } from './tokens'

// A theme reference is `target[#light|#dark]`: a built-in id, an installed id (this browser only) or an
// https URL of a theme file, and an optional pin. Fetches and caches key on the target alone.

export type ThemeReference = { target: string; pin?: Polarity }

/** The server's limit on a stored reference (UpdateMetaRequest.default_theme). */
export const MAX_REFERENCE_LENGTH = 2048

const ID = /^[a-z0-9-]{1,64}$/

// Their looks are modes of Pug now, which each member chooses. A project's stored default can still name one.
const RETIRED = new Set(['pug-high-contrast', 'pug-colourblind'])

export const isUrlTarget = (target: string) => target.startsWith('https://')

// The URL parser has the last word on a URL target: it's what fetch uses, and an override from storage
// never passed the server's rule.
const parsesAsHttps = (target: string) => {
  try {
    return new URL(target).protocol === 'https:'
  } catch {
    return false
  }
}

const isTarget = (target: string) => (isUrlTarget(target) ? parsesAsHttps(target) : ID.test(target))

/** Splits a reference at its first '#', which in a URL can only begin the fragment. Null for none. */
export const parseReference = (value: string): ThemeReference | null => {
  if (value.length === 0 || value.length > MAX_REFERENCE_LENGTH) return null
  const at = value.indexOf('#')
  const written = at === -1 ? value : value.slice(0, at)
  if (!isTarget(written)) return null
  const target = RETIRED.has(written) ? 'pug' : written
  if (at === -1) return { target }
  const pin = value.slice(at + 1)
  if (pin !== 'light' && pin !== 'dark') return null
  return { target, pin }
}

export const formatReference = ({ target, pin }: ThemeReference) => (pin ? `${target}#${pin}` : target)

/**
 * A pasted URL as the URLs to try: as written, then as a folder (`…/linen/theme.json`), with any pin. The
 * URL parser lowercases the host, as the server requires. Null when it can't be an https URL.
 */
export const parsePastedUrl = (input: string): { urls: string[]; pin?: Polarity } | null => {
  const trimmed = input.trim()
  if (trimmed === '') return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const fragment = url.hash.slice(1)
  url.hash = ''
  const asWritten = url.href
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/theme.json`
  const urls = asWritten === url.href ? [asWritten] : [asWritten, url.href]
  if (fragment === 'light' || fragment === 'dark') return { urls, pin: fragment }
  return { urls }
}
