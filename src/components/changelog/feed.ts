import { fetchCapped } from '@/theme/remote'

// Both switches sit beside the address in one expression: Vite inlines them, and the minifier drops the address from
// a bundle with the feed off.
export const changelogUrl = () =>
  (import.meta.env.VITE_CHANGELOG_ENABLED ?? '').trim() === 'true' &&
  (import.meta.env.VITE_AIR_GAP ?? '').trim() !== 'true'
    ? 'https://docs.pug.sh/changelog/'
    : null

const MAX_FEED_BYTES = 64 * 1024
const FEED_VERSION = 1
const DAY = /^\d{4}-\d{2}-\d{2}$/

export type ChangelogEntry = {
  slug: string
  title: string
  summary: string
  date: string
  tags: string[]
  pinned: boolean
  url: string
}

const asObject = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

const nonEmpty = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : null)

const isDay = (value: string) => DAY.test(value) && !Number.isNaN(Date.parse(value))

// Newest first. Any other version is refused; an entry this build can't use is left out.
export const parseFeed = (text: string) => {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const feed = asObject(json)
  if (!feed || feed.version !== FEED_VERSION || !Array.isArray(feed.entries)) return null
  const entries: ChangelogEntry[] = []
  for (const value of feed.entries) {
    const entry = asObject(value)
    const slug = nonEmpty(entry?.slug)
    const title = nonEmpty(entry?.title)
    const date = nonEmpty(entry?.date)
    const url = nonEmpty(entry?.url)
    if (!entry || !slug || !title || !date || !isDay(date) || !url?.startsWith('https://')) continue
    if (entries.some(seen => seen.slug === slug)) continue
    entries.push({
      slug,
      title,
      summary: typeof entry.summary === 'string' ? entry.summary : '',
      date,
      tags: Array.isArray(entry.tags) ? entry.tags.filter(tag => typeof tag === 'string') : [],
      pinned: entry.pinned === true,
      url,
    })
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date))
}

export const fetchFeed = async () => {
  const base = changelogUrl()
  if (!base) return null
  const fetched = await fetchCapped(`${base}feed.json`, MAX_FEED_BYTES)
  const entries = fetched.ok ? parseFeed(fetched.text) : null
  if (!entries?.length)
    console.warn(`What's new: no entries read from the changelog feed (${fetched.ok ? 'format' : fetched.reason})`)
  return entries
}
