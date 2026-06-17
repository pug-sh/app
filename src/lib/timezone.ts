import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'

// Browser IANA zone, e.g. "Asia/Kolkata". Empty string on the rare engine that
// can't resolve one — the server treats "" as UTC.
export const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch (err) {
    // Distinguish a real Intl failure from the expected legacy-engine case; '' = UTC.
    console.warn('browserTimezone: could not resolve browser zone, defaulting to UTC', err)
    return ''
  }
}

// Full IANA list for the settings picker. Empty array on engines without
// Intl.supportedValuesOf → caller degrades to a free-text input.
export const supportedTimezones = () => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch (err) {
    console.warn('supportedTimezones: Intl.supportedValuesOf unavailable, falling back to free-text input', err)
    return []
  }
}

// --- Bucket-boundary alignment -------------------------------------------------
//
// The server buckets day/week/month (and fractional-offset hour) boundaries in the
// project's reporting zone. When the FE sends a window whose `from` lands mid-bucket
// (e.g. browser-local midnight while the project zone is different), the first bucket
// is a partial slice and renders as a "dip" at the left edge of the chart. Flooring
// `from` to the bucket start *in the project zone* makes that first bucket complete.

// Civil wall-clock parts of `instant` as seen in `timeZone`.
const zonedParts = (timeZone: string, instant: Date) => {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const out: Record<string, number> = {}
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value)
  }
  // h23 can surface hour 24 at midnight on some engines — normalize to 0.
  if (out.hour === 24) out.hour = 0
  return out
}

// `timeZone`'s offset from UTC (ms) at `instant`. Positive = ahead of UTC.
const zoneOffsetMs = (timeZone: string, instant: Date) => {
  const p = zonedParts(timeZone, instant)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant.getTime()
}

// The UTC instant for a wall-clock time (h:00:00) on y-mo-d in `timeZone`. Refines
// the offset once so it stays correct across a DST boundary.
const wallToInstant = (timeZone: string, y: number, mo: number, d: number, h: number) => {
  const guess = Date.UTC(y, mo - 1, d, h, 0, 0)
  const refined = guess - zoneOffsetMs(timeZone, new Date(guess - zoneOffsetMs(timeZone, new Date(guess))))
  return new Date(refined)
}

// Floor `instant` to the start of its bucket at `granularity`, computed in `timeZone`,
// matching the server's ClickHouse bucket functions (week = Sunday start, per
// toStartOfWeek default mode 0). HOUR also aligns in-zone, which matters for
// fractional-offset zones (e.g. IST's :30 boundary). A bad zone throws in Intl —
// return the instant unchanged (the server falls back to UTC).
export const floorToZoneBucket = (instant: Date, granularity: Granularity, timeZone: string): Date => {
  try {
    const p = zonedParts(timeZone, instant)
    if (granularity === Granularity.HOUR) return wallToInstant(timeZone, p.year, p.month, p.day, p.hour)
    if (granularity === Granularity.MONTH) return wallToInstant(timeZone, p.year, p.month, 1, 0)
    if (granularity === Granularity.WEEK) {
      // Day-of-week is calendar-based; derive it from the civil date, then step back to Sunday.
      const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
      const sun = new Date(Date.UTC(p.year, p.month - 1, p.day - dow))
      return wallToInstant(timeZone, sun.getUTCFullYear(), sun.getUTCMonth() + 1, sun.getUTCDate(), 0)
    }
    if (granularity === Granularity.DAY) return wallToInstant(timeZone, p.year, p.month, p.day, 0)
    // MINUTE / UNSPECIFIED / anything else — don't second-guess the boundary.
    return instant
  } catch {
    return instant
  }
}
