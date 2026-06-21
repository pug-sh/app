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
  <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm dark:border-amber-400/25 dark:bg-amber-400/10">
    <div className="min-w-0">
      <span className="font-medium text-amber-900 dark:text-amber-200">
        {kind === 'resume' ? 'Resume editing' : 'Dashboard changed since you started'}
      </span>
      <span className="ml-2 text-amber-700 dark:text-amber-400">started {formatRelative(startedAt)}</span>
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
