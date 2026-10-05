// Caches a function of a string key for the session. The engine's keys — palette hexes, installed
// theme texts — are few, so nothing is ever evicted.
export const memoize = <T>(fn: (key: string) => T) => {
  const cache = new Map<string, T>()
  return (key: string) => {
    if (cache.has(key)) return cache.get(key) as T
    const value = fn(key)
    cache.set(key, value)
    return value
  }
}
