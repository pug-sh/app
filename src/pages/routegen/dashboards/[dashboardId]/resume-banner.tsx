import { Button } from '@/components/ui/button'

const formatRelative = (ts: number): string => {
  const elapsed = Date.now() - ts
  const minutes = Math.round(elapsed / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

// Shown in view mode when a draft is still parked in localStorage: 'resume' when
// the dashboard is unchanged since the draft started, 'conflict' when it drifted.
export const ResumeBanner = ({
  kind,
  startedAt,
  onDiscard,
  onResume,
}: {
  kind: 'resume' | 'conflict'
  startedAt: number
  onDiscard: () => void
  onResume: () => void
}) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/25 bg-warning/10 px-4 py-2 text-sm">
    <div className="min-w-0">
      <span className="font-medium text-caution">
        {kind === 'resume' ? 'Resume editing' : 'Dashboard changed since you started'}
      </span>
      <span className="ml-2 text-caution">started {formatRelative(startedAt)}</span>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <Button size="sm" variant="ghost" onClick={onDiscard}>
        Discard
      </Button>
      <Button size="sm" onClick={onResume}>
        {kind === 'resume' ? 'Resume' : 'Resume anyway'}
      </Button>
    </div>
  </div>
)
