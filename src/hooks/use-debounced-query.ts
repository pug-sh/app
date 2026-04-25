import { ConnectError } from '@connectrpc/connect'
import { useEffect, useRef, useState } from 'react'

export const useDebouncedQuery = <T>(
  queryKey: string,
  queryFn: () => Promise<T>,
  opts: { enabled?: boolean; debounceMs?: number } = {}
) => {
  const { enabled = true, debounceMs = 300 } = opts
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const queryFnRef = useRef(queryFn)
  queryFnRef.current = queryFn

  useEffect(() => {
    if (!enabled) {
      setData(undefined)
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
        if (!cancelled) setData(resp)
      } catch (err) {
        console.error(`Query failed [${queryKey.slice(0, 80)}]:`, err)
        if (!cancelled) {
          setData(undefined)
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

  return { data, loading, error, retry: () => setRetryCount(c => c + 1) }
}
