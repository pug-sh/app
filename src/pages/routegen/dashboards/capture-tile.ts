// Screenshot a live DOM node to a PNG — no html2canvas/dom-to-image dependency.
//
// Technique: clone the node, inline every computed style onto the clone (so it
// renders identically without the document's stylesheet), wrap it in an SVG
// <foreignObject>, and load that SVG through an <img>. Recharts renders plain
// SVG, so nothing taints the canvas and toBlob() stays usable. The <img> stays
// vector — drawing it onto a scaled canvas rasterizes crisply at device
// resolution. The SVG loads in an isolated document that cannot see the page's
// @font-face faces, so the UI font is re-supplied by embedding it in the SVG (see
// loadFontFaceCss) — without it the chart text falls back to the system stack.

import figtreeWoff2 from '@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2?url'

// Force both overflow axes open with !important (overriding the stylesheet's overflow
// class). On live elements, measureFullSize saves and restores these exact properties.
const openOverflow = (style: CSSStyleDeclaration) => {
  style.setProperty('overflow-x', 'visible', 'important')
  style.setProperty('overflow-y', 'visible', 'important')
}

// Copy resolved styles from each source element onto its clone counterpart. The
// clone tree mirrors the source tree 1:1, so we recurse in lockstep. Reading from
// the live source means colors/layout resolve in the current theme, as shown.
const inlineComputedStyles = (source: Element, target: Element, unclip: Set<Element>) => {
  const computed = window.getComputedStyle(source)
  const style = (target as HTMLElement).style
  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i]
    style.setProperty(prop, computed.getPropertyValue(prop), computed.getPropertyPriority(prop))
  }
  // Re-open scroll regions (and the wrappers between them and the captured root) so
  // the full content lays out in the snapshot instead of the scrolled-into-view
  // slice — otherwise horizontally/vertically scrollable tiles export clipped.
  if (unclip.has(source)) openOverflow(style)

  const sourceChildren = source.children
  const targetChildren = target.children
  for (let i = 0; i < sourceChildren.length; i++) {
    const targetChild = targetChildren[i]
    if (targetChild) inlineComputedStyles(sourceChildren[i], targetChild, unclip)
  }
}

// The foreignObject SVG technique is brittle: if the serialized markup contains
// anything the SVG-image renderer rejects, some browsers fire neither onload nor
// onerror and the image hangs un-decoded. A timeout guarantees the Promise settles
// so callers can surface an error and recover instead of stalling forever.
const LOAD_TIMEOUT_MS = 10_000

const loadImage = (src: string, width: number, height: number) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image(width, height)
    const timer = setTimeout(() => reject(new Error('Snapshot render timed out')), LOAD_TIMEOUT_MS)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error('Failed to render snapshot'))
    }
    img.src = src
  })

// The SVG-image renderer loads in an isolated document that cannot see the page's
// @font-face faces, so chart text otherwise falls back to the system sans stack —
// visibly different from the rest of the UI. We re-supply the font by embedding it
// directly in the SVG as a base64 data: URL @font-face (an external url() would not
// load inside an <img>-loaded SVG). One variable file covers every weight; the latin
// subset is enough for tile text. Fetched and base64-encoded once, then cached.
const FONT_FAMILY = 'Figtree Variable'
const FONT_URL = figtreeWoff2
let fontFaceCssPromise: Promise<string> | undefined

const loadFontFaceCss = () => {
  if (!fontFaceCssPromise) {
    fontFaceCssPromise = fetch(FONT_URL)
      .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error('font missing'))))
      .then(buffer => {
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        const base64 = btoa(binary)
        return (
          `@font-face{font-family:"${FONT_FAMILY}";font-style:normal;font-weight:300 900;` +
          `src:url(data:font/woff2;base64,${base64}) format("woff2");}`
        )
      })
      .catch(error => {
        // Cosmetic: the chart text just falls back to the system sans stack, as it
        // did before embedding. Log so a moved/renamed font file is debuggable.
        console.error('Failed to load font for share card', error)
        return ''
      })
  }
  return fontFaceCssPromise
}

