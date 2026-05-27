import { useAtomValue, useSetAtom } from 'jotai'
import { LayoutDashboard } from 'lucide-react'
import { useEffect } from 'react'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import { Button } from '@/components/ui/button'
import { activeProjectAtom } from '@/data/workspace.atoms'
import {
  fetchOverviewSchemaAtom,
  overviewSchemaAtom,
  overviewSchemaErrorAtom,
  overviewSchemaLoadingAtom,
} from './overview.atoms'
import SetupMode from './setup-mode'

const Overview = () => {
  const project = useAtomValue(activeProjectAtom)
  const schema = useAtomValue(overviewSchemaAtom)
  const loading = useAtomValue(overviewSchemaLoadingAtom)
  const error = useAtomValue(overviewSchemaErrorAtom)
  const fetchSchema = useSetAtom(fetchOverviewSchemaAtom)

  useEffect(() => {
    if (project) fetchSchema()
  }, [fetchSchema, project])

  if (!project) return <NoProject title="Overview" icon={LayoutDashboard} />

  const hasEvents = (schema?.events.length ?? 0) > 0

  return (
    <Page title="Overview" description={`Project: ${project.displayName}`}>
      {loading && !schema ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <LayoutDashboard className="mb-4 size-10 opacity-15" />
          <p className="mb-1 text-sm font-medium">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchSchema()}>
            Retry
          </Button>
        </div>
      ) : hasEvents ? (
        <div className="text-sm text-muted-foreground">Analytics mode (Task 6).</div>
      ) : (
        <SetupMode project={project} />
      )}
    </Page>
  )
}

export default Overview
