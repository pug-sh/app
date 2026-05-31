import { create } from '@bufbuild/protobuf'
import { z } from 'zod'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import {
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

export const USER_FLOW_GROUP_BY_OPTIONS = [
  { label: 'Session', value: UserFlowQuery_GroupBy.SESSION },
  { label: 'User', value: UserFlowQuery_GroupBy.USER },
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
  groupBy: query?.groupBy === UserFlowQuery_GroupBy.USER ? UserFlowQuery_GroupBy.USER : UserFlowQuery_GroupBy.SESSION,
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

export type SankeyChartData = {
  nodes: { name: string; color: string }[]
  links: { source: number; target: number; value: number; sourceName: string; targetName: string }[]
}

type SankeyLink = SankeyChartData['links'][number]

// Recharts Sankey layout recurses through target nodes to assign depth and crashes on cycles
// (common in user flows: page_view → click → page_view). Keep highest-value forward links first.
const breakCyclesForSankey = (links: SankeyLink[]) => {
  const adj = new Map<number, number[]>()
  const kept: SankeyLink[] = []

  const canReach = (from: number, to: number) => {
    const visited = new Set<number>()
    const stack = [from]
    while (stack.length) {
      const node = stack.pop()
      if (node === undefined) continue
      if (node === to) return true
      if (visited.has(node)) continue
      visited.add(node)
      for (const next of adj.get(node) ?? []) stack.push(next)
    }
    return false
  }

  for (const link of [...links].sort((a, b) => b.value - a.value)) {
    if (link.source === link.target) continue
    if (canReach(link.target, link.source)) continue
    kept.push(link)
    const outgoing = adj.get(link.source)
    if (outgoing) outgoing.push(link.target)
    else adj.set(link.source, [link.target])
  }

  return kept
}

export const buildSankeyData = (result: UserFlowResult): SankeyChartData => {
  const nodeIndex = new Map<string, number>()
  const nodes = result.nodes.map((node, index) => {
    nodeIndex.set(node.id, index)
    return { name: node.label || node.id, color: '' }
  })

  const rawLinks = result.links.flatMap(link => {
    const source = nodeIndex.get(link.source)
    const target = nodeIndex.get(link.target)
    if (source === undefined || target === undefined) return []
    const value = Number(link.value)
    if (!Number.isFinite(value) || value <= 0) return []
    return [
      {
        source,
        target,
        value,
        sourceName: result.nodes[source]?.label || link.source,
        targetName: result.nodes[target]?.label || link.target,
      },
    ]
  })

  const links = breakCyclesForSankey(rawLinks)
  return { nodes, links }
}
