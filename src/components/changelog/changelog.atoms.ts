import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { type ChangelogEntry, fetchFeed } from './feed'

// Per browser: the slugs seen. Null until the first feed lands, which then counts as read: a new member shouldn't open
// the app to a dot over months of history.
const storedAtom = atomWithStorage<unknown>('pug:changelog', null, undefined, { getOnInit: true })

const seenAtom = atom(get => {
  const stored = get(storedAtom)
  if (typeof stored !== 'object' || stored === null || !('seen' in stored) || !Array.isArray(stored.seen)) return null
  return stored.seen.filter(slug => typeof slug === 'string')
})

const REFRESH_MS = 60 * 60 * 1000
const KEPT = 100

const entriesStateAtom = atom<ChangelogEntry[]>([])
const lastReadAtom = atom(0)

// Keeps what was seen before, so a tab with an older list can't un-read what a newer one read.
export const markChangelogReadAtom = atom(null, (get, set) => {
  const seen = new Set([...get(entriesStateAtom).map(entry => entry.slug), ...(get(seenAtom) ?? [])])
  try {
    set(storedAtom, { seen: [...seen].slice(0, KEPT) })
  } catch {
    // Storage refused the write; the read still holds for this session.
  }
})

export const changelogEntriesAtom = atom(
  get => get(entriesStateAtom),
  async (get, set) => {
    // Gated from the start, so a read in flight isn't repeated and a failing feed is asked at most hourly too.
    if (Date.now() - get(lastReadAtom) < REFRESH_MS) return
    set(lastReadAtom, Date.now())
    const entries = await fetchFeed()
    // A failed or empty read keeps the last list, and an empty one can't count as everything read.
    if (!entries?.length) return
    set(entriesStateAtom, entries)
    if (get(seenAtom) === null) set(markChangelogReadAtom)
  },
)
changelogEntriesAtom.onMount = load => {
  void load()
  // A session can stay open for days, so a return to the tab looks again.
  const onVisible = () => {
    if (document.visibilityState === 'visible') void load()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}

export const changelogUnreadAtom = atom(get => {
  const seen = get(seenAtom)
  if (!seen) return []
  return get(entriesStateAtom).filter(entry => !seen.includes(entry.slug))
})
