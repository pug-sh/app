import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useState } from 'react'
import type { Project } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { projectsRPCAtom } from '@/api/rpc'
import CopyableCode from '@/components/copyable-code'
import LoadingSpinner from '@/components/loading-spinner'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { projectHeaderAtom } from '@/data/workspace.atoms'

// The keys are fetched here, on demand, and held in local state — never in the shared workspace
// atoms. activeProjectAtom is seeded from BatchGet (the org's project list), which omits the
// secret private_api_key; ProjectsService.Get returns the full project including it. Fetching
// per-view keeps the private key out of global state and off every other page.
const ApiKeys = () => {
  const projectsRPC = useAtomValue(projectsRPCAtom)
  const projectHeaders = useAtomValue(projectHeaderAtom)

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    if (!projectHeaders) return
    setLoading(true)
    setError(false)
    try {
      const resp = await projectsRPC.get({}, { headers: projectHeaders })
      setProject(resp.project ?? null)
    } catch (err) {
      console.error('Failed to load API keys:', err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [projectsRPC, projectHeaders])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-8 max-w-2xl">
      <section>
        <SectionHeader title="API Keys" description="Project ID and public key for the Pug SDK" />
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">Couldn't load your API keys.</p>
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        ) : project ? (
          <table className="w-full max-w-xl">
            <tbody>
              <CopyableCode label="Project ID" value={project.id} />
              <CopyableCode label="Public Key" value={project.publicApiKey} />
              {/* Private key is intentionally not shown: the backend returns it only once, at
                  project creation (roToRPCMsg omits it from every read). Retrieving it later needs
                  a backend reveal/regenerate endpoint — deferred. */}
            </tbody>
          </table>
        ) : null}
      </section>
    </div>
  )
}

export default ApiKeys
