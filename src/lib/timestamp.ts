import { timestampDate } from '@bufbuild/protobuf/wkt'
import type { Timestamp } from '@bufbuild/protobuf/wkt'

export const tsToDate = (ts: Timestamp | undefined): Date | null => {
  if (!ts) return null
  try {
    return timestampDate(ts)
  } catch {
    return null
  }
}

export const formatClock = (d: Date): string => {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
