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

export const formatClock = (d: Date) => {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

// UTC: billing periods are UTC calendar boundaries, so a period end is exactly UTC midnight and any
// western local zone renders it a day early.
export const formatUTCDate = (d: Date) => {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
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
