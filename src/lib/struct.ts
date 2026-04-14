import type { JsonObject, JsonValue } from '@bufbuild/protobuf'

const jsonValueToString = (v: JsonValue) => {
  if (v === null || v === undefined) return undefined
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

export const structToEntries = (s: JsonObject | undefined) => {
  if (!s) return []
  const entries: [string, string][] = []
  for (const [k, v] of Object.entries(s)) {
    const str = jsonValueToString(v)
    if (str !== undefined && str !== '') entries.push([k, str])
  }
  return entries
}

export const structGet = (s: JsonObject | undefined, key: string) => {
  if (!s || !(key in s)) return undefined
  return jsonValueToString(s[key])
}
