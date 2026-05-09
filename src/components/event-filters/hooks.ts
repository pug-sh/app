import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import type { GetFilterSchemaResponse, PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { fetchSchemaForKind } from '@/hooks/use-global-filter-schema'

export const useSuggestions = (propertyKey: string, source: PropertySource, eventKind?: string) => {
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const requestKey = propertyKey ? `${source}|${eventKind ?? ''}|${propertyKey}` : ''
  const [result, setResult] = useState<{ key: string; suggestions: string[]; error: boolean }>({
    key: '',
    suggestions: [],
    error: false,
  })

  useEffect(() => {
    if (!propertyKey) return

    let cancelled = false
    const loadSuggestions = async () => {
      try {
        const resp = await insightsRPC.getPropertyValues(
          { propertyKey, source, eventKind: eventKind ?? '' },
          { headers },
        )
        if (!cancelled) {
          setResult({ key: requestKey, suggestions: resp.values, error: false })
        }
      } catch (err) {
        if (!cancelled) {
          console.error('getPropertyValues failed:', err)
          setResult({ key: requestKey, suggestions: [], error: true })
        }
      }
    }
    void loadSuggestions()
    return () => {
      cancelled = true
    }
  }, [propertyKey, source, eventKind, insightsRPC, headers, requestKey])

  const loaded = !requestKey || result.key === requestKey
  const error = loaded ? result.error : false
  const suggestions = loaded ? result.suggestions : []
  return { suggestions, loaded, error }
}

export const useScopedSchema = (kindFilter?: string) => {
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const kind = kindFilter?.trim() ?? ''
  const [result, setResult] = useState<{ key: string; schema: GetFilterSchemaResponse | null; error: string | null }>({
    key: '',
    schema: null,
    error: null,
  })
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!kind || !headers) return

    let cancelled = false
    fetchSchemaForKind(kind, insightsRPC, headers, retryCount > 0 ? { force: true } : undefined)
      .then(resp => {
        if (!cancelled) setResult({ key: kind, schema: resp, error: null })
      })
      .catch(err => {
        if (cancelled) return
        console.error(`getFilterSchema("${kind}") failed:`, err)
        setResult({
          key: kind,
          schema: null,
          error: err instanceof Error ? err.message : 'Failed to load filter schema',
        })
      })
    return () => {
      cancelled = true
    }
  }, [kind, insightsRPC, headers, retryCount])

  const isCurrent = result.key === kind
  const schema = kind && isCurrent ? result.schema : null
  const schemaError = kind && isCurrent ? result.error : null
  return { schema, schemaError, retry: () => setRetryCount(c => c + 1) }
}
