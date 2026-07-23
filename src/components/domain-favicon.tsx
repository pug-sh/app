import { Globe } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const ICON_CLASS = 'size-4 shrink-0 rounded-[3px]'

// Site favicon for a referrer domain, from favicons.pug.sh — first-party infrastructure on our own
// domain (like maps.pug.sh for the basemap), which keeps this unbounded, runtime-discovered icon set
// inside the no-external-CDN rule instead of an exception to it. The path carries a public hostname
// (self-referral-blanked server-side), not customer PII. Decorative, so the img is aria-hidden.
export const DomainFavicon = ({ domain }: { domain: string }) => {
  const [failed, setFailed] = useState(false)

  // onError only fires when the service is unreachable — a domain it simply lacks returns a blank
  // placeholder (HTTP 200), so those rows show no glyph rather than this globe.
  if (failed) return <Globe aria-hidden className={cn(ICON_CLASS, 'p-px text-muted-foreground/45')} />

  return (
    <img
      src={`https://favicons.pug.sh/${encodeURIComponent(domain)}`}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      width={16}
      height={16}
      onError={() => setFailed(true)}
      // Muted to match the other row glyphs; the fallback globe is already muted by its own color.
      className={cn(ICON_CLASS, 'object-contain saturate-[0.5] opacity-95')}
    />
  )
}
