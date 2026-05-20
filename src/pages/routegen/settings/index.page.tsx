import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { useProjectPrefix } from '@/lib/project-path'

const SettingsIndex = () => {
  const [, navigate] = useLocation()
  const prefix = useProjectPrefix()

  useEffect(() => {
    if (prefix) navigate(`${prefix}/settings/general`, { replace: true })
  }, [prefix, navigate])

  return null
}

export default SettingsIndex
