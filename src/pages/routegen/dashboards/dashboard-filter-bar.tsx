import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { insightsRPCAtom } from '@/api/rpc'
import { FilterBuilder } from '@/components/event-filters/filter-builder'
import { FilterChip } from '@/components/event-filters/filter-chip'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { fetchSchemaForKind } from '@/hooks/use-global-filter-schema'
import { commonDashboardSchema, dashboardEventKinds } from './dashboard-filters'

export const DashboardFilterBar = ({
  tiles,
  filters,
  onChange,
}: {
  tiles: DashboardTile[]
  filters: readonly ActiveFilter[]
  onChange: (filters: ActiveFilter[]) => void
}) => {
  const rpc = useAtomValue(insightsRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const [attempt, setAttempt] = useState(0)
  const kindsKey = JSON.stringify(dashboardEventKinds(tiles))
  const projectId = headers?.['x-project-id'] ?? ''
  const key = JSON.stringify([projectId, kindsKey, attempt])
  const [result, setResult] = useState<{ key: string; schema: GetFilterSchemaResponse | null } | null>(null)

  useEffect(() => {
    if (!headers) return
    let cancelled = false
    const fetchKind = (kind: string) =>
      fetchSchemaForKind(kind, rpc, headers, { force: attempt > 0 }).catch(err => {
        console.error(`Filter schema failed for event kind "${kind}":`, err)
        throw err
      })
    // A partial intersection could offer properties unavailable to a failed event kind.
    void Promise.all(['', ...(JSON.parse(kindsKey) as string[])].map(fetchKind)).then(
      ([base, ...schemas]) => {
        if (!cancelled) setResult({ key, schema: commonDashboardSchema(base, schemas) })
      },
      () => {
        if (!cancelled) setResult({ key, schema: null })
      },
    )
    return () => {
      cancelled = true
    }
  }, [rpc, headers, kindsKey, key, attempt])

  const current = result?.key === key ? result : null
  let picker = <span className="text-xs text-muted-foreground">Loading filters…</span>
  if (current?.schema) {
    picker = (
      <FilterBuilder schema={current.schema} schemaError={null} onAdd={filter => onChange([...filters, filter])} />
    )
  } else if (current) {
    picker = (
      <button type="button" className="text-xs text-negative" onClick={() => setAttempt(value => value + 1)}>
        Could not load filters. Retry
      </button>
    )
  }

  return (
    <div className="-mt-4 mb-10 flex min-h-7 flex-wrap items-center gap-2" role="group" aria-label="Dashboard filters">
      {filters.map((filter, index) => (
        <FilterChip
          key={`${filter.source}:${filter.property}:${index}`}
          filter={filter}
          onUpdate={next => onChange(filters.map((value, i) => (i === index ? next : value)))}
          onRemove={() => onChange(filters.filter((_, i) => i !== index))}
        />
      ))}
      {picker}
      {filters.length > 0 ? (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onChange([])}
        >
          Clear all
        </button>
      ) : null}
    </div>
  )
}
