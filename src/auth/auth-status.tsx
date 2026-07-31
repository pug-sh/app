import { Loader2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// Tint only — an auth interstitial keeps one layout whether it's reporting success or failure.
const TONE = {
  brand: { tile: 'bg-primary/10', icon: 'text-link' },
  negative: { tile: 'bg-destructive/10', icon: 'text-negative' },
}

// The shape every auth page's interstitial takes: tinted icon tile, heading, a line of
// explanation, then whatever action follows as children.
export const AuthStatus = ({
  icon: Icon,
  tone = 'brand',
  title,
  description,
  children,
}: {
  icon: LucideIcon
  tone?: keyof typeof TONE
  title: string
  description?: ReactNode
  children?: ReactNode
}) => {
  const { tile, icon } = TONE[tone]
  return (
    <div className="text-center">
      <div className={`mx-auto mb-5 flex size-10 items-center justify-center rounded-lg ${tile}`}>
        <Icon className={`size-5 ${icon}`} aria-hidden />
      </div>
      <h1 className="text-2xl tracking-tight">{title}</h1>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      {children}
    </div>
  )
}

// Sibling of AuthStatus for the states that are still resolving — same column, no tile to draw
// yet, and short-lived enough that a heading would flash. Label-less while a chunk loads, where
// there is nothing to say yet that naming it wouldn't overstate.
export const AuthPending = ({ label }: { label?: string }) => (
  <div className="flex items-center justify-center gap-3 text-muted-foreground">
    <Loader2 className="size-5 animate-spin" aria-hidden />
    {label && <span className="text-sm">{label}</span>}
  </div>
)
