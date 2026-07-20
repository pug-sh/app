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
  plugins: [react(), tailwindcss(), faviconFromLogo()],
})
