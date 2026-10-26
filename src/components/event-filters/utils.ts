export const splitValues = (input: string) =>
  input
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)

export const mergeUniqueValues = (existing: string[], incoming: string[]) => {
  if (incoming.length === 0) return existing
  const seen = new Set(existing)
  const next = [...existing]
  for (const item of incoming) {
    if (!seen.has(item)) {
      seen.add(item)
      next.push(item)
    }
  }
  return next
}
