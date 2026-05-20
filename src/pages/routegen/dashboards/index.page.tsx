import type { Timestamp } from '@bufbuild/protobuf/wkt'
import { useAtomValue, useSetAtom } from 'jotai'
import { LayoutGrid, Loader2, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import ProjectLink from '@/components/project-link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { useProjectNavigate } from '@/lib/project-path'
import { toastRPCError } from '@/lib/rpc-error'
import { tsToDate } from '@/lib/timestamp'
import { UNTITLED_DASHBOARD_NAME } from './constants'
import {
  createDashboardAtom,
  dashboardListAtom,
  dashboardListErrorAtom,
  dashboardListLoadingAtom,
  fetchDashboardsAtom,
} from './dashboard.atoms'

const formatDashboardTime = (ts: Timestamp | undefined) => {
  const date = tsToDate(ts)
  if (!date) return '-'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const Dashboards = () => {
  const project = useAtomValue(activeProjectAtom)
  const dashboards = useAtomValue(dashboardListAtom)
  const loading = useAtomValue(dashboardListLoadingAtom)
  const error = useAtomValue(dashboardListErrorAtom)
  const fetchDashboards = useSetAtom(fetchDashboardsAtom)
  const createDashboard = useSetAtom(createDashboardAtom)
  const navigate = useProjectNavigate()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

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
      const dashboard = await createDashboard({
        displayName: UNTITLED_DASHBOARD_NAME,
        description: '',
      })
      if (dashboard) navigate(`/dashboards/${dashboard.id}`)
    } catch (err) {
      toastRPCError(err, 'Failed to create dashboard')
    } finally {
      setCreating(false)
    }
  }

  if (!project) return <NoProject title="Dashboards" icon={LayoutGrid} />

  return (
    <Page
      title="Dashboards"
      description="Track the metrics and notes your team checks repeatedly"
      actions={
        <Button size="sm" onClick={handleCreateDashboard} disabled={creating}>
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          New dashboard
        </Button>
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

        {loading && dashboards.length === 0 ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <LayoutGrid className="mb-4 size-10 opacity-15" />
            <p className="mb-1 text-sm font-medium">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchDashboards()}>
              Retry
            </Button>
          </div>
        ) : dashboards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <LayoutGrid className="mb-4 size-10 opacity-15" />
            <p className="mb-4 text-sm font-medium">No dashboards yet</p>
            <Button size="sm" onClick={handleCreateDashboard} disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              New dashboard
            </Button>
          </div>
        ) : filteredDashboards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="mb-4 size-10 opacity-15" />
            <p className="text-sm font-medium">No dashboards found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <th className="py-2 pr-2 text-left font-medium">Name</th>
                <th className="py-2 pr-2 text-left font-medium">Tiles</th>
                <th className="py-2 pr-2 text-left font-medium">Updated</th>
                <th className="py-2 pr-2 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredDashboards.map(dashboard => (
                <tr key={dashboard.id} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                  <td className="py-2.5 pr-2">
                    <ProjectLink
                      href={`/dashboards/${dashboard.id}`}
                      className="text-sm font-medium text-primary hover:underline underline-offset-4"
                    >
                      {dashboard.displayName || UNTITLED_DASHBOARD_NAME}
                    </ProjectLink>
                    {dashboard.description ? (
                      <p className="mt-0.5 max-w-xl truncate text-xs text-muted-foreground">{dashboard.description}</p>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-2 text-xs text-muted-foreground">{dashboard.tiles.length}</td>
                  <td className="py-2.5 pr-2 text-xs text-muted-foreground">
                    {formatDashboardTime(dashboard.updateTime)}
                  </td>
                  <td className="py-2.5 pr-2 text-xs text-muted-foreground">
                    {formatDashboardTime(dashboard.createTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Page>
  )
}

export default Dashboards
