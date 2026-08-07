// Bundled rather than served from api.dicebear.com: that endpoint is free for non-commercial use
// only, rate-limited, and offers no uptime guarantee. The artwork is CC0 either way.
import { createAvatar } from '@dicebear/core'
import * as notionists from '@dicebear/notionists'
import { memo, useState } from 'react'

import { cn } from '@/lib/utils'

// Avatar discs carry identity, not meaning: one shared lightness, under the series-colour chroma
// cap, hues spread wide — at this chroma the old orange/amber pair was indistinguishable.
const AVATAR_COLORS = [
  '#da8282',
  '#d38b59',
  '#b99b46',
  '#86ac62',
  '#51b48d',
  '#2cb2bf',
  '#73a0e2',
  '#a68fdb',
  '#cc83b4',
]

// DiceBear wants bare hex — a leading '#' emits fill="##da8282", silently invalid.
const palette = AVATAR_COLORS.map(color => color.slice(1))

// Sized past the live feed's page size: below the working set a flush makes every later pass miss
// everything, and each miss is ~0.2ms of generation.
const MAX_CACHE = 1000
const cache = new Map<string, string>()

// No `size` option: the SVG scales to the <img>, so one data URI serves every call site. Cached
// across instances so a visitor drawn as both a marker and a row generates — and decodes — once.
const generatedSrc = (id: string) => {
  const hit = cache.get(id)
  if (hit) return hit
  if (cache.size >= MAX_CACHE) cache.clear()
  const uri = createAvatar(notionists, { seed: id, backgroundColor: palette }).toDataUri()
  cache.set(id, uri)
  return uri
}

type Props = {
  id: string
  src?: string
  alt?: string
  className?: string
}

// The customer's own picture when they sent one, else a generated face. Notionists is monochrome
// ink, so the palette disc stays the only colour on it.
const IdentityAvatar = ({ id, src, alt, className }: Props) => {
  // Keyed to the URL rather than the instance: the profile shell survives A → B, so a boolean would
  // suppress B's perfectly good picture because A's had 404'd.
  const [failedSrc, setFailedSrc] = useState<string>()
  const classes = cn('shrink-0 object-cover', className)

  if (src && src !== failedSrc) {
    return (
      <img
        src={src}
        alt={alt ?? ''}
        onError={() => setFailedSrc(src)}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        className={classes}
      />
    )
  }

  // An empty id lands on DiceBear's `hashSeed('') || 1` face; name the bucket so it's deliberate.
  return (
    <img src={generatedSrc(id || 'unknown')} alt="" aria-hidden loading="lazy" decoding="async" className={classes} />
  )
}

// Every prop is a primitive, so shallow compare is exact — this is what keeps the live page's 10s
// poll from re-rendering every row.
export default memo(IdentityAvatar)
