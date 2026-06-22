import { create } from '@bufbuild/protobuf'
import { z } from 'zod'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import {
  type UserFlowNode,
  UserFlowQuery_GroupBy,
  UserFlowQuery_NodeKind,
  UserFlowQuerySchema,
  type UserFlowResult,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { fromProtoFilter, toProtoFilters } from '@/components/event-filters/filter-proto'

export type UserFlowScope = {
  kind: string
  filters: ActiveFilter[]
}

export type UserFlowConfig = {
  nodeKind: UserFlowQuery_NodeKind
  nodeProperty: string
  groupBy: UserFlowQuery_GroupBy
  scope: UserFlowScope
}

export const DEFAULT_USER_FLOW_SCOPE: UserFlowScope = { kind: '', filters: [] }

export const DEFAULT_USER_FLOW_CONFIG: UserFlowConfig = {
  nodeKind: UserFlowQuery_NodeKind.EVENT_KIND,
  nodeProperty: '',
  groupBy: UserFlowQuery_GroupBy.SESSION,
  scope: DEFAULT_USER_FLOW_SCOPE,
}

export const USER_FLOW_NODE_KIND_OPTIONS = [
  { label: 'Event kind', value: UserFlowQuery_NodeKind.EVENT_KIND },
  { label: 'Property', value: UserFlowQuery_NodeKind.PROPERTY },
] as const

const activeFilterSchema = z.custom<ActiveFilter>(
  value =>
    !!value &&
    typeof value === 'object' &&
    'kind' in value &&
    'property' in value &&
    typeof (value as ActiveFilter).property === 'string',
)

const userFlowScopeSchema = z.object({
  kind: z.string(),
  filters: z.array(activeFilterSchema),
})

export const userFlowConfigSchema = z
  .object({
    nodeKind: z.nativeEnum(UserFlowQuery_NodeKind),
    nodeProperty: z.string(),
    groupBy: z.nativeEnum(UserFlowQuery_GroupBy),
    scope: userFlowScopeSchema,
  })
  .superRefine((config, ctx) => {
    if (config.nodeKind === UserFlowQuery_NodeKind.PROPERTY && !config.nodeProperty.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a property for property-based nodes',
        path: ['nodeProperty'],
      })
    }
  })

export const parseUserFlowConfig = (query?: {
  nodeKind?: UserFlowQuery_NodeKind
  nodeProperty?: string
  groupBy?: UserFlowQuery_GroupBy
  scope?: { kind?: string; filters?: Parameters<typeof fromProtoFilter>[0][] }
}): UserFlowConfig => ({
  nodeKind:
    query?.nodeKind === UserFlowQuery_NodeKind.PROPERTY
      ? UserFlowQuery_NodeKind.PROPERTY
      : UserFlowQuery_NodeKind.EVENT_KIND,
  nodeProperty: query?.nodeProperty ?? '',
  groupBy: UserFlowQuery_GroupBy.SESSION,
  scope: {
    kind: query?.scope?.kind?.trim() ?? '',
    filters: (query?.scope?.filters ?? []).map(fromProtoFilter),
  },
})

export const serializeUserFlowConfig = (config: UserFlowConfig) => ({
  nodeKind: config.nodeKind,
  nodeProperty: config.nodeProperty,
  groupBy: config.groupBy,
  scope: config.scope,
})

export const parseSerializedUserFlowConfig = (value: unknown): UserFlowConfig | null => {
  const parsed = userFlowConfigSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export const isUserFlowConfigValid = (config: UserFlowConfig) => userFlowConfigSchema.safeParse(config).success

export const buildUserFlowQuery = (config: UserFlowConfig) => {
  const scopeKind = config.scope.kind.trim()
  return create(UserFlowQuerySchema, {
    nodeKind: config.nodeKind,
    nodeProperty: config.nodeKind === UserFlowQuery_NodeKind.PROPERTY ? config.nodeProperty : '',
    groupBy: config.groupBy,
    scope: scopeKind
      ? create(EventFilterSchema, {
          kind: scopeKind,
          filters: toProtoFilters(config.scope.filters),
        })
      : undefined,
    maxHops: 0,
    maxNodes: 0,
    maxLinks: 0,
  })
}

// A node carries stepDepth (the 0-based Sankey column from the server) so the
// chart pins columns to actual flow steps instead of recomputing them from the
// graph. The server emits a layered DAG (every edge spans depth d → d+1), so no
// cycle-breaking is needed — the same event at two steps is two distinct nodes.
export type SankeyNodeDatum = {
  id: string
  name: string
  stepDepth: number
  isOthers: boolean
}

export type SankeyLinkDatum = {
  source: number
  target: number
  value: number
  sourceName: string
  targetName: string
}

export type SankeyChartData = {
  nodes: SankeyNodeDatum[]
  links: SankeyLinkDatum[]
}

// The overflow bucket is identified by is_others (never by id/label string).
const nodeLabel = (node: UserFlowNode) => (node.isOthers ? 'Others' : node.label || node.id)

// recharts' Sankey assigns node depth by recursing through every target with no
// cycle detection, so one back-edge triggers infinite recursion ("too much
// recursion"). The step-indexed server response is a strict DAG (every edge goes
// depth d → d+1), so this keeps every link — a no-op on correct data. It remains
// as a defensive guard against a stale/pre-migration server still emitting the
// old page-collapsed, cyclic graph, so the chart degrades instead of crashing.
const guardAcyclic = (links: SankeyLinkDatum[]): SankeyLinkDatum[] => {
  const adj = new Map<number, number[]>()
  const canReach = (from: number, to: number) => {
    const seen = new Set<number>()
    const stack = [from]
    while (stack.length) {
      const n = stack.pop()
      if (n === undefined) continue
      if (n === to) return true
      if (seen.has(n)) continue
      seen.add(n)
      for (const next of adj.get(n) ?? []) stack.push(next)
    }
    return false
  }
  const kept: SankeyLinkDatum[] = []
  for (const link of [...links].sort((a, b) => b.value - a.value)) {
    if (link.source === link.target) continue
    if (canReach(link.target, link.source)) continue
    kept.push(link)
    const out = adj.get(link.source)
    if (out) out.push(link.target)
    else adj.set(link.source, [link.target])
  }
  return kept
}

export const buildSankeyData = (result: UserFlowResult): SankeyChartData => {
  const nodeIndex = new Map<string, number>()
  const nodes = result.nodes.map((node, index) => {
    nodeIndex.set(node.id, index)
    return { id: node.id, name: nodeLabel(node), stepDepth: node.depth, isOthers: node.isOthers }
  })

  const links = result.links.flatMap(link => {
    const source = nodeIndex.get(link.source)
    const target = nodeIndex.get(link.target)
    if (source === undefined || target === undefined) return []
    const value = Number(link.value)
    if (!Number.isFinite(value) || value <= 0) return []
    return [{ source, target, value, sourceName: nodes[source].name, targetName: nodes[target].name }]
  })

  return { nodes, links: guardAcyclic(links) }
}
