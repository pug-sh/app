import type { GetFilterSchemaResponse } from '@/api/genproto/shared/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { useAtomValue } from 'jotai'
import { useEffect, useMemo, useState } from 'react'

const schemaCache = new Map<string, GetFilterSchemaResponse>()
const inFlight = new Map<string, Promise<GetFilterSchemaResponse>>()

const fetchSchemaForKind = (
  kind: string,
  rpc: {
    getFilterSchema: (
      req: { eventKind: string },
      options?: { headers?: HeadersInit }
    ) => Promise<GetFilterSchemaResponse>
  },
  headers: HeadersInit | undefined
) => {
  const cached = schemaCache.get(kind)
  if (cached) return Promise.resolve(cached)

  const running = inFlight.get(kind)
  if (running) return running

  const request = (async () => {
    try {
      const resp = await rpc.getFilterSchema({ eventKind: kind }, { headers })
      schemaCache.set(kind, resp)
      return resp
    } finally {
      inFlight.delete(kind)
    }
  })()
  inFlight.set(kind, request)
  return request
}

const intersectByName = <T extends { name: string }>(lists: T[][]): T[] => {
  if (lists.length === 0) return []
  if (lists.length === 1) return lists[0]

  const presentInAll = new Set(lists[0].map(x => x.name))
  for (let i = 1; i < lists.length; i++) {
    const current = new Set(lists[i].map(x => x.name))
    for (const name of [...presentInAll]) {
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
      try {
        const schemas = await Promise.all(kinds.map(kind => fetchSchemaForKind(kind, insightsRPC, headers)))
        if (!cancelled) {
          setResult({ key: kindsKey, schemas, error: null })
        }
      } catch (err) {
        if (!cancelled) {
          console.error('fetch common global filter schema failed:', err)
          setResult({
            key: kindsKey,
            schemas: null,
            error: err instanceof Error ? err.message : 'Failed to load filter schema',
          })
        }
      }
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
