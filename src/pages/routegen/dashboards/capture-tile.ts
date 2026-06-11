// Screenshot a live DOM node to a PNG — no html2canvas/dom-to-image dependency.
//
// Technique: clone the node, inline every computed style onto the clone (so it
// renders identically without the document's stylesheet), wrap it in an SVG
// <foreignObject>, and load that SVG through an <img>. Recharts renders plain
// SVG, so nothing taints the canvas and toBlob() stays usable. The <img> stays
// vector — drawing it onto a scaled canvas rasterizes crisply at device
// resolution. Fonts fall back to the system stack (the SVG loads in an isolated
// document that cannot see @font-face faces), which is fine for a chart snapshot.

// Copy resolved styles from each source element onto its clone counterpart. The
// clone tree mirrors the source tree 1:1, so we recurse in lockstep. Reading from
// the live source means colors/layout resolve in the current theme, as shown.
const inlineComputedStyles = (source: Element, target: Element) => {
  const computed = window.getComputedStyle(source)
  const style = (target as HTMLElement).style
  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i]
    style.setProperty(prop, computed.getPropertyValue(prop), computed.getPropertyPriority(prop))
  }

  const sourceChildren = source.children
  const targetChildren = target.children
  for (let i = 0; i < sourceChildren.length; i++) {
    const targetChild = targetChildren[i]
    if (targetChild) inlineComputedStyles(sourceChildren[i], targetChild)
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

// Rasterize a DOM node (the chart region, current theme, as-is) into a vector SVG
// <img>, and resolve the theme colors used to draw the surrounding card. The chart
// itself is never re-themed.
export const captureElementToImage = async (node: HTMLElement): Promise<CapturedChart> => {
  const rect = node.getBoundingClientRect()
  const width = Math.ceil(rect.width)
  const height = Math.ceil(rect.height)
  if (width === 0 || height === 0) throw new Error('Nothing to capture')

  const colors = resolveCardColors(node)

  const clone = node.cloneNode(true) as HTMLElement
  inlineComputedStyles(node, clone)
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  clone.style.margin = '0'
  clone.style.width = `${width}px`
  clone.style.height = `${height}px`

  const serialized = new XMLSerializer().serializeToString(clone)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
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
    // Safe to revoke immediately: the image has finished decoding by onload.
    URL.revokeObjectURL(svgUrl)
  }
}

// The app's brand mark (public/favicon.svg). Loaded once and cached. We add an
// explicit width/height so the SVG has an intrinsic size for canvas drawing
// (Firefox refuses to draw a sizeless SVG image). Resolves null if unavailable.
let brandLogoPromise: Promise<HTMLImageElement | null> | undefined

export const loadBrandLogo = () => {
  if (!brandLogoPromise) {
    brandLogoPromise = fetch('/favicon.svg')
      .then(response => (response.ok ? response.text() : Promise.reject(new Error('logo missing'))))
      .then(markup => {
        const sized = /<svg[^>]*\swidth=/.test(markup) ? markup : markup.replace('<svg', '<svg width="64" height="64"')
        const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }))
        return loadImage(url, 64, 64).finally(() => URL.revokeObjectURL(url))
      })
      .catch(() => null)
  }
  return brandLogoPromise
}

const truncateToWidth = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text
  let truncated = text
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return `${truncated.trimEnd()}…`
}

// Device-independent export scale: every laid-out pixel becomes a 3×3 block in
// the PNG, so a ~600px tile exports near 1800px wide regardless of the viewer's
// monitor. The card source is vector SVG, so this is true detail, not upscaling.
// Browsers cap a canvas dimension near 16k px, so keep scale × size under that.
const EXPORT_SCALE = 3

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

  const canvas = document.createElement('canvas')
  canvas.width = cardW * scale
  canvas.height = cardH * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.scale(scale, scale)

  // Rounded card surface + hairline border (corners stay transparent). Inset by
  // half a pixel so the 1px stroke isn't clipped at the canvas edge.
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
      ctx.font = `600 ${TITLE_SIZE}px ${fontFamily}`
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
    URL.revokeObjectURL(url)
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
