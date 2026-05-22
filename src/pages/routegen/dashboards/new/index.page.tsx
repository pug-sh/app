import { useAtomValue, useSetAtom } from 'jotai'
import { LayoutGrid } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Dashboard } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import { Button } from '@/components/ui/button'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { useProjectNavigate } from '@/lib/project-path'
import { toastRPCError } from '@/lib/rpc-error'
import { UNTITLED_DASHBOARD_NAME } from '../constants'
import { createDashboardAtom } from '../dashboard.atoms'

let pendingCreate: { projectId: string; promise: Promise<Dashboard | null> } | null = null

const NewDashboard = () => {
  const project = useAtomValue(activeProjectAtom)
  const createDashboard = useSetAtom(createDashboardAtom)
  const navigate = useProjectNavigate()
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!project) return

    let cancelled = false
    setError(null)

    const promise =
      pendingCreate?.projectId === project.id
        ? pendingCreate.promise
        : createDashboard({
            displayName: UNTITLED_DASHBOARD_NAME,
            description: '',
          })

    pendingCreate = { projectId: project.id, promise }
    promise.finally(() => {
      if (pendingCreate?.promise === promise) pendingCreate = null
    })

    promise
      .then(dashboard => {
        if (cancelled) return
        if (!dashboard) {
          setError('Failed to create dashboard')
          return
        }
        navigate(`/dashboards/${dashboard.id}`, { replace: true })
      })
      .catch(err => {
        if (cancelled) return
        toastRPCError(err, 'Failed to create dashboard')
        setError('Failed to create dashboard')
      })

    return () => {
      cancelled = true
    }
  }, [createDashboard, navigate, project, retryKey])

  if (!project) return <NoProject title="Dashboards" icon={LayoutGrid} />

  if (error) {
    return (
      <Page title="Dashboards" description="Dashboard could not be created">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <LayoutGrid className="mb-4 size-10 opacity-15" />
          <p className="mb-4 text-sm font-medium">{error}</p>
          <Button size="sm" variant="outline" onClick={() => setRetryKey(key => key + 1)}>
            Retry
          </Button>
        </div>
      </Page>
    )
  }

  return (
    <Page title="Dashboards" description="Creating dashboard">
      <LoadingSpinner />
    </Page>
  )
}

export default NewDashboard
