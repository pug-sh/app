import { Bot } from 'lucide-react'

import IdentityAvatar from '@/components/identity-avatar'
import { cn } from '@/lib/utils'
import type { ProfileIdentity } from './_identity'

type Props = { identity: ProfileIdentity; bot?: boolean; className?: string }

// A bot person only ever appears with the include-bots toggle on, and its generated face read as a
// real visitor — the glyph replaces it rather than badging it.
export const ProfileAvatar = ({ identity, bot, className }: Props) =>
  bot ? (
    <span
      className={cn('flex shrink-0 items-center justify-center bg-muted text-muted-foreground', className)}
      title="Automated traffic"
    >
      <Bot className="size-[62%]" aria-hidden />
    </span>
  ) : (
    <IdentityAvatar id={identity.avatarSeed} src={identity.avatarUrl} alt={identity.name} className={className} />
  )
