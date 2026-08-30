import { Bot } from 'lucide-react'

import IdentityAvatar from '@/components/identity-avatar'
import { cn } from '@/lib/utils'
import type { ProfileIdentity } from './_identity'

type Props = { identity: ProfileIdentity; bot?: boolean; className?: string }

// A bot person's generated face read as a real visitor — the glyph replaces it rather than badging it.
export const ProfileAvatar = ({ identity, bot, className }: Props) =>
  bot ? (
    <span
      className={cn('flex shrink-0 items-center justify-center bg-muted text-muted-foreground', className)}
      role="img"
      aria-label={`${identity.name} — automated traffic`}
      title="Automated traffic"
    >
      <Bot className="size-[62%]" aria-hidden />
    </span>
  ) : (
    <IdentityAvatar id={identity.avatarSeed} src={identity.avatarUrl} alt={identity.name} className={className} />
  )
