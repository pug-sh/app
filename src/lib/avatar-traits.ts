import type { JsonObject } from '@bufbuild/protobuf'
import { structFirst } from '@/lib/struct'

// No backend contract defines these — a customer picks whichever key they send on identify() or on
// an event.
const AVATAR_KEYS = ['avatar', 'avatar_url', 'profile_image_uri', '$avatar', 'picture', 'photo_url']

// The value is customer-controlled and lands in an <img src>, so only absolute https passes.
// structGet stringifies numbers, and a bare `42` would otherwise resolve against our own origin.
// The regex gate first: a relative URL is the likeliest wrong value, and throwing from `new URL`
// costs ~1300x more than rejecting it here.
const isHttpsUrl = (value: string) => {
  if (!/^\s*https:/i.test(value)) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export const resolveAvatarUrl = (properties: JsonObject | undefined) => structFirst(properties, AVATAR_KEYS, isHttpsUrl)
