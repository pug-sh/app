import type { JsonObject } from '@bufbuild/protobuf'
import type { Profile } from '@/api/genproto/shared/profiles/v1/profiles_pb'
import { structGet } from '@/lib/struct'

export interface ProfileIdentity {
  name: string // best human label; never empty (name traits → externalId → id)
  email?: string // present only when an email trait resolves
  avatarUrl?: string // present only when an avatar trait resolves
  isFallback: boolean // true when `name` is really an ID → UI keeps font-mono styling
  colorSeed: string // stable per-user seed for the avatar color (externalId || id)
}

// resolveIdentity only reads these fields; Pick keeps it tied to the proto while
// staying trivially constructible in tests.
type IdentitySource = Pick<Profile, 'id' | 'externalId' | 'properties'>

const NAME_KEYS = ['name', '$name', 'full_name', 'display_name']
const EMAIL_KEYS = ['email', '$email']
const AVATAR_KEYS = ['avatar', 'avatar_url', 'profile_image_uri', '$avatar', 'picture', 'photo_url']
const FIRST_NAME_KEYS = ['first_name', '$first_name', 'firstName']
const LAST_NAME_KEYS = ['last_name', '$last_name', 'lastName']

// First non-empty trait among keys, in priority order (mirrors fmtFirst in well-known-events).
const firstTrait = (props: JsonObject | undefined, keys: string[]) => {
  for (const k of keys) {
    const v = structGet(props, k)
    if (v) return v
  }
  return undefined
}

// Compose a name from separate first/last traits (e.g. first_name + last_name).
const composeName = (props: JsonObject | undefined) => {
  const joined = [firstTrait(props, FIRST_NAME_KEYS), firstTrait(props, LAST_NAME_KEYS)].filter(Boolean).join(' ')
  return joined || undefined
}

export const getInitials = (value: string) =>
  value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || '?'

const hashHue = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) % 360
  return hash
}

export const placeholderTone = (value: string) => {
  const hue = hashHue(value)
  return {
    bg: `oklch(0.78 0.06 ${hue})`,
    fg: `oklch(0.28 0.03 ${hue})`,
  }
}

export const resolveIdentity = (profile: IdentitySource): ProfileIdentity => {
  const props = profile.properties
  const resolvedName = firstTrait(props, NAME_KEYS) ?? composeName(props)
  const fallbackLabel = profile.externalId || profile.id
  return {
    name: resolvedName || fallbackLabel,
    email: firstTrait(props, EMAIL_KEYS),
    avatarUrl: firstTrait(props, AVATAR_KEYS),
    isFallback: !resolvedName,
    colorSeed: profile.externalId || profile.id,
  }
}
