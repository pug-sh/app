import { useEffect } from 'react'
import { useLocation, useParams } from 'wouter'
import LoadingSpinner from '@/components/loading-spinner'

const SettingsIndex = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const [, navigate] = useLocation()

  useEffect(() => {
    if (projectId) navigate(`/p/${projectId}/settings/general`, { replace: true })
  }, [projectId, navigate])

  return <LoadingSpinner />
}

export default SettingsIndex