export type CapturedChart = {
  img: HTMLImageElement
  width: number
  height: number
  // The current theme's resolved colors, so the card we draw around the chart
  // matches the live tile (we never re-theme the chart itself).
  surface: string
  foreground: string
  muted: string
  border: string
}

// Resolve theme colors as concrete rgb() via a hidden probe inside the live node,
// so CSS variables (oklch) cascade in the current theme and we avoid relying on
// canvas oklch support. Each var is mapped onto a distinct color property.
const resolveCardColors = (node: HTMLElement) => {
  const probe = document.createElement('span')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  probe.style.borderTop = '1px solid var(--border)'
  probe.style.backgroundColor = 'var(--background)'
  probe.style.color = 'var(--foreground)'
  probe.style.textDecorationColor = 'var(--muted-foreground)'
  node.appendChild(probe)
  const cs = window.getComputedStyle(probe)
  const colors = {
    surface: cs.backgroundColor,
    foreground: cs.color,
    muted: cs.textDecorationColor,
    border: cs.borderTopColor,
  }
  probe.remove()
  return colors
}

// A scrollable region (retention heatmap, data table) clips its content to the
// visible box, so the live tile shows only the scrolled-into-view slice. To
// snapshot the whole thing we re-open every such region. We match only intentional
// scrollers (overflow auto/scroll) — never overflow:hidden, which also drives
// single-line text truncation and must stay clipped.
const SCROLLABLE_OVERFLOW = /^(?:auto|scroll)$/

const findScrollClippers = (node: HTMLElement) => {
  const clippers = new Set<Element>()
  const consider = (el: Element) => {
    if (!(el instanceof HTMLElement)) return
    const cs = window.getComputedStyle(el)
    // +1 tolerates sub-pixel rounding: scrollWidth/clientWidth are integer-rounded, so a
    // 1px delta is layout noise, not real overflow — without it a non-scrolling element
    // gets flagged as a clipper and needlessly forced open.
    const clipsX = SCROLLABLE_OVERFLOW.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1
    const clipsY = SCROLLABLE_OVERFLOW.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1
    if (clipsX || clipsY) clippers.add(el)
  }
  consider(node)
  for (const el of node.querySelectorAll('*')) consider(el)
  return clippers
}

// Re-opening a scroll region is not enough on its own: any overflow:hidden wrapper
// between it and the captured root would re-clip the freed content. So expand each
// clipper to its ancestor chain up to (and including) `node` — the whole path must
// be opened for the full content to lay out.
const expandToRoot = (clippers: Set<Element>, node: HTMLElement) => {
  const unclip = new Set<Element>()
  for (const clipper of clippers) {
    let cur: Element | null = clipper
    while (cur) {
      unclip.add(cur)
      if (cur === node) break
      cur = cur.parentElement
    }
  }
  return unclip
}

