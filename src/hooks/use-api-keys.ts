import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiKey } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { projectsRPCAtom } from '@/api/rpc'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'

const NO_KEYS: ApiKey[] = []

type Result = { keys: ApiKey[]; error: string | null }

// The active project's API keys. Both the settings page and the overview setup screen list them,
// so the fetch lives here rather than being duplicated per page. Held in local state rather than
// the shared workspace atoms — nothing outside those two views needs them, and ListApiKeys returns
// no secret: a public key comes back in full, a private key only as its mask.
//
// Nothing here tracks which project a result was for: the router remounts the page on a project
// switch (see ProjectSync), so a fresh mount starts from `result: null`.
export const useApiKeys = () => {
  const projectsRPC = useAtomValue(projectsRPCAtom)
  const projectHeaders = useAtomValue(projectHeaderAtom)

  const [result, setResult] = useState<Result | null>(null)
  const [fetching, setFetching] = useState(false)

  // reload is handed to the callers and fired from create, revoke, and their Retry buttons on top
  // of the mount effect, so two requests are easily in flight at once. Last-writer-wins would let a
  // superseded one land, and the overview interpolates the public key into a copy-paste SDK
  // snippet — so a stale winner is a snippet built from the wrong key.
  const latestRequestRef = useRef(0)

  const reload = useCallback(async () => {
    // No project resolved yet — a hard refresh on a project-scoped page beats the workspace
    // bootstrap. Nothing to fetch for; `result` stays null so callers hold their spinner rather
    // than reporting an empty list. projectHeaderAtom gains the id and this re-runs.
    if (!projectHeaders) return
    const requestId = ++latestRequestRef.current
    setFetching(true)
    try {
      const resp = await projectsRPC.listApiKeys({}, { headers: projectHeaders })
      if (requestId !== latestRequestRef.current) return
      setResult({ keys: resp.apiKeys, error: null })
    } catch (err) {
      if (requestId !== latestRequestRef.current) return
      const fallback = 'Failed to load API keys'
      setResult({ keys: [], error: fallback })
      toastRPCError(err, fallback)
    } finally {
      if (requestId === latestRequestRef.current) setFetching(false)
    }
  }, [projectsRPC, projectHeaders])

  useEffect(() => {
    reload()
  }, [reload])

  // `loading` is "no list yet", not "a request is in flight" — reload() is also fired after create
  // and revoke, and ORing the two would collapse the caller's whole table into a spinner on every
  // mutation. `refreshing` carries the in-flight half for callers that want it.
  return {
    keys: result?.keys ?? NO_KEYS,
    loading: !result,
    refreshing: fetching,
    error: result?.error ?? null,
    reload,
  }
}
