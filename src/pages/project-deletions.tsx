import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import type { DeletionOperation } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { projectsRPCAtom } from '@/api/rpc'
import { useCan } from '@/auth/can'
import Page from '@/components/layout/page'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { activeOrgAtom } from '@/data/workspace.atoms'

const ProjectDeletions = () => {
  const org = useAtomValue(activeOrgAtom)
  const rpc = useAtomValue(projectsRPCAtom)
  const can = useCan()
  const [operations, setOperations] = useState<DeletionOperation[]>([])
  const [nextPageToken, setNextPageToken] = useState('')
  const [pageToken, setPageToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!org || !can('delete', 'project')) return
    let cancelled = false
    rpc
      .listDeletions({ orgId: org.id, pageSize: 50, pageToken })
      .then(result => {
        if (!cancelled) {
          setOperations(result.operations)
          setNextPageToken(result.nextPageToken)
          setError('')
        }
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load deletion activity')
      })
    return () => {
      cancelled = true
    }
  }, [org, rpc, can, pageToken, revision])

  if (!org) return <p className="p-6 text-sm">Choose an organization to see its project deletion activity.</p>
  if (!can('delete', 'project')) return <p className="p-6 text-sm">Organization admin access is required.</p>

  return (
    <Page
      title="Project deletion activity"
      description={`${org.displayName} · ${org.id}`}
      actions={
        <Button render={<Link href="/" />} variant="outline" size="sm">
          Workspace
        </Button>
      }
    >
      <div className="max-w-4xl">
        <p className="text-sm text-muted-foreground">
          Requested projects stop accepting access and writes immediately. The purge removes their live data
          permanently; backups expire under the instance backup retention policy.
        </p>
        <div className="mt-8">
          <SectionHeader title="Deletion operations" count={operations.length} />
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          {operations.length === 0 && !error && <p className="text-sm text-muted-foreground">No project deletions.</p>}
          {operations.map(operation => (
            <div
              key={operation.id}
              className="-mx-2 flex flex-wrap items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <strong>{operation.projectName}</strong> · {operation.status}
                <p className="font-mono text-xs text-muted-foreground">
                  Project {operation.projectId} · operation {operation.id}
                </p>
                <p className="text-xs text-muted-foreground">
                  Requested {new Date(operation.requestedAt).toLocaleString()} by{' '}
                  {operation.actorEmail || operation.actorId} · ClickHouse{' '}
                  {operation.clickhouseDone ? 'purged' : 'pending'} · PostgreSQL{' '}
                  {operation.postgresDone ? 'purged' : 'pending'}
                </p>
                {operation.lastError && <p className="text-negative">{operation.lastError}</p>}
              </div>
              {operation.status === 'failed' && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    setError('')
                    try {
                      await rpc.retryDeletion({ orgId: org.id, operationId: operation.id })
                      setRevision(value => value + 1)
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : 'Could not retry deletion')
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Retry purge
                </Button>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            {pageToken && (
              <Button variant="outline" onClick={() => setPageToken('')}>
                First page
              </Button>
            )}
            {nextPageToken && (
              <Button variant="outline" onClick={() => setPageToken(nextPageToken)}>
                Next page
              </Button>
            )}
            <Button variant="outline" onClick={() => setRevision(value => value + 1)}>
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </Page>
  )
}

export default ProjectDeletions
