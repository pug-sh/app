export const mergeUniqueValues = (existing: string[], input: string): string[] => {
  const incoming = input
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
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
