import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { captureElementToImage } from './capture-chart'

// Chrome drops the canvas origin-clean flag for an <img>-loaded SVG holding a <foreignObject>
// sourced from a blob: URL, so the share card's toBlob() throws SecurityError. happy-dom rasterizes
// nothing, so the taint itself is unobservable here — assert the property that avoids it instead.

const srcs: string[] = []
let createObjectURL: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  srcs.length = 0
  createObjectURL = vi.spyOn(URL, 'createObjectURL')

  // happy-dom never loads an <img>, so onload would never fire and the capture would hang to its
  // 10s timeout. Record the src and resolve on the next tick.
  class StubImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(value: string) {
      srcs.push(value)
      queueMicrotask(() => this.onload?.())
    }
  }
  vi.stubGlobal('Image', StubImage)

  // loadFontFaceCss() embeds the woff2 as base64; an unstubbed fetch would reject and log.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const mountNode = () => {
  const node = document.createElement('div')
  node.innerHTML = '<p>tile contents</p>'
  document.body.appendChild(node)
  // happy-dom lays nothing out, and a 0×0 node short-circuits as 'Nothing to capture'.
  node.getBoundingClientRect = () => ({ width: 320, height: 180 }) as DOMRect
  return node
}

test('sources the snapshot SVG from a data: URL, never a blob: URL', async () => {
  await captureElementToImage(mountNode())

  expect(srcs).toHaveLength(1)
  expect(srcs[0].startsWith('data:image/svg+xml')).toBe(true)
  expect(createObjectURL).not.toHaveBeenCalled()
})

test('percent-encodes the markup so a url(#clip) ref cannot truncate the URL', async () => {
  const node = mountNode()
  // The vendored charts emit clip-path="url(#id)"; a raw '#' would end the data: URL at a fragment.
  node.innerHTML = '<svg><rect clip-path="url(#reveal)" /></svg>'

  await captureElementToImage(node)

  expect(srcs[0]).not.toContain('#')
  expect(decodeURIComponent(srcs[0])).toContain('url(#reveal)')
})
