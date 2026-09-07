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

// protobuf-es returns an Invalid Date rather than throwing, so tsToDate's catch never fires and a
// bare null check passes it into Intl, which throws mid-render.
export const validDate = (d: Date | null) => {
  if (!d || Number.isNaN(d.getTime())) return null
  return d
}

export const formatClock = (d: Date) => {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

// A quota period is built as UTC midnight, so a western local zone renders it a day early.
export const formatUTCDate = (d: Date) => {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// For instants that are not calendar boundaries, which UTC would date a day off.
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
