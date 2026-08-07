import { useEffect } from 'react'
import { useLocation } from 'wouter'
import LoadingSpinner from '@/components/loading-spinner'
import { useRouteParams } from '@/lib/route-params'

const SettingsIndex = () => {
  const { projectId } = useRouteParams<{ projectId: string }>()
  const [, navigate] = useLocation()

  useEffect(() => {
    if (projectId) navigate(`/p/${projectId}/settings/general`, { replace: true })
  }, [projectId, navigate])

  return <LoadingSpinner />
}

export default SettingsIndex