// Measure `node`'s full content size with every clipper on the path re-opened, so
// off-screen scroll content contributes to the extent. The live nodes' inline
// overflow is mutated and restored synchronously — no await in between — so the
// browser never paints the transient un-clipped layout.
const measureFullSize = (node: HTMLElement, unclip: Set<Element>) => {
  const rect = node.getBoundingClientRect()
  const base = { width: Math.ceil(rect.width), height: Math.ceil(rect.height) }
  if (unclip.size === 0) return base

  // Save each element's inline overflow (value + priority) and its scroll offset.
  // Forcing overflow:visible makes a scroll container non-scrollable, which clamps
  // scrollLeft/scrollTop to 0 during the reflow; restoring overflow does not bring
  // the offset back, so we reassign it — otherwise a tile the user had scrolled
  // jumps to the top-left the moment they open Share.
  const saved: Array<{ el: HTMLElement; x: string; xp: string; y: string; yp: string; left: number; top: number }> = []
  for (const element of unclip) {
    const el = element as HTMLElement
    const style = el.style
    saved.push({
      el,
      x: style.getPropertyValue('overflow-x'),
      xp: style.getPropertyPriority('overflow-x'),
      y: style.getPropertyValue('overflow-y'),
      yp: style.getPropertyPriority('overflow-y'),
      left: el.scrollLeft,
      top: el.scrollTop,
    })
    openOverflow(style)
  }
  try {
    return {
      width: Math.max(base.width, node.scrollWidth),
      height: Math.max(base.height, node.scrollHeight),
    }
  } finally {
    for (const { el, x, xp, y, yp, left, top } of saved) {
      const style = el.style
      if (x) style.setProperty('overflow-x', x, xp)
      else style.removeProperty('overflow-x')
      if (y) style.setProperty('overflow-y', y, yp)
      else style.removeProperty('overflow-y')
      // Reassign after overflow is restored, so the element is scrollable again.
      el.scrollLeft = left
      el.scrollTop = top
    }
  }
}

