import { Globe } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { brandIconSrc } from '@/lib/brand-icon-assets'
import type { BrandIconName } from '@/lib/brand-icons'
import { cn } from '@/lib/utils'

type BrandIconProps = {
  name: BrandIconName | null
  className?: string
  size?: number
  // Named for what it is, not `fallback` — the label components in platform-label.tsx use that for
  // "no data at all", and these nest.
  unknownGlyph?: ReactNode
}

export const BrandIcon = ({ name, className, size = 16, unknownGlyph = null }: BrandIconProps) => {
  // Keyed by src, not a bare boolean: a row that renders one browser, 404s, then re-renders
  // with another would otherwise stay blank for the rest of the component's life.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const src = name ? brandIconSrc(name) : null

  if (!src || src === failedSrc) return unknownGlyph

  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      onError={() => {
        // A missing asset is otherwise invisible: aria-hidden, no console error, and it renders
        // the same as a brand we legitimately have no glyph for.
        if (import.meta.env.DEV) console.warn(`[BrandIcon] asset failed to load: ${src}`)
        setFailedSrc(src)
      }}
      className={cn('inline-block shrink-0 saturate-[0.5] opacity-95', className)}
      style={{ width: size, height: size }}
    />
  )
}

// Neutral globe for an unmatched $browser: the value set is open, so this branch is routine.
export const UnknownBrowserIcon = ({ className, size = 16 }: { className?: string; size?: number }) => (
  <Globe
    aria-hidden
    strokeWidth={1.75}
    className={cn('inline-block shrink-0 text-muted-foreground/80', className)}
    style={{ width: size, height: size }}
  />
)
