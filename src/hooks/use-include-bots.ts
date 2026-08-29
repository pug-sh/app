import { useAtom } from 'jotai'
import { useCallback, useEffect, useTransition } from 'react'
import { includeBotsAtom } from '@/data/bots.atoms'
import { writeIncludeBotsParam } from '@/hooks/use-filter-query-params'

export const useIncludeBots = () => {
  const [includeBots, setValue] = useAtom(includeBotsAtom)
  const [, startTransition] = useTransition()

  // Mirrors the flag into whichever page is mounted, so the param follows a navigation instead of
  // being stranded on the page the toggle was flipped on.
  useEffect(() => {
    writeIncludeBotsParam(includeBots)
  }, [includeBots])

  // The profile Overview reads a suspending atom that depends on this, so a bare set blanks the whole
  // tab — the same re-suspend its Retry button already wraps.
  const setIncludeBots = useCallback((next: boolean) => startTransition(() => setValue(next)), [setValue])

  return [includeBots, setIncludeBots] as const
}
