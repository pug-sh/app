import type { GetFilterSchemaResponse } from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { useAtomValue } from 'jotai'
import { useEffect, useMemo, useState } from 'react'

const schemaCache = new Map<string, GetFilterSchemaResponse>()
const inFlight = new Map<string, Promise<GetFilterSchemaResponse>>()

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
  if (cached) return Promise.resolve(cached)

  const running = inFlight.get(key)
  if (running) return running

  const request = (async () => {
    try {
      const resp = await rpc.getFilterSchema({ eventKind: kind }, { headers })
      schemaCache.set(key, resp)
      return resp
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
  const [result, setResult] = useState<{
    key: string
    schemas: GetFilterSchemaResponse[] | null
    error: string | null
  }>({
    key: '',
    schemas: null,
    error: null,
  })

  const kindsKey = [...new Set(selectedEventKinds.map(k => k.trim()).filter(Boolean))].sort().join('\u0000')

  useEffect(() => {
    if (!headers) return
    const kinds = kindsKey ? kindsKey.split('\u0000') : []
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
      if (failures.length > 0) console.warn('Some filter schemas failed to load:', failures)
      setResult({
        key: kindsKey,
        schemas: schemas.length > 0 ? schemas : null,
        error: schemas.length === 0
          ? (failures[0] ?? 'Failed to load filter schema')
          : failures.length > 0
            ? 'Some filter schemas failed to load — filter properties may be incomplete'
            : null,
      })
    }
    void loadSchemas()
    return () => { cancelled = true }
  }, [kindsKey, insightsRPC, headers])

  const isCurrent = result.key === kindsKey
  const scopedSchemas = kindsKey ? (isCurrent ? result.schemas : null) : null
  const scopedError = kindsKey && isCurrent ? result.error : null
  const schema = useMemo(
    () => (scopedSchemas ? buildCommonSchema(baseSchema, scopedSchemas) : baseSchema),
    [baseSchema, scopedSchemas]
  )

  const schemaError = scopedError ?? baseSchemaError
  return { schema, schemaError }
}
