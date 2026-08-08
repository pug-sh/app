import { create } from '@bufbuild/protobuf'
import { describe, expect, it, vi } from 'vitest'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import {
  UserFlowQuery_GroupBy,
  UserFlowQuery_NodeKind,
  UserFlowResultSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import {
  buildSankeyData,
  buildUserFlowQuery,
  DEFAULT_USER_FLOW_CONFIG,
  parseSerializedUserFlowConfig,
  sankeyIncompleteReason,
  serializeUserFlowConfig,
  type UserFlowConfig,
  userFlowIncompleteReason,
  userFlowSpecIncompleteReason,
} from './user-flow'

// depth is the server's step index, and every link is contracted to span d -> d+1.
const node = (id: string, depth: number, label = id, isOthers = false) => ({ id, depth, label, isOthers })
const link = (source: string, target: string, value: bigint) => ({ source, target, value })

const result = (nodes: ReturnType<typeof node>[], links: ReturnType<typeof link>[]) =>
  create(UserFlowResultSchema, { nodes, links })

// 100 sessions land on home; 40 go to search and 60 to pricing; 50 of the pricing sessions
// continue to checkout, so 10 end there.
const WHOLE = result(
  [
    node('home0', 0, 'home'),
    node('search1', 1, 'search'),
    node('pricing1', 1, 'pricing'),
    node('checkout2', 2, 'checkout'),
  ],
  [link('home0', 'search1', 40n), link('home0', 'pricing1', 60n), link('pricing1', 'checkout2', 50n)],
)

describe('buildSankeyData', () => {
  it('keeps a whole response intact and reports no degradation', () => {
    const graph = buildSankeyData(WHOLE)

    expect(graph.nodes.map(n => n.name)).toEqual(['home', 'search', 'pricing', 'checkout'])
    expect(graph.links).toHaveLength(3)
    expect(graph.droppedLinks).toBe(0)
    expect(graph.collapsedNodes).toBe(0)
  })

  // Each of the three drop paths below removes a real transition from the flow. The node
  // summaries derive "continued" and "ended" by subtracting outbound from inbound over exactly
  // the survivors, so a silent drop overstates the drop-off at the link's source while the chart
  // stays internally consistent about it. The count is what lets the UI say so.
  it('drops a link whose endpoint the response never declared, and counts it', () => {
    const graph = buildSankeyData(result([node('home0', 0), node('search1', 1)], [link('home0', 'ghost', 40n)]))

    expect(graph.links).toHaveLength(0)
    expect(graph.droppedLinks).toBe(1)
  })

  it('drops a link that does not advance exactly one step, and counts it', () => {
    // A back-edge: the shape a cyclic transition graph produces. It has no left-to-right geometry.
    const graph = buildSankeyData(
      result([node('home0', 0), node('search1', 1)], [link('home0', 'search1', 40n), link('search1', 'home0', 5n)]),
    )

    expect(graph.links).toHaveLength(1)
    expect(graph.droppedLinks).toBe(1)
  })

  it('drops a link that skips a step, and counts it', () => {
    const graph = buildSankeyData(result([node('home0', 0), node('far2', 2)], [link('home0', 'far2', 40n)]))

    expect(graph.links).toHaveLength(0)
    expect(graph.droppedLinks).toBe(1)
  })

  it('drops a non-positive transition count, and counts it', () => {
    const graph = buildSankeyData(result([node('home0', 0), node('search1', 1)], [link('home0', 'search1', 0n)]))

    expect(graph.links).toHaveLength(0)
    expect(graph.droppedLinks).toBe(1)
  })

  // The one contract break that misattributes rather than omits: ids are unique per (depth,
  // label), so a duplicate collapses two steps into one and silently re-points every link that
  // referenced the first onto the second. It costs no dropped link, so the drop counter alone
  // reports a clean graph.
  it('counts nodes that collapsed onto a duplicate id', () => {
    const graph = buildSankeyData(
      result(
        [node('home0', 0, 'home'), node('dup', 1, 'search'), node('dup', 1, 'pricing')],
        [link('home0', 'dup', 40n)],
      ),
    )

    expect(graph.collapsedNodes).toBe(1)
  })

  it('names the overflow bucket from is_others, never from the label string', () => {
    const graph = buildSankeyData(
      result([node('home0', 0, 'home'), node('o1', 1, '$others', true), node('real1', 1, '$others')], []),
    )

    expect(graph.nodes[1]).toMatchObject({ name: 'Others', isOthers: true })
    expect(graph.nodes[2]).toMatchObject({ name: '$others', isOthers: false })
  })

  it('leaves a breadcrumb in the console as well as in the count', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    buildSankeyData(result([node('home0', 0)], [link('home0', 'ghost', 1n)]))

    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})

describe('sankeyIncompleteReason', () => {
  it('says nothing about a whole graph', () => {
    expect(sankeyIncompleteReason(buildSankeyData(WHOLE))).toBeNull()
  })

  it('reports dropped transitions', () => {
    const reason = sankeyIncompleteReason(buildSankeyData(result([node('a', 0)], [link('a', 'ghost', 1n)])))

    expect(reason).toContain('1 transition')
    expect(reason).toContain('incomplete')
  })

  it('reports merged duplicate steps', () => {
    const graph = buildSankeyData(result([node('dup', 0, 'a'), node('dup', 0, 'b')], []))

    expect(sankeyIncompleteReason(graph)).toContain('merged')
  })
})

describe('userFlowIncompleteReason', () => {
  const config = (over: Partial<UserFlowConfig> = {}): UserFlowConfig => ({ ...DEFAULT_USER_FLOW_CONFIG, ...over })

  it('never blocks an event-kind flow', () => {
    expect(userFlowIncompleteReason(config())).toBeNull()
  })

  it('asks for a property when nodes are property-shaped', () => {
    expect(userFlowIncompleteReason(config({ nodeKind: UserFlowQuery_NodeKind.PROPERTY }))).toMatch(
      /select a property/i,
    )
  })

  // Mirrors the spec-level CEL rule, so an unsendable name is caught here instead of returning
  // from the wire as a protovalidate error.
  it('rejects a property name the backend would reject', () => {
    const reason = userFlowIncompleteReason(
      config({ nodeKind: UserFlowQuery_NodeKind.PROPERTY, nodeProperty: 'has space' }),
    )

    expect(reason).toMatch(/letters, numbers/i)
  })

  it('accepts an auto-property with its dollar prefix', () => {
    const ok = config({ nodeKind: UserFlowQuery_NodeKind.PROPERTY, nodeProperty: '$utm_source' })

    expect(userFlowIncompleteReason(ok)).toBeNull()
  })
})

// The dashboard replay path holds a stored spec rather than editor state, and a tile that cannot
// run has to say why on a page that has no query above it.
describe('userFlowSpecIncompleteReason', () => {
  it('asks an unconfigured tile to be configured', () => {
    expect(userFlowSpecIncompleteReason(undefined)).toBe('Configure the flow to start')
    expect(userFlowSpecIncompleteReason({})).toBe('Configure the flow to start')
  })

  it('carries the property reason through from a stored spec', () => {
    const spec = { userFlow: { nodeKind: UserFlowQuery_NodeKind.PROPERTY, nodeProperty: '' } }

    expect(userFlowSpecIncompleteReason(spec)).toMatch(/select a property/i)
  })

  it('passes a runnable stored spec', () => {
    expect(userFlowSpecIncompleteReason({ userFlow: { nodeKind: UserFlowQuery_NodeKind.EVENT_KIND } })).toBeNull()
  })
})

describe('user-flow config round trip', () => {
  const configured: UserFlowConfig = {
    nodeKind: UserFlowQuery_NodeKind.PROPERTY,
    nodeProperty: '$utm_source',
    groupBy: UserFlowQuery_GroupBy.SESSION,
    scope: {
      kind: 'page_view',
      filters: [
        {
          property: '$os',
          source: PropertySource.AUTO,
          operator: FilterOperator.IN,
          kind: 'multi',
          values: ['ios', 'android'],
        },
      ],
    },
  }

  it('restores a configured flow through a serialize round trip', () => {
    expect(parseSerializedUserFlowConfig(serializeUserFlowConfig(configured))).toEqual(configured)
  })

  // The bug this shape exists for: switching the node kind produces a property flow with no
  // property yet, and rejecting that on read threw away the scope and filters the user had built.
  it('restores a half-configured property flow rather than resetting it', () => {
    const half = { ...configured, nodeProperty: '' }
    const restored = parseSerializedUserFlowConfig(serializeUserFlowConfig(half))

    expect(restored?.scope.kind).toBe('page_view')
    expect(restored?.scope.filters).toHaveLength(1)
    expect(userFlowIncompleteReason(restored as UserFlowConfig)).toMatch(/select a property/i)
  })

  it('refuses a value it cannot read', () => {
    expect(parseSerializedUserFlowConfig({ nodeKind: 'not-an-enum' })).toBeNull()
    expect(parseSerializedUserFlowConfig(null)).toBeNull()
  })

  // A multi filter whose payload is missing would otherwise reach toProtoFilters and produce a
  // filter message with an undefined field — a query that is wrong rather than rejected.
  it('refuses a filter whose payload does not match its kind', () => {
    const bad = serializeUserFlowConfig(configured) as { scope: { filters: unknown[] } }
    bad.scope.filters = [{ property: '$os', source: PropertySource.AUTO, operator: FilterOperator.IN, kind: 'multi' }]

    expect(parseSerializedUserFlowConfig(bad)).toBeNull()
  })
})

describe('buildUserFlowQuery', () => {
  it('leaves the server caps unset so it picks its own defaults', () => {
    const query = buildUserFlowQuery(DEFAULT_USER_FLOW_CONFIG)

    expect(query.maxHops).toBe(0)
    expect(query.maxNodes).toBe(0)
    expect(query.maxLinks).toBe(0)
  })

  // The backend rejects a node_property on a non-property flow, so it must not survive a switch
  // back to event-kind nodes.
  it('sends no property when the nodes are event kinds', () => {
    const query = buildUserFlowQuery({ ...DEFAULT_USER_FLOW_CONFIG, nodeProperty: '$utm_source' })

    expect(query.nodeProperty).toBe('')
  })

  it('omits the scope entirely when no event is chosen', () => {
    expect(buildUserFlowQuery(DEFAULT_USER_FLOW_CONFIG).scope).toBeUndefined()
  })

  // The gate trims before testing the pattern, so a padded name is judged runnable. Sending it
  // verbatim then fails the CEL rule the pattern mirrors — the local check exists precisely to
  // stop that reaching the wire. scope.kind is already trimmed on the way out; this matches it.
  // Not reachable from the property picker, but a shared URL carries whatever it was given.
  it('trims a padded property name so the gate and the wire agree', () => {
    const padded: UserFlowConfig = {
      ...DEFAULT_USER_FLOW_CONFIG,
      nodeKind: UserFlowQuery_NodeKind.PROPERTY,
      nodeProperty: '  $utm_source  ',
    }

    expect(userFlowIncompleteReason(padded)).toBeNull()
    expect(buildUserFlowQuery(padded).nodeProperty).toBe('$utm_source')
  })
})
