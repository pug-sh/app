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
import { type ActiveFilter, activeFilterSchema } from '@/components/event-filters/filter-model'
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

const userFlowScopeSchema = z.object({
  kind: z.string(),
  filters: z.array(activeFilterSchema),
})

// Restorable — the shape a stored spec or a shared URL must have to be read back at all. It
// deliberately does NOT require a property for property-nodes: "half configured" is a legal state
// the UI produces the moment you switch the node kind, and rejecting it here threw away the
// user's scope and filters on reload. Whether a config can *run* is a different question, below.
const userFlowConfigShape = z.object({
  nodeKind: z.nativeEnum(UserFlowQuery_NodeKind),
  nodeProperty: z.string(),
  groupBy: z.nativeEnum(UserFlowQuery_GroupBy),
  scope: userFlowScopeSchema,
})

// Mirrors the CEL constraint on UserFlowQuery.node_property.
const NODE_PROPERTY_PATTERN = /^\$?[a-zA-Z0-9_.-]+$/

// Why this config can't run yet, or null when it can. One source of truth for three consumers —
// the query gate, the schema below, and the message the user reads — so a flow can never be
// blocked without the UI being able to say why. This is the shape topKIncompleteReason
// established; user flow previously returned a bare boolean, so a tile that couldn't run fell
// through to "adjust the query above" on a dashboard that has no query above.
export const userFlowIncompleteReason = (config: UserFlowConfig): string | null => {
  if (config.nodeKind !== UserFlowQuery_NodeKind.PROPERTY) return null
  const property = config.nodeProperty.trim()
  if (!property) return 'Select a property to group the flow by'
  if (!NODE_PROPERTY_PATTERN.test(property)) {
    return 'Property names may only contain letters, numbers, dot, dash and underscore'
  }
  return null
}

// Runnable — the shape plus the constraints the backend enforces, so an incomplete config is
// caught here rather than coming back as a protovalidate error from the wire.
export const userFlowConfigSchema = userFlowConfigShape.superRefine((config, ctx) => {
  const reason = userFlowIncompleteReason(config)
  if (reason) ctx.addIssue({ code: z.ZodIssueCode.custom, message: reason, path: ['nodeProperty'] })
})

// Both entry points below funnel their enums through these, so a stored spec and a shared URL
// can't disagree about what an out-of-range value means. groupBy is pinned rather than read:
// GroupBy has only UNSPECIFIED and SESSION today, and everything downstream — the "sessions" unit
// label, the node summaries — assumes sessions. Sending UNSPECIFIED would let the server pick.
const normalizeNodeKind = (kind: UserFlowQuery_NodeKind | undefined) =>
  kind === UserFlowQuery_NodeKind.PROPERTY ? UserFlowQuery_NodeKind.PROPERTY : UserFlowQuery_NodeKind.EVENT_KIND

export const parseUserFlowConfig = (query?: {
  nodeKind?: UserFlowQuery_NodeKind
  nodeProperty?: string
  groupBy?: UserFlowQuery_GroupBy
  scope?: { kind?: string; filters?: Parameters<typeof fromProtoFilter>[0][] }
}): UserFlowConfig => ({
  nodeKind: normalizeNodeKind(query?.nodeKind),
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

// Restores as much as the value legitimately carries; null means genuinely unreadable, which is
// what the caller surfaces as a warning. An incomplete-but-well-formed config restores fine and
// is stopped later by isUserFlowConfigValid.
export const parseSerializedUserFlowConfig = (value: unknown): UserFlowConfig | null => {
  const parsed = userFlowConfigShape.safeParse(value)
  if (!parsed.success) return null
  return {
    ...parsed.data,
    nodeKind: normalizeNodeKind(parsed.data.nodeKind),
    groupBy: UserFlowQuery_GroupBy.SESSION,
    scope: { ...parsed.data.scope, kind: parsed.data.scope.kind.trim() },
  }
}

export const isUserFlowConfigValid = (config: UserFlowConfig) => userFlowIncompleteReason(config) === null

// The dashboard replay path, which holds a stored spec rather than editor state.
export const userFlowSpecIncompleteReason = (spec?: { userFlow?: Parameters<typeof parseUserFlowConfig>[0] }) => {
  if (!spec?.userFlow) return 'Configure the flow to start'
  return userFlowIncompleteReason(parseUserFlowConfig(spec.userFlow))
}

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

// A node carries stepDepth (the 0-based Sankey column from the server) so the chart pins columns
// to actual flow steps instead of recomputing them from the graph. The same event at two steps is
// two distinct nodes, which is why a repeat visit does not fold back into a cycle. Links that
// don't span exactly one step are dropped rather than drawn — see spansOneStep below.
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

// The layout draws every link left-to-right from its source column, so a link that does not
// advance exactly one step has no sensible geometry — it would run backwards across the columns
// or sit inside one. The server contract is that every edge spans depth d → d+1, so this drops
// nothing on a correct response; it exists so a response that breaks that contract degrades
// instead of rendering a graph that reads as real.
//
// This replaced a reachability walk that looked for cycles. Depth monotonicity is the stronger
// check (a cycle needs a non-advancing edge, so it cannot survive this) and it needs no traversal
// — and the walk had to sort by value to be deterministic, which quietly reordered the links it
// was documented as leaving alone.
const spansOneStep = (nodes: SankeyNodeDatum[], link: SankeyLinkDatum) =>
  nodes[link.target].stepDepth === nodes[link.source].stepDepth + 1

export const buildSankeyData = (result: UserFlowResult): SankeyChartData => {
  const nodeIndex = new Map<string, number>()
  const nodes = result.nodes.map((node, index) => {
    nodeIndex.set(node.id, index)
    return { id: node.id, name: nodeLabel(node), stepDepth: node.depth, isOthers: node.isOthers }
  })

  let dropped = 0
  const links = result.links.flatMap(link => {
    const source = nodeIndex.get(link.source)
    const target = nodeIndex.get(link.target)
    if (source === undefined || target === undefined) {
      dropped++
      return []
    }
    const value = Number(link.value)
    if (!Number.isFinite(value) || value <= 0) {
      dropped++
      return []
    }
    const datum = { source, target, value, sourceName: nodes[source].name, targetName: nodes[target].name }
    if (!spansOneStep(nodes, datum)) {
      dropped++
      return []
    }
    return [datum]
  })

  // Dropping a link is not cosmetic: the node summaries derive "continued" and "ended" by
  // subtracting outbound flow from inbound, over exactly these survivors. Quietly losing one
  // overstates the drop-off at its source, and the chart stays internally consistent while doing
  // it — so say something rather than let a wrong number be read as a fact.
  if (dropped > 0) {
    console.warn(`user flow: dropped ${dropped} of ${result.links.length} links; transition counts may understate`)
  }

  return { nodes, links }
}
