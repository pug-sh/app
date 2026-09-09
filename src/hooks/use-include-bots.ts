import { useAtom } from 'jotai'
import { useEffect } from 'react'
import { includeBotsAtom } from '@/data/bots.atoms'
import { writeIncludeBotsParam } from '@/hooks/use-filter-query-params'

export const useIncludeBots = () => {
  const [includeBots, setIncludeBots] = useAtom(includeBotsAtom)

  // Mirrors the flag into whichever page is mounted, so the param follows a navigation instead of
  // being stranded on the page the toggle was flipped on.
  useEffect(() => {
    writeIncludeBotsParam(includeBots)
  }, [includeBots])

  return [includeBots, setIncludeBots] as const
}
