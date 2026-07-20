// Raster favicons for Safari, which renders no SVG favicon. Run by hand when the logo
// changes; the SVG favicon is generated per-build in vite.config.ts instead. Playwright
// is borrowed from the sibling pug-site checkout to keep a native dep out of CI install.

import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

const PLAYWRIGHT_CANDIDATES = [
  'playwright',
  path.resolve(root, '../pug-site/node_modules/playwright'),
  path.resolve(root, '../../pug-site/node_modules/playwright'),
]

const loadPlaywright = () => {
  for (const candidate of PLAYWRIGHT_CANDIDATES) {
    try {
      return require(candidate)
    } catch {}
  }
  throw new Error(`Playwright not found. Tried:\n  ${PLAYWRIGHT_CANDIDATES.join('\n  ')}`)
}

// ICO frames may be whole PNG files, so each entry is a 16-byte record pointing at one.
const buildIco = frames => {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)

  let offset = 6 + frames.length * 16
  const entries = frames.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // palette size
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })

  return Buffer.concat([header, ...entries, ...frames.map(f => f.png)])
}

const render = async (browser, svg, size) => {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style>` +
      `<img src="${dataUri}">`,
  )
  await page.waitForTimeout(150)
  // Without omitBackground the plate's rounded corners bake to white, which reads as a
  // hard square on a dark tab strip.
  const png = await page.screenshot({ type: 'png', omitBackground: true })
  await page.close()
  return png
}

const main = async () => {
  const { chromium } = loadPlaywright()
  const logo = readFileSync(path.join(root, 'public/logo.svg'), 'utf8')

  // Square the plate off: iOS applies its own squircle, and a baked corner leaves notches.
  const squared = logo.replace(/(<rect\b[^>]*\bid="badge-plate"[^>]*?)\srx="\d+"\sry="\d+"/, '$1')
  if (squared === logo) throw new Error('logo.svg badge-plate rect has no rx/ry to square off')

  const browser = await chromium.launch()

  const frames = []
  for (const size of [16, 32, 48]) {
    frames.push({ size, png: await render(browser, logo, size) })
  }
  writeFileSync(path.join(root, 'public/favicon.ico'), buildIco(frames))

  writeFileSync(path.join(root, 'public/apple-touch-icon.png'), await render(browser, squared, 180))

  await browser.close()
  console.log('wrote public/favicon.ico (16/32/48) and public/apple-touch-icon.png (180)')
}

main()
