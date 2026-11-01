import { Globe } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const ICON_CLASS = 'shrink-0 rounded-[3px]'

// The favicon service, when this build opted out of the air gap. The read and the address share one expression on
// purpose: Vite inlines the value and the minifier drops the branch, so an air-gapped bundle holds no address.
const faviconService = () =>
  (import.meta.env.VITE_PUG_SERVICES_ENABLED ?? '').trim() === 'true' ? 'https://favicons.pug.sh' : null

// Site favicon for a referrer domain, from favicons.pug.sh: first-party infrastructure on our own
// domain (like maps.pug.sh for the basemap), which keeps this unbounded, runtime-discovered icon set
// inside the no-external-CDN rule instead of an exception to it. The path carries a public hostname
// (self-referral-blanked server-side), not customer PII. Decorative, so the img is aria-hidden.
export const DomainFavicon = ({ domain, size = 16 }: { domain: string; size?: number }) => {
  const [failed, setFailed] = useState(false)
  const service = faviconService()

  // onError only fires when the service is unreachable: a domain it simply lacks returns a blank
  // placeholder (HTTP 200), so those rows show no glyph rather than this globe.
  if (!service || failed)
    return <Globe aria-hidden size={size} className={cn(ICON_CLASS, 'p-px text-muted-foreground/45')} />

  return (
    <img
      src={`${service}/${encodeURIComponent(domain)}`}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      width={size}
      height={size}
      // Preflight's `img { height: auto }` outranks the height attribute; a non-square favicon
      // stretches the row without this.
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
      // Muted to match the other row glyphs; the fallback globe is already muted by its own color.
      className={cn(ICON_CLASS, 'object-contain saturate-[0.5] opacity-95')}
    />
  )
}
