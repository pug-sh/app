import { create } from '@bufbuild/protobuf'
import { z } from 'zod'
import { EventFilterSchema, type PropertyFilter } from '@/api/genproto/common/v1/filters_pb'
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

// Mirrors the spec-level CEL rule `insight_query_spec.user_flow_property_required`, which pairs
// `node_property.size() > 0` with this pattern. Deliberately NOT the field-level constraint on
// UserFlowQuery.node_property — that one ends in `*`, so it also admits the empty string an
// event-kind flow sends, and copying it here would let an unsendable spec reach the wire.
const NODE_PROPERTY_PATTERN = /^\$?[a-zA-Z0-9_.-]+$/

// Why this config can't run yet, or null when it can. One source of truth for the query gate
// (`isUserFlowConfigValid`), the dashboard replay path (`userFlowSpecIncompleteReason`) and the
// message the user reads — so a flow can never be blocked without the UI being able to say why.
// This is the shape topKIncompleteReason established; user flow previously returned a bare
// boolean, so a tile that couldn't run fell through to "adjust the query above" on a dashboard
// that has no query above.
export const userFlowIncompleteReason = (config: UserFlowConfig): string | null => {
  if (config.nodeKind !== UserFlowQuery_NodeKind.PROPERTY) return null
  const property = config.nodeProperty.trim()
  if (!property) return 'Select a property to group the flow by'
  if (!NODE_PROPERTY_PATTERN.test(property)) {
    return 'Property names may only contain letters, numbers, dot, dash and underscore'
  }
  return null
}

// Both entry points below funnel nodeKind through this, so a stored spec and a shared URL can't
// disagree about what an out-of-range value means.
const normalizeNodeKind = (kind: UserFlowQuery_NodeKind | undefined) =>
  kind === UserFlowQuery_NodeKind.PROPERTY ? UserFlowQuery_NodeKind.PROPERTY : UserFlowQuery_NodeKind.EVENT_KIND

// A stored spec's user-flow query, as it arrives from the proto: every field optional, and scope
// filters still in wire form.
type UserFlowQueryInit = {
  nodeKind?: UserFlowQuery_NodeKind
  nodeProperty?: string
  groupBy?: UserFlowQuery_GroupBy
  scope?: { kind?: string; filters?: PropertyFilter[] }
}

// groupBy is pinned to SESSION at both parse boundaries rather than read from the input: GroupBy
// has only UNSPECIFIED and SESSION today, and everything downstream — the "sessions" unit label,
// the node summaries — assumes sessions, while UNSPECIFIED would let the server pick. Note the pin
// lives in the two parsers, not in a helper: buildUserFlowQuery and serializeUserFlowConfig both
// pass config.groupBy through verbatim, so a config built by some future path that skips both
// parsers would not be covered. Add a real GroupBy member and this needs revisiting.
export const parseUserFlowConfig = (query?: UserFlowQueryInit): UserFlowConfig => ({
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
export const userFlowSpecIncompleteReason = (spec?: { userFlow?: UserFlowQueryInit }) => {
  if (!spec?.userFlow) return 'Configure the flow to start'
  return userFlowIncompleteReason(parseUserFlowConfig(spec.userFlow))
}

export const buildUserFlowQuery = (config: UserFlowConfig) => {
  const scopeKind = config.scope.kind.trim()
  return create(UserFlowQuerySchema, {
    nodeKind: config.nodeKind,
    // Trimmed for the same reason scope.kind is: userFlowIncompleteReason trims before testing
    // NODE_PROPERTY_PATTERN, so a padded name is judged runnable here and then rejected by the CEL
    // rule that pattern mirrors. Sending it verbatim is the one way this local gate can pass and
    // the wire still fail.
    nodeProperty: config.nodeKind === UserFlowQuery_NodeKind.PROPERTY ? config.nodeProperty.trim() : '',
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

// source/target are *indices into the sibling nodes array*, not ids — the layout reads them
// positionally on every pass, and `noUncheckedIndexedAccess` is off, so the type asserts the
// invariant rather than merely failing to express it. buildSankeyData is the only producer that
// establishes it (both endpoints resolved through nodeIndex before the datum is built) and it also
// guarantees `nodes[target].stepDepth === nodes[source].stepDepth + 1`. Hand-construct at your
// peril: an out-of-range index does not throw, it silently drops the ribbon in layoutSankey's
// final flatMap and leaves the flow accounting wrong.
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

// What `buildSankeyData` produces: the drawable graph, plus how much of the response it could not
// represent. Both counts have to travel with the data rather than only reaching a log, because the
// flow accounting downstream is derived from the survivors alone and stays internally consistent
// while understating — there is nothing in the rendered chart for a reader to be suspicious of.
export type SankeyGraph = SankeyChartData & {
  droppedLinks: number
  collapsedNodes: number
}

// Why this graph cannot be trusted in full, or null when it can. The chart renders it as a caption
// so the numbers are never read as exact.
export const sankeyIncompleteReason = ({ droppedLinks, collapsedNodes }: SankeyGraph) => {
  const parts = []
  if (droppedLinks > 0) {
    parts.push(`${droppedLinks} ${droppedLinks === 1 ? 'transition' : 'transitions'} could not be drawn`)
  }
  if (collapsedNodes > 0) {
    parts.push(`${collapsedNodes} duplicate ${collapsedNodes === 1 ? 'step was' : 'steps were'} merged`)
  }
  if (parts.length === 0) return null
  return `${parts.join(' and ')} — flow totals may be incomplete`
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

export const buildSankeyData = (result: UserFlowResult): SankeyGraph => {
  const nodeIndex = new Map<string, number>()
  let collapsedNodes = 0
  const nodes = result.nodes.map((node, index) => {
    // Ids are contracted unique per (depth, label), so a duplicate is a server bug — and the only
    // one that misattributes rather than omits. The map is last-wins, so two steps collapse into
    // one and every link that named the first is silently re-pointed at the second, drawing a real
    // ribbon into a differently-labelled node. It costs no dropped link, so counting drops alone
    // reports a clean graph.
    if (nodeIndex.has(node.id)) collapsedNodes++
    nodeIndex.set(node.id, index)
    return { id: node.id, name: nodeLabel(node), stepDepth: node.depth, isOthers: node.isOthers }
  })

  let droppedLinks = 0
  const links = result.links.flatMap(link => {
    const source = nodeIndex.get(link.source)
    const target = nodeIndex.get(link.target)
    if (source === undefined || target === undefined) {
      droppedLinks++
      return []
    }
    const value = Number(link.value)
    if (!Number.isFinite(value) || value <= 0) {
      droppedLinks++
      return []
    }
    const datum = { source, target, value, sourceName: nodes[source].name, targetName: nodes[target].name }
    if (!spansOneStep(nodes, datum)) {
      droppedLinks++
      return []
    }
    return [datum]
  })

  // Losing either of these is not cosmetic: the node summaries derive "continued" and "ended" by
  // subtracting outbound flow from inbound, over exactly these survivors. Quietly dropping a link
  // overstates the drop-off at its source, and the chart stays internally consistent while doing
  // it. The console line is a breadcrumb for whoever chases the mismatch; the counts on the return
  // are what let the UI tell the person reading the chart, which is the part that matters.
  if (droppedLinks > 0 || collapsedNodes > 0) {
    console.warn(
      `user flow: dropped ${droppedLinks} of ${result.links.length} links, ${collapsedNodes} duplicate node ids`,
    )
  }

  return { nodes, links, droppedLinks, collapsedNodes }
}
