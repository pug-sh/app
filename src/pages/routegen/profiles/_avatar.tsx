import { useState } from 'react'
import { cn } from '@/lib/utils'
import { getInitials, type ProfileIdentity, placeholderTone } from './_identity'

// Renders the avatar image when one resolved; falls back to a colored initials
// badge on a missing URL or an image load error. `className` controls size/shape.
export const ProfileAvatar = ({ identity, className }: { identity: ProfileIdentity; className?: string }) => {
  const [failed, setFailed] = useState(false)

  if (identity.avatarUrl && !failed) {
    return (
      <img
        src={identity.avatarUrl}
        alt={identity.name}
        className={cn('shrink-0 object-cover', className)}
        onError={() => setFailed(true)}
      />
    )
  }

  const tone = placeholderTone(identity.colorSeed)
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center font-semibold', className)}
      style={{ backgroundColor: tone.bg, color: tone.fg }}
      aria-hidden
    >
      {getInitials(identity.name)}
    </span>
  )
}
