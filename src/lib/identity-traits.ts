import type { JsonObject } from '@bufbuild/protobuf'
import { structFirst } from '@/lib/struct'

// No backend contract defines these — a customer picks whichever key they send on identify() or on
// an event. Shared so a profile header and the live feed name the same person the same way.
const NAME_KEYS = ['name', '$name', 'full_name', 'display_name']
const EMAIL_KEYS = ['email', '$email']
const FIRST_NAME_KEYS = ['first_name', '$first_name', 'firstName']
const LAST_NAME_KEYS = ['last_name', '$last_name', 'lastName']

// Compose a name from separate first/last traits (e.g. first_name + last_name).
const composeName = (props: JsonObject | undefined) => {
  const joined = [structFirst(props, FIRST_NAME_KEYS), structFirst(props, LAST_NAME_KEYS)].filter(Boolean).join(' ')
  return joined || undefined
}

export const resolveTraitName = (props: JsonObject | undefined) => structFirst(props, NAME_KEYS) ?? composeName(props)

export const resolveTraitEmail = (props: JsonObject | undefined) => structFirst(props, EMAIL_KEYS)
