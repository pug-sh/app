import { readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Generated from logo.svg rather than committed alongside it, so the artwork has one
// source. It can't be logo.svg itself: that file's <img> sites sit on app-themed
// surfaces, and this query tracks the OS scheme.
const PLATE_QUERY = `<style>
  @media (prefers-color-scheme: light) { #badge-plate { display: none } }
</style>
`

const faviconFromLogo = (): Plugin => {
  const render = () => {
    const logo = readFileSync(path.resolve(__dirname, 'public/logo.svg'), 'utf8')
    const faviconSvg = logo.replace(/<rect\b[^>]*\bid="badge-plate"/, match => `${PLATE_QUERY}${match}`)
    // Fail loudly: a renamed id would otherwise ship a favicon that keeps the plate on light.
    if (faviconSvg === logo) throw new Error('logo.svg has no #badge-plate rect — favicon plate query would not apply')
    return faviconSvg
  }

  return {
    name: 'favicon-from-logo',
    configureServer(server) {
      server.middlewares.use('/favicon.svg', (_req, res) => {
        res.setHeader('Content-Type', 'image/svg+xml')
        res.end(render())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'favicon.svg', source: render() })
    },
  }
}

// The vendored charts hardcode the id of their reveal clip, so two charts of one type on a page
// emit duplicate ids — and `url(#id)` resolves to the first in document order, leaving every later
// chart clipped by the first one's rect. Rewritten in the build rather than in the file so
// src/components/charts stays byte-identical to the registry and a re-add can't revert it.
// Drop this once bklit scopes the id itself.
const CHART_CLIP_IDS = {
  'src/components/charts/line-chart.tsx': 'chart-grow-clip',
  'src/components/charts/area-chart.tsx': 'chart-area-grow-clip',
  'src/components/charts/composed-chart.tsx': 'composed-chart-grow-clip',
}

const scopeChartClipIds = (): Plugin => ({
  name: 'scope-chart-clip-ids',
  // Before the react plugin: this rewrites JSX attribute source, not compiled output.
  enforce: 'pre',
  transform(code, id) {
    const entry = Object.entries(CHART_CLIP_IDS).find(([name]) => id.includes(name))
    if (!entry) return null

    const [file, clipId] = entry
    // Import shares the directive's line, so `map: null` stays true and stack traces don't shift.
    const out = code
      .replace('"use client";', '"use client";import { useId as __useId } from "react";')
      .replace(`clipPathId="${clipId}"`, 'clipPathId={__useId().replace(/:/g, "")}')

    // Check the output, not the input: either replace no-ops silently, and the result only
    // misbehaves on a page mounting two of the same chart.
    if (!out.includes('__useId()')) {
      throw new Error(`${file}: clipPathId="${clipId}" is gone — renamed upstream, or scoped there (drop this plugin)`)
    }
    if (!out.includes('import { useId as __useId }')) {
      throw new Error(`${file}: no '"use client";' prologue to anchor the useId import`)
    }

    return { code: out, map: null }
  },
})

export default defineConfig({
  // react-draggable (via react-grid-layout) reads process.env.DRAGGABLE_DEBUG at
  // runtime, which throws "process is not defined" in the browser. Statically
  // replace it so dragging/resizing tiles works.
  define: {
    'process.env.DRAGGABLE_DEBUG': 'false',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('/react/') || id.includes('/react-dom/')) return 'vendor-react'
          if (
            id.includes('/maplibre-gl/') ||
            id.includes('/pmtiles/') ||
            id.includes('/protomaps-themes-base/') ||
            id.includes('/topojson-client/') ||
            id.includes('/world-atlas/')
          ) {
            return 'vendor-maplibre'
          }
          if (id.includes('/@bufbuild/') || id.includes('/@connectrpc/')) return 'vendor-proto'
          // Own chunk so ~120KB of artwork caches separately. The eagerly-imported ProfileShell
          // still pulls it onto every authenticated route; sign-in and the share page escape it.
          if (id.includes('/@dicebear/')) return 'vendor-avatars'
          if (id.includes('/lucide-react/')) return 'vendor-icons'
          if (id.includes('/@base-ui/')) return 'vendor-base-ui'
          if (id.includes('/tailwind-merge/') || id.includes('/class-variance-authority/') || id.includes('/clsx/')) {
            return 'vendor-style-utils'
          }

          return 'vendor-misc'
        },
      },
    },
  },
  plugins: [scopeChartClipIds(), react(), tailwindcss(), faviconFromLogo()],
})
