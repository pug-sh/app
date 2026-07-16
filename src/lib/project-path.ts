import { useAtomValue } from 'jotai'
import { useLocation } from 'wouter'
import { activeProjectAtom } from '@/data/workspace.atoms'

// The project the current URL names, if any. Every generated page route is /p/:projectId/... (see
// routes.ts), but the callers here sit outside the <Route> tree — App's bootstrap and the sidebar —
// so they have no useParams to read it from.
export const useRouteProjectId = () => {
  const [location] = useLocation()
  return location.match(/^\/p\/([^/]+)/)?.[1] ?? null
}

export const useProjectPrefix = () => {
  const project = useAtomValue(activeProjectAtom)
  if (!project) return ''
  return `/p/${project.id}`
}

export const useProjectNavigate = () => {
  const [, navigate] = useLocation()
  const prefix = useProjectPrefix()
  return (path: string, opts?: { replace?: boolean }) => navigate(`${prefix}${path}`, opts)
}
