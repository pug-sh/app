import type { GetFilterSchemaResponse } from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { useAtomValue } from 'jotai'
import { useEffect, useMemo, useState } from 'react'

const CACHE_TTL = 300_000 // 5 minutes
const FAILURE_TTL = 30_000 // 30 seconds
const schemaCache = new Map<string, { data: GetFilterSchemaResponse; ts: number }>()
const failureCache = new Map<string, number>()
const inFlight = new Map<string, Promise<GetFilterSchemaResponse>>()

export const clearSchemaCache = () => {
  schemaCache.clear()
  inFlight.clear()
  failureCache.clear()
}

const cacheKey = (kind: string, headers: HeadersInit | undefined) => {
  const projectId = headers && typeof headers === 'object' && !Array.isArray(headers)
    ? (headers as Record<string, string>)['x-project-id'] ?? ''
    : ''
  return `${projectId}\0${kind}`
}

export const fetchSchemaForKind = (
  kind: string,
  rpc: {
    getFilterSchema: (
      req: { eventKind: string },
      options?: { headers?: HeadersInit }
    ) => Promise<GetFilterSchemaResponse>
  },
  headers: HeadersInit | undefined
) => {
  const key = cacheKey(kind, headers)
  const cached = schemaCache.get(key)
  if (cached) {
    if (Date.now() - cached.ts > CACHE_TTL) {
      schemaCache.delete(key)
    } else {
      return Promise.resolve(cached.data)
    }
  }

  const failedAt = failureCache.get(key)
  if (failedAt && Date.now() - failedAt < FAILURE_TTL) {
    return Promise.reject(new Error('Schema fetch recently failed'))
  }

  const running = inFlight.get(key)
  if (running) return running

  const request = (async () => {
    try {
      const resp = await rpc.getFilterSchema({ eventKind: kind }, { headers })
      schemaCache.set(key, { data: resp, ts: Date.now() })
      failureCache.delete(key)
      return resp
    } catch (err) {
      failureCache.set(key, Date.now())
      throw err
    } finally {
      inFlight.delete(key)
    }
  })()
  inFlight.set(key, request)
  return request
}

const intersectByName = <T extends { name: string }>(lists: T[][]): T[] => {
  if (lists.length === 0) return []
  if (lists.length === 1) return lists[0]

  const presentInAll = new Set(lists[0].map(x => x.name))
  for (let i = 1; i < lists.length; i++) {
    const current = new Set(lists[i].map(x => x.name))
    for (const name of presentInAll) {
      if (!current.has(name)) presentInAll.delete(name)
    }
  }

  return lists[0].filter(x => presentInAll.has(x.name))
}

const buildCommonSchema = (
  baseSchema: GetFilterSchemaResponse | null,
  scoped: GetFilterSchemaResponse[]
): GetFilterSchemaResponse | null => {
  if (scoped.length === 0) return baseSchema
  const first = scoped[0]
  return {
    ...first,
    autoPropertyKeys: intersectByName(scoped.map(s => s.autoPropertyKeys)),
    customPropertyKeys: intersectByName(scoped.map(s => s.customPropertyKeys)),
    profilePropertyKeys: baseSchema?.profilePropertyKeys ?? first.profilePropertyKeys,
  }
}

export const useGlobalFilterSchema = ({
  baseSchema,
  baseSchemaError,
  selectedEventKinds,
}: {
  baseSchema: GetFilterSchemaResponse | null
  baseSchemaError: string | null
  selectedEventKinds: string[]
}) => {
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)

  const projectId = headers && typeof headers === 'object' && !Array.isArray(headers)
    ? (headers as Record<string, string>)['x-project-id'] ?? ''
    : ''

  useEffect(() => {
    clearSchemaCache()
  }, [projectId])

  const [result, setResult] = useState<{
    key: string
    schemas: GetFilterSchemaResponse[] | null
    error: string | null
  }>({
    key: '',
    schemas: null,
    error: null,
  })

  const kindsKey = useMemo(() => {
    const sorted = [...new Set(selectedEventKinds.map(k => k.trim()).filter(Boolean))].sort()
    return JSON.stringify(sorted)
  }, [selectedEventKinds])

  useEffect(() => {
    if (!headers) return
    const kinds = JSON.parse(kindsKey) as string[]
    if (kinds.length === 0) return

    let cancelled = false
    const loadSchemas = async () => {
      const results = await Promise.allSettled(kinds.map(kind => fetchSchemaForKind(kind, insightsRPC, headers)))
      if (cancelled) return
      const schemas: GetFilterSchemaResponse[] = []
      const failures: string[] = []
      for (const r of results) {
        if (r.status === 'fulfilled') schemas.push(r.value)
        else failures.push(r.reason instanceof Error ? r.reason.message : 'Unknown error')
      }
      const failedKinds = kinds.filter((_, i) => results[i].status === 'rejected')
      if (failedKinds.length > 0) console.warn('Filter schemas failed for:', failedKinds, failures)
      let error: string | null = null
      if (schemas.length === 0) {
        error = `Failed to load filter schema for ${failedKinds.join(', ')}`
      } else if (failedKinds.length > 0) {
        error = `Filter schemas failed for: ${failedKinds.join(', ')} — filter properties may be incomplete`
      }
      setResult({
        key: kindsKey,
        schemas: schemas.length > 0 ? schemas : null,
        error,
      })
    }
    void loadSchemas()
    return () => { cancelled = true }
  }, [kindsKey, insightsRPC, headers])

  const hasKinds = kindsKey !== '[]'
  const isCurrent = result.key === kindsKey
  const scopedSchemas = hasKinds && isCurrent ? result.schemas : null
  const scopedError = hasKinds && isCurrent ? result.error : null
  const schema = useMemo(
    () => (scopedSchemas ? buildCommonSchema(baseSchema, scopedSchemas) : baseSchema),
    [baseSchema, scopedSchemas]
  )

  const schemaError = scopedError ?? baseSchemaError
  return { schema, schemaError }
}
