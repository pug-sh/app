import type { Timestamp } from '@bufbuild/protobuf/wkt'
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt'

export const tsToDate = (ts: Timestamp | undefined) => {
  if (!ts) return null
  try {
    return timestampDate(ts)
  } catch (err) {
    console.error('Failed to parse timestamp:', ts, err)
    return null
  }
}

// protobuf-es hands back an Invalid Date for an out-of-range int64 rather than throwing, so
// tsToDate's try/catch never fires and a bare null check passes it into Intl, which throws mid-render.
export const validDate = (d: Date | null) => {
  if (!d || Number.isNaN(d.getTime())) return null
  return d
}

export const formatClock = (d: Date) => {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

// UTC: a quota period is built as UTC midnight (billing.go), so any western local zone renders it a
// day early. Only for those boundaries — a provider instant needs formatLocalDate.
export const formatUTCDate = (d: Date) => {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// For instants that are not calendar boundaries — a renewal is the provider's billing moment and a
// trial end is the signup instant plus 14 days, so UTC would date either a day off the local one.
export const formatLocalDate = (d: Date) => {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const formatDateTime = (d: Date) => {
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  )
}

export const toProtoTimeRange = (range: { from: Date; to: Date } | undefined) =>
  range ? { from: timestampFromDate(range.from), to: timestampFromDate(range.to) } : undefined
