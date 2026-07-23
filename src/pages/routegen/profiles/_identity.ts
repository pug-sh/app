import type { Profile } from '@/api/genproto/shared/profiles/v1/profiles_pb'
import { resolveAvatarUrl } from '@/lib/avatar-traits'
import { resolveTraitEmail, resolveTraitName } from '@/lib/identity-traits'

export interface ProfileIdentity {
  name: string // best human label; never empty (name traits → externalId → id)
  email?: string // present only when an email trait resolves
  avatarUrl?: string // present only when an avatar trait resolves
  isFallback: boolean // true when `name` is really an ID → UI keeps font-mono styling
  avatarSeed: string // pug profile id — identified users send a different distinct id, so Live's face differs
}

// resolveIdentity only reads these fields; Pick keeps it tied to the proto while
// staying trivially constructible in tests.
type IdentitySource = Pick<Profile, 'id' | 'externalId' | 'properties'>

export const resolveIdentity = (profile: IdentitySource): ProfileIdentity => {
  const props = profile.properties
  const resolvedName = resolveTraitName(props)
  const fallbackLabel = profile.externalId || profile.id
  return {
    name: resolvedName || fallbackLabel,
    email: resolveTraitEmail(props),
    avatarUrl: resolveAvatarUrl(props),
    isFallback: !resolvedName,
    avatarSeed: profile.id,
  }
}
