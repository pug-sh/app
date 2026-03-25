import { useEffect, useState } from 'react'

/** Format a date as relative time string. */
export function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

/** Returns a live-updating relative time string that refreshes every 30s. */
export function useRelativeTime(date: Date | null): string {
  const [text, setText] = useState(() => (date ? formatRelative(date) : ''))

  useEffect(() => {
    if (!date) return
    setText(formatRelative(date))
    const id = setInterval(() => setText(formatRelative(date)), 30_000)
    return () => clearInterval(id)
  }, [date])

  return text
}
