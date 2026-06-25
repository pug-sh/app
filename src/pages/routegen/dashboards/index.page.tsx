import { useAtomValue, useSetAtom } from 'jotai'
import { Loader2, PanelsTopLeft, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Can } from '@/auth/can'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { useProjectNavigate } from '@/lib/project-path'
import { toastRPCError } from '@/lib/rpc-error'
import { UNTITLED_DASHBOARD_NAME } from './constants'
import {
  createDashboardAtom,
  dashboardListAtom,
  dashboardListErrorAtom,
  dashboardListLoadingAtom,
  deleteDashboardAtom,
  fetchDashboardsAtom,
  pendingEditDashboardIdAtom,
} from './dashboard.atoms'
import { DashboardsPlaceholder } from './list-placeholder'
import { DashboardListRow } from './list-row'

const NewDashboardButton = ({ creating, onClick }: { creating: boolean; onClick: () => void }) => (
  <Button size="sm" onClick={onClick} disabled={creating}>
    {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
    New dashboard
  </Button>
)

const Dashboards = () => {
  const project = useAtomValue(activeProjectAtom)
  const dashboards = useAtomValue(dashboardListAtom)
  const loading = useAtomValue(dashboardListLoadingAtom)
  const error = useAtomValue(dashboardListErrorAtom)
  const fetchDashboards = useSetAtom(fetchDashboardsAtom)
  const createDashboard = useSetAtom(createDashboardAtom)
  const deleteDashboard = useSetAtom(deleteDashboardAtom)
  const setPendingEditId = useSetAtom(pendingEditDashboardIdAtom)
  const navigate = useProjectNavigate()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (project) fetchDashboards()
  }, [fetchDashboards, project])

  const filteredDashboards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return dashboards
    return dashboards.filter(dashboard =>
      `${dashboard.displayName} ${dashboard.description}`.toLowerCase().includes(normalizedQuery),
    )
  }, [dashboards, query])

  const handleCreateDashboard = async () => {
    setCreating(true)
    try {
      const dashboard = await createDashboard({ displayName: UNTITLED_DASHBOARD_NAME, description: '' })
      if (dashboard) navigate(`/dashboards/${dashboard.id}`)
    } catch (err) {
      toastRPCError(err, 'Failed to create dashboard')
    } finally {
      setCreating(false)
    }
  }

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteDashboard(id)
      setPendingDeleteId(null)
    } catch (err) {
      toastRPCError(err, 'Failed to delete dashboard')
    } finally {
      setDeletingId(null)
    }
  }

  if (!project) return <NoProject title="Dashboards" icon={PanelsTopLeft} />

  // Pick which state the body should render: spinner, an error/empty placeholder, or the list.
  const renderBody = () => {
    if (loading && dashboards.length === 0) return <LoadingSpinner />

    if (error) {
      return (
        <DashboardsPlaceholder
          icon={PanelsTopLeft}
          title={error}
          action={
            <Button variant="outline" size="sm" onClick={() => fetchDashboards()}>
              Retry
            </Button>
          }
        />
      )
    }

    if (dashboards.length === 0) {
      return (
        <DashboardsPlaceholder
          icon={PanelsTopLeft}
          title="No dashboards yet"
          action={
            <Can action="create" resource="dashboard">
              <NewDashboardButton creating={creating} onClick={handleCreateDashboard} />
            </Can>
          }
        />
      )
    }

    if (filteredDashboards.length === 0) {
      return <DashboardsPlaceholder icon={Search} title="No dashboards found" />
    }

    return (
      <div className="divide-y divide-border/60 border-y border-border/60">
        {filteredDashboards.map(dashboard => (
          <DashboardListRow
            key={dashboard.id}
            dashboard={dashboard}
            pendingDelete={pendingDeleteId === dashboard.id}
            deleting={deletingId === dashboard.id}
            onRequestDelete={() => setPendingDeleteId(dashboard.id)}
            onCancelDelete={() => setPendingDeleteId(null)}
            onConfirmDelete={() => handleConfirmDelete(dashboard.id)}
            onOpenEmpty={() => setPendingEditId(dashboard.id)}
          />
        ))}
      </div>
    )
  }

  return (
    <Page
      title="Dashboards"
      description="Track the metrics and notes your team checks repeatedly"
      actions={
        <Can action="create" resource="dashboard">
          <NewDashboardButton creating={creating} onClick={handleCreateDashboard} />
        </Can>
      }
    >
      <div className="space-y-4">
        {dashboards.length > 0 ? (
          <div className="relative max-w-sm">
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search dashboards"
              className="pl-8"
            />
          </div>
        ) : null}

        {renderBody()}
      </div>
    </Page>
  )
}

export default Dashboards
