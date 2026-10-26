import { renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useDebouncedQuery } from './use-debounced-query'

const pendingQuery = (signals: AbortSignal[]) => (signal: AbortSignal) => {
  signals.push(signal)
  return new Promise<never>(() => {})
}

it('aborts the request a new key replaces', async () => {
  const signals: AbortSignal[] = []
  const { rerender } = renderHook(
    ({ queryKey }) => useDebouncedQuery(queryKey, pendingQuery(signals), { debounceMs: 0 }),
    {
      initialProps: { queryKey: 'a' },
    },
  )
  await waitFor(() => expect(signals).toHaveLength(1))

  rerender({ queryKey: 'b' })

  expect(signals[0].aborted).toBe(true)
  await waitFor(() => expect(signals).toHaveLength(2))
  expect(signals[1].aborted).toBe(false)
})

it('keeps retry stable across renders, so memoized consumers can skip', () => {
  const { result, rerender } = renderHook(() => useDebouncedQuery('a', pendingQuery([]), { enabled: false }))
  const first = result.current.retry

  rerender()

  expect(result.current.retry).toBe(first)
})
