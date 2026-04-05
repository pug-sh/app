import { useEffect, useRef, useState } from 'react'

export const useDebouncedQuery = <T,>(
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

  useEffect(() => {
    if (!enabled) {
      setData(undefined)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const resp = await queryFn()
        if (!cancelled) setData(resp)
      } catch (err) {
        console.error('Query failed:', err)
        if (!cancelled) {
          setData(undefined)
          setError(err instanceof Error ? err.message : 'Query failed')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, debounceMs)
    return () => { cancelled = true; clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryFn identity changes every render; queryKey drives re-execution
  }, [queryKey, enabled, retryCount])

  return { data, loading, error, retry: () => setRetryCount(c => c + 1) }
}
