import { activeProjectAtom } from '@/data/workspace.atoms'
import { useAtomValue } from 'jotai'
import { useLocation } from 'wouter'

export const useProjectPrefix = (): string => {
  const project = useAtomValue(activeProjectAtom)
  if (!project) return ''
  return `/p/${project.id}`
}

export const useProjectNavigate = () => {
  const [, navigate] = useLocation()
  const prefix = useProjectPrefix()
  return (path: string, opts?: { replace?: boolean }) => navigate(`${prefix}${path}`, opts)
}
