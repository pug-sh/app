import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SankeyGraph } from '../user-flow'
import { SankeyChart } from './sankey-chart'

const node = (id: string, name: string, stepDepth: number) => ({ id, name, stepDepth, isOthers: false })

const graph = (over: Partial<SankeyGraph>): SankeyGraph => ({
  nodes: [],
  links: [],
  droppedLinks: 0,
  collapsedNodes: 0,
  ...over,
})

// Rects are emitted in layout.nodes order, which is the order of the nodes handed in.
const hoverNode = (container: HTMLElement, index: number) => {
  const rect = container.querySelectorAll('rect')[index]
  fireEvent.mouseMove(rect, { clientX: 40, clientY: 40 })
}

const WHOLE = graph({
  nodes: [node('a0', 'home', 0), node('b1', 'pricing', 1), node('c2', 'checkout', 2)],
  links: [
    { source: 0, target: 1, value: 100, sourceName: 'home', targetName: 'pricing' },
    { source: 1, target: 2, value: 60, sourceName: 'pricing', targetName: 'checkout' },
  ],
})

describe('SankeyChart node summary', () => {
  it('names the first column an entry point', () => {
    const { container } = render(<SankeyChart data={WHOLE} />)
    hoverNode(container, 0)

    expect(container.textContent).toContain('Entry point')
  })

  it('names the last column the end of the flow', () => {
    const { container } = render(<SankeyChart data={WHOLE} />)
    hoverNode(container, 2)

    expect(container.textContent).toContain('Flow ends here')
  })

  it('accounts for what continued and what ended mid-flow', () => {
    const { container } = render(<SankeyChart data={WHOLE} />)
    hoverNode(container, 1)

    // 100 arrived, 60 continued, so 40 ended here.
    expect(container.textContent).toContain('60 continued')
    expect(container.textContent).toContain('40 ended')
  })

  // A node whose inbound link was dropped has inflow 0 while sitting mid-flow, and inflow === 0
  // alone is what the card reads to call something an entry point. Left unqualified it relabels a
  // step in the middle of the funnel as its start — asserting a category the data can no longer
  // establish, in the one place these figures are readable.
  it('does not call a mid-flow step an entry point when its inbound flow was dropped', () => {
    const orphanedInbound = graph({
      nodes: [node('a0', 'home', 0), node('b1', 'pricing', 1), node('c2', 'checkout', 2)],
      links: [{ source: 1, target: 2, value: 60, sourceName: 'pricing', targetName: 'checkout' }],
      droppedLinks: 1,
    })
    const { container } = render(<SankeyChart data={orphanedInbound} />)
    hoverNode(container, 1)

    expect(container.textContent).toContain('pricing')
    expect(container.textContent).not.toContain('Entry point')
  })

  it('does not call a mid-flow step the end of the flow when its outbound was dropped', () => {
    const orphanedOutbound = graph({
      nodes: [node('a0', 'home', 0), node('b1', 'pricing', 1), node('c2', 'checkout', 2)],
      links: [{ source: 0, target: 1, value: 100, sourceName: 'home', targetName: 'pricing' }],
      droppedLinks: 1,
    })
    const { container } = render(<SankeyChart data={orphanedOutbound} />)
    hoverNode(container, 1)

    expect(container.textContent).toContain('pricing')
    expect(container.textContent).not.toContain('Flow ends here')
  })
})

// useDebouncedQuery keeps the previous response while the next one is in flight, and this chart is
// rendered without a key, so the stale graph stays mounted and interactive. A stationary cursor
// fires no mousemove, so nothing clears the hovered index — and because the server prunes top-N
// per depth, a new response legitimately reorders a column.
describe('SankeyChart hover across a refetch', () => {
  it('drops the hover card when the data underneath it changes', () => {
    const { container, rerender } = render(<SankeyChart data={WHOLE} />)
    hoverNode(container, 1)
    expect(container.textContent).toContain('pricing')

    // The same three steps, but the middle column now resolves to a different event — exactly what
    // an index captured against the old layout would point at.
    const reordered = graph({
      nodes: [node('a0', 'home', 0), node('b1', 'signup', 1), node('c2', 'checkout', 2)],
      links: [
        { source: 0, target: 1, value: 100, sourceName: 'home', targetName: 'signup' },
        { source: 1, target: 2, value: 60, sourceName: 'signup', targetName: 'checkout' },
      ],
    })
    rerender(<SankeyChart data={reordered} />)

    // Not "shows signup instead": with no cursor movement there is nothing to report, and holding
    // the index would state another node's figures under the old node's name.
    expect(container.textContent).not.toContain('Step 2')
  })
})

describe('SankeyChart accessibility', () => {
  // role="img" means assistive technology never reaches the shapes, and every ribbon and node is
  // pointer-driven, so this list is the only route to the figures without a mouse.
  it('lists every drawn transition as text, largest first', () => {
    const { container } = render(<SankeyChart data={WHOLE} />)
    const rows = [...container.querySelectorAll('.sr-only li')].map(li => li.textContent)

    expect(rows).toEqual(['home to pricing: 100 sessions', 'pricing to checkout: 60 sessions'])
  })

  it('counts steps and transitions without mispluralising a single one', () => {
    const single = graph({
      nodes: [node('a0', 'home', 0), node('b1', 'pricing', 1)],
      links: [{ source: 0, target: 1, value: 5, sourceName: 'home', targetName: 'pricing' }],
    })
    const { container } = render(<SankeyChart data={single} />)

    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe('User flow: 1 transition across 2 steps')
  })
})
