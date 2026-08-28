import { ConnectError } from '@connectrpc/connect'
import { useEffect, useRef, useState } from 'react'

// Build a stable string key from an arbitrary query-input object. Proto fields are
// often bigint, which JSON.stringify rejects, so coerce those to strings.
export const stringifyQueryKey = (value: unknown) =>
  JSON.stringify(value, (_key, nextValue) => (typeof nextValue === 'bigint' ? nextValue.toString() : nextValue))

export const useDebouncedQuery = <T>(
  queryKey: string,
  queryFn: () => Promise<T>,
  opts: { enabled?: boolean; debounceMs?: number } = {},
) => {
  const { enabled = true, debounceMs = 300 } = opts
  const [data, setData] = useState<T | undefined>(undefined)
  // The key `data` was fetched for. `data` deliberately survives a queryKey change so the previous
  // result stays on screen, and `loading` only flips in the effect below — so the render that
  // changes the query still reads stale data with loading false. Compare against the current key.
  const [dataKey, setDataKey] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const queryFnRef = useRef(queryFn)
  queryFnRef.current = queryFn

  useEffect(() => {
    if (!enabled) {
      setData(undefined)
      setDataKey(undefined)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const resp = await queryFnRef.current()
        if (!cancelled) {
          setData(resp)
          setDataKey(queryKey)
        }
      } catch (err) {
        console.error(`Query failed [${queryKey.slice(0, 80)}]:`, err)
        if (!cancelled) {
          setData(undefined)
          setDataKey(undefined)
          const message =
            err instanceof ConnectError
              ? err.message
              : err instanceof Error
                ? `Unexpected error: ${err.message}`
                : 'Query failed'
          setError(message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, debounceMs)
    return () => {
      cancelled = true
      clearTimeout(debounceRef.current)
    }
  }, [queryKey, enabled, retryCount, debounceMs])

  return { data, dataKey, loading, error, retry: () => setRetryCount(c => c + 1) }
}
