import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

// Same name-hashed hue scheme as profile avatars, but tinted right down — the chip marks which
// entity a row is, so it has to stay quieter than the name beside it.
const nameHue = (seed: string) => {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 360
  return hash
}

// An initial tile for a named entity — projects in the sidebar switcher, orgs in the picker. Size
// and radius come from the call site so one chip serves both a 20px row marker and a 32px header.
export const NameChip = ({
  name,
  fallback = '?',
  className,
}: {
  name?: string | null
  fallback?: string
  className?: string
}) => {
  const seed = name?.trim() || fallback
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md font-medium',
        'bg-[oklch(0.93_0.035_var(--tone))] text-[oklch(0.45_0.08_var(--tone))]',
        'dark:bg-[oklch(0.37_0.045_var(--tone))] dark:text-[oklch(0.86_0.05_var(--tone))]',
        className,
      )}
      style={{ '--tone': nameHue(seed) } as CSSProperties}
      aria-hidden
    >
      {/* By code point, not code unit: charAt splits an emoji-led name into a lone surrogate. */}
      {Array.from(seed)[0]?.toUpperCase()}
    </span>
  )
}
