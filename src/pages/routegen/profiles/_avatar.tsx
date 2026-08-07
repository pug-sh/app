import IdentityAvatar from '@/components/identity-avatar'
import type { ProfileIdentity } from './_identity'

export const ProfileAvatar = ({ identity, className }: { identity: ProfileIdentity; className?: string }) => (
  <IdentityAvatar id={identity.avatarSeed} src={identity.avatarUrl} alt={identity.name} className={className} />
)
