import { useEffect, useMemo, useState } from 'react'

/** Format a date as relative time string. */
export function formatRelative(d: Date) {
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

/** Returns a live-updating relative time string that refreshes every 30s. */
export function useRelativeTime(date: Date | null) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!date) return
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [date])

  // Tick is intentionally in deps to force recomputation when the interval fires.
  return useMemo(() => (date ? formatRelative(date) : ''), [date, tick])
}
