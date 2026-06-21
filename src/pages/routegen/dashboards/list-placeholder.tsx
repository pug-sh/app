import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// Minimal centered state (faded icon + a line of text, optional action) shared by
// the error, empty, and no-results branches of the dashboards list.
export const DashboardsPlaceholder = ({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon
  title: string
  action?: ReactNode
}) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <Icon className="mb-4 size-10 opacity-15" />
    <p className={`text-sm font-medium ${action ? 'mb-4' : ''}`}>{title}</p>
    {action}
  </div>
)