// Rasterize a DOM node (the chart region, current theme, as-is) into a vector SVG
// <img>, and resolve the theme colors used to draw the surrounding card. The chart
// itself is never re-themed.
export const captureElementToImage = async (node: HTMLElement): Promise<CapturedChart> => {
  // Scrollable tiles (retention heatmaps, data tables) clip their content to the
  // visible box. Find those scroll regions plus the wrapper chain up to `node` so
  // the snapshot lays the full content out instead of exporting the scrolled slice.
  const unclip = expandToRoot(findScrollClippers(node), node)
  const { width, height } = measureFullSize(node, unclip)
  if (width === 0 || height === 0) throw new Error('Nothing to capture')

  const colors = resolveCardColors(node)
  const fontFaceCss = await loadFontFaceCss()

  const clone = node.cloneNode(true) as HTMLElement
  inlineComputedStyles(node, clone, unclip)
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  clone.style.margin = '0'
  clone.style.width = `${width}px`
  clone.style.height = `${height}px`

  const serialized = new XMLSerializer().serializeToString(clone)
  // base64 src is XML-safe ([A-Za-z0-9+/=]), so the @font-face needs no CDATA wrap.
  const fontStyle = fontFaceCss ? `<style>${fontFaceCss}</style>` : ''
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    fontStyle +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${serialized}</foreignObject>` +
    '</svg>'

  // Source the SVG from a Blob URL rather than a data: URL — the inlined computed
  // styles make the markup large, and a percent-encoded data: URL of that size is
  // the fragile part of this technique (encoding cost + URL length limits).
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = await loadImage(svgUrl, width, height)
    return { img, width, height, ...colors }
  } finally {
    // loadImage has settled — resolved after onload (bitmap retained independently
    // of the URL) or rejected on error/timeout (load abandoned). Either way the
    // object URL is no longer needed.
    URL.revokeObjectURL(svgUrl)
  }
}

// logo.svg bakes in a pale badge plate so the full-color mark reads on any surface.
// That plate is what makes the mark legible on the dark card, but on the light card
// it reads as a stray pale tile — so strip it there and let the mark sit directly on
// the surface. Stripping leaves the viewBox alone, so the mark keeps its drawn size.
const BADGE_PLATE = /<rect\b[^>]*\bid="badge-plate"[^>]*\/>\s*/

const stripBadgePlate = (markup: string) => {
  const stripped = markup.replace(BADGE_PLATE, '')
  // A renamed/removed id would otherwise quietly restore the plate on light cards.
  if (stripped === markup) console.error('Brand logo badge plate not found — light share card will show it')
  return stripped
}

// The app's brand mark (public/logo.svg). Loaded once per theme and cached. We add
// an explicit width/height so the SVG has an intrinsic size for canvas drawing
// (Firefox refuses to draw a sizeless SVG image). Resolves null if unavailable.
const brandLogoPromises = new Map<'light' | 'dark', Promise<HTMLImageElement | null>>()

export const loadBrandLogo = (theme: 'light' | 'dark') => {
  const cached = brandLogoPromises.get(theme)
  if (cached) return cached

  const promise = fetch('/logo.svg')
    .then(response => (response.ok ? response.text() : Promise.reject(new Error('logo missing'))))
    .then(markup => {
      const plated = theme === 'dark' ? markup : stripBadgePlate(markup)
      const sized = /<svg[^>]*\swidth=/.test(plated) ? plated : plated.replace('<svg', '<svg width="64" height="64"')
      const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }))
      return loadImage(url, 64, 64).finally(() => URL.revokeObjectURL(url))
    })
    .catch(error => {
      // Cosmetic: the share card just renders without the mark. Log so a 404'd
      // logo (e.g. after an asset-hash change) is debuggable rather than silent.
      console.error('Failed to load brand logo for share card', error)
      return null
    })

  brandLogoPromises.set(theme, promise)
  return promise
}

const truncateToWidth = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text
  let truncated = text
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return `${truncated.trimEnd()}…`
}

// Device-independent export target scale: each laid-out pixel becomes up to a 3×3
// block in the PNG, so a ~600px tile exports near 1800px wide regardless of the
// viewer's monitor. The card source is vector SVG, so this is true detail, not
// upscaling. This is a target, not a guarantee — composeShareCard lowers it toward
// 1× for tiles large enough to approach the canvas caps below.
const EXPORT_SCALE = 3

// Browsers cap a single canvas dimension near 16384px and total canvas area near
// 2^28px; past either, canvas.toBlob fails (null) or silently encodes a blank
// bitmap. composeShareCard scales down to fit, then hard-fails if even 1× is over.
const MAX_CANVAS_DIM = 16384
const MAX_CANVAS_AREA = MAX_CANVAS_DIM * MAX_CANVAS_DIM

const CARD_PAD = 20
const CARD_RADIUS = 16
const TITLE_SIZE = 16
const META_SIZE = 13
const HEADER_GAP = 16 // between header row and chart
const META_GAP = 14 // min space between title and meta
const BRAND_LOGO = 18
const BRAND_TEXT_SIZE = 13
const BRAND_GAP_Y = 16 // vertical: chart bottom to brand row
const BRAND_GAP_X = 7 // horizontal: between prefix, logo, and brand text

export type ShareCardOptions = {
  card: CapturedChart
  // Editable card title (drawn here, left of the header).
  title: string
  // Time-range label (drawn right of the header).
  meta: string
  fontFamily: string
  // Attribution qualifier (e.g. "Made with") rendered before the logo + brand,
  // in the muted tone, so the mark reads as a tool credit, not the data's owner.
  brandPrefix: string
  brandText: string
  logo: HTMLImageElement | null
  scale?: number
}

// Compose the share card: a single surface card (current-theme colors, rounded
// with transparent corners) holding the title + time-range header, the captured
// chart, and the brand mark in the bottom-left. No outer backdrop.
export const composeShareCard = async ({
  card,
  title,
  meta,
  fontFamily,
  brandPrefix,
  brandText,
  logo,
  scale = EXPORT_SCALE,
}: ShareCardOptions): Promise<Blob> => {
  const trimmedTitle = title.trim()
  const hasHeader = Boolean(trimmedTitle) || Boolean(meta)
  const headerBand = hasHeader ? TITLE_SIZE + HEADER_GAP : 0

  const hasBrand = Boolean(brandText) || Boolean(logo)
  const brandBand = hasBrand ? BRAND_GAP_Y + BRAND_LOGO : 0

  const cardW = card.width + CARD_PAD * 2
  const cardH = CARD_PAD + headerBand + card.height + brandBand + CARD_PAD

  // Now that scroll tiles export at full content size, a wide/tall retention table
  // can push the 3× canvas past the caps — so scale down to fit (never below 1×, to
  // avoid a blurry sub-pixel export).
  const safeScale = Math.max(1, Math.min(scale, Math.floor(MAX_CANVAS_DIM / Math.max(cardW, cardH))))
  const pxW = cardW * safeScale
  const pxH = cardH * safeScale
  // The 1× floor can't rescue content that alone exceeds the caps. Rather than let
  // the canvas silently encode blank, fail with a message the caller can surface so
  // the user knows to narrow the range instead of downloading a broken image.
  if (pxW > MAX_CANVAS_DIM || pxH > MAX_CANVAS_DIM || pxW * pxH > MAX_CANVAS_AREA) {
    throw new Error('Chart is too large to export — narrow the date range or remove a breakdown')
  }

  const canvas = document.createElement('canvas')
  canvas.width = pxW
  canvas.height = pxH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.scale(safeScale, safeScale)

  // Flat, edge-to-edge card: the surface fills the image, with a hairline border
  // and rounded corners (the tiny corner nubs stay transparent). No frame, no
  // shadow — it reads as a clean product snapshot, matching the app's flat look.
  ctx.beginPath()
  ctx.roundRect(0.5, 0.5, cardW - 1, cardH - 1, CARD_RADIUS)
  ctx.fillStyle = card.surface
  ctx.fill()
  ctx.strokeStyle = card.border
  ctx.lineWidth = 1
  ctx.stroke()

  // Header: title (left) and time range (right), on a shared baseline.
  if (hasHeader) {
    const baseY = CARD_PAD + TITLE_SIZE

    let metaW = 0
    if (meta) {
      ctx.font = `500 ${META_SIZE}px ${fontFamily}`
      metaW = ctx.measureText(meta).width
      ctx.fillStyle = card.muted
      ctx.textAlign = 'right'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(meta, cardW - CARD_PAD, baseY)
    }
    if (trimmedTitle) {
      ctx.font = `500 ${TITLE_SIZE}px ${fontFamily}`
      ctx.fillStyle = card.foreground
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      const maxTitleW = card.width - (meta ? metaW + META_GAP : 0)
      ctx.fillText(truncateToWidth(ctx, trimmedTitle, maxTitleW), CARD_PAD, baseY)
    }
  }

  ctx.drawImage(card.img, CARD_PAD, CARD_PAD + headerBand, card.width, card.height)

  // Brand credit, bottom-left inside the card: "<prefix> <logo> <brand>". Kept
  // subtle (muted, not bold, slightly dimmed logo) so the whole mark reads as a
  // quiet attribution, not the data's owner.
  if (hasBrand) {
    const centerY = cardH - CARD_PAD - BRAND_LOGO / 2
    let cursor = CARD_PAD
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = `500 ${BRAND_TEXT_SIZE}px ${fontFamily}`
    ctx.fillStyle = card.muted

    if (brandPrefix) {
      ctx.fillText(brandPrefix, cursor, centerY)
      cursor += ctx.measureText(brandPrefix).width + BRAND_GAP_X
    }
    if (logo) {
      ctx.save()
      ctx.globalAlpha = 0.8
      ctx.drawImage(logo, cursor, centerY - BRAND_LOGO / 2, BRAND_LOGO, BRAND_LOGO)
      ctx.restore()
      cursor += BRAND_LOGO + (brandText ? BRAND_GAP_X : 0)
    }
    if (brandText) {
      ctx.fillText(brandText, cursor, centerY)
    }
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Failed to encode PNG'))), 'image/png')
  })
}

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    // Defer the revoke: some browsers haven't started the download by the time
    // click() returns, and revoking synchronously can truncate it to an empty file.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}

export const copyImageToClipboard = async (blob: Blob): Promise<boolean> => {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch (error) {
    // Blocked/denied (e.g. lost focus, non-secure context) vs. unsupported — the
    // caller can't tell them apart, so log the reason for debuggability.
    console.error('Failed to copy image to clipboard', error)
    return false
  }
}
