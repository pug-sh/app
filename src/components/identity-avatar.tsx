// Bundled rather than served from api.dicebear.com: that endpoint is free for non-commercial use
// only, rate-limited, and offers no uptime guarantee. The artwork is CC0 either way.
import { Avatar, Style } from '@dicebear/core'
import notionists from '@dicebear/styles/notionists.json'
import { useAtomValue } from 'jotai'
import { memo, useState } from 'react'

import { avatarPaletteAtom } from '@/data/theme.atoms'
import { cn } from '@/lib/utils'

const style = new Style(notionists)

// Sized past the live feed's page size: below the working set a flush makes every later pass miss
// everything, and each miss is ~0.2ms of generation.
const MAX_CACHE = 1000
const cache = new Map<string, string>()

// No `size` option: the SVG scales to the <img>, so one data URI serves every call site. Cached
// across instances so a visitor drawn as both a marker and a row generates — and decodes — once;
// keyed on the palette too, so a theme that recolours avatars never serves a stale disc.
const generatedSrc = (id: string, palette: string[]) => {
  const key = `${palette.join(',')}|${id}`
  const hit = cache.get(key)
  if (hit) return hit
  if (cache.size >= MAX_CACHE) cache.clear()
  const uri = new Avatar(style, { seed: id, backgroundColor: palette }).toDataUri()
  cache.set(key, uri)
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
  const palette = useAtomValue(avatarPaletteAtom)
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
    <img
      src={generatedSrc(id || 'unknown', palette)}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      className={classes}
    />
  )
}

// Every prop is a primitive, so shallow compare is exact — this is what keeps the live page's 10s
// poll from re-rendering every row.
export default memo(IdentityAvatar)
