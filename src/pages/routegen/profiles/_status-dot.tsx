import { cn } from '@/lib/utils'

// Presence thresholds, deliberately local: the live page's window is a user-selectable query range
// that happens to default to the same 5 minutes, not the same concept.
const ONLINE_MINS = 5
const RECENT_MINS = 60 * 24

const presence = (lastSeen: Date | null) => {
  if (!lastSeen) return { color: 'bg-muted-foreground/30', label: 'Never seen' }

  const minsAgo = (Date.now() - lastSeen.getTime()) / 60_000
  if (minsAgo < ONLINE_MINS) return { color: 'bg-success', label: 'Online now' }
  if (minsAgo < RECENT_MINS) return { color: 'bg-warning', label: 'Seen today' }
  return { color: 'bg-muted-foreground/30', label: 'Offline' }
}

const StatusDot = ({ lastSeen, className }: { lastSeen: Date | null; className?: string }) => {
  const { color, label } = presence(lastSeen)

  return (
    <span title={label} className={cn('inline-block size-2.5 rounded-full ring-2 ring-background', color, className)} />
  )
}

export default StatusDot
