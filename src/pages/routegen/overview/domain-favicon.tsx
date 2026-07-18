import { Globe } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

// Small site favicon for a referrer domain. Icons come from favicons.pug.sh (`/<domain>` → icon),
// first-party infrastructure on the dashboard's own registrable domain — the same arrangement as
// maps.pug.sh for the basemap. Per-referrer favicons are an unbounded set discovered at runtime, so
// unlike the bundled Twemoji/Devicon assets they can't be vendored into the app; serving them from
// our own host is what keeps this inside the no-external-CDN rule rather than an exception to it.
// The domain values in the path are low-cardinality public hostnames (self-referral-blanked
// server-side), not customer PII.
// Purely decorative — the domain label sits right beside it — so the img is aria-hidden. onError
// swaps in a neutral globe when the service is unreachable (a domain it simply lacks comes back as a
// blank placeholder, HTTP 200, so that row just shows no glyph rather than the globe).
export const DomainFavicon = ({ domain, className }: { domain: string; className?: string }) => {
  const [failed, setFailed] = useState(false)
  const shared = cn('size-4 shrink-0 rounded-[3px]', className)

  if (failed) return <Globe aria-hidden className={cn(shared, 'p-px text-muted-foreground/45')} />

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
      className={cn(shared, 'object-contain')}
    />
  )
}
