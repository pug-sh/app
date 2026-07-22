import type { JsonObject } from '@bufbuild/protobuf'
import type { Profile } from '@/api/genproto/shared/profiles/v1/profiles_pb'
import { resolveAvatarUrl } from '@/lib/avatar-traits'
import { structFirst } from '@/lib/struct'

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

const NAME_KEYS = ['name', '$name', 'full_name', 'display_name']
const EMAIL_KEYS = ['email', '$email']
const FIRST_NAME_KEYS = ['first_name', '$first_name', 'firstName']
const LAST_NAME_KEYS = ['last_name', '$last_name', 'lastName']

// Compose a name from separate first/last traits (e.g. first_name + last_name).
const composeName = (props: JsonObject | undefined) => {
  const joined = [structFirst(props, FIRST_NAME_KEYS), structFirst(props, LAST_NAME_KEYS)].filter(Boolean).join(' ')
  return joined || undefined
}

export const resolveIdentity = (profile: IdentitySource): ProfileIdentity => {
  const props = profile.properties
  const resolvedName = structFirst(props, NAME_KEYS) ?? composeName(props)
  const fallbackLabel = profile.externalId || profile.id
  return {
    name: resolvedName || fallbackLabel,
    email: structFirst(props, EMAIL_KEYS),
    avatarUrl: resolveAvatarUrl(props),
    isFallback: !resolvedName,
    avatarSeed: profile.id,
  }
}
