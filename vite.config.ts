import { readFileSync } from 'node:fs'
import path from 'node:path'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { preconnectLinks } from './scripts/preconnect-links'

// Generated from logo.svg rather than committed alongside it, so the artwork has one
// source. It can't be logo.svg itself: that file's <img> sites sit on app-themed
// surfaces, and this query tracks the OS scheme.
const PLATE_QUERY = `<style>
  @media (prefers-color-scheme: light) { #badge-plate { display: none } }
</style>
`

// Imported only by lazy routes, so they load with those routes rather than in vendor-misc on first paint.
const ROUTE_ONLY_PACKAGES =
  /\/node_modules\/(react-grid-layout|react-draggable|react-resizable|react-hook-form|@hookform\/resolvers|oidc-client-ts|sugar-high)\//

const faviconFromLogo = (): Plugin => {
  const render = () => {
    const logo = readFileSync(path.resolve(import.meta.dirname, 'public/logo.svg'), 'utf8')
    const faviconSvg = logo.replace(/<rect\b[^>]*\bid="badge-plate"/, match => `${PLATE_QUERY}${match}`)
    // Fail loudly: a renamed id would otherwise ship a favicon that keeps the plate on light.
    if (faviconSvg === logo)
      throw new Error('logo.svg has no #badge-plate rect, so the favicon plate query would not apply')
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

// bklit pads the y-domain a tenth past the peak, then rounds it at d3's default ten ticks while labelling five, so plots
// topped out well above the data in an unlabelled strip. Round the bare peak at Y_TICK_COUNT (insights/charts/common.ts).
const Y_DOMAIN_PATCHES = [
  ['scaleLinear().domain(domain).nice().range([0, 1])', 'scaleLinear().domain(domain).nice(6).range([0, 1])'],
  ['return [0, yScaleDomainMax * 1.1];', 'return [0, yScaleDomainMax];'],
  ['const top = maxValue <= 0 ? 100 : maxValue * 1.1;', 'const top = maxValue <= 0 ? 100 : maxValue;'],
]
const alignYDomainToAxisTicks = (): Plugin => ({
  name: 'align-y-domain-to-axis-ticks',
  enforce: 'pre',
  transform(code, id) {
    if (!id.split('?')[0].endsWith('/components/charts/y-domain-utils.ts')) return
    const patched = Y_DOMAIN_PATCHES.reduce((source, [from, to]) => {
      if (!source.includes(from)) throw new Error(`y-domain-utils.ts changed upstream; re-check: ${from}`)
      return source.replace(from, to)
    }, code)
    // No patch moves a line, so the file's own source map still holds.
    return { code: patched, map: null }
  },
})

const PRECONNECTS_MARKER = '<!-- preconnects -->'

// Written at build time from the build's own settings, so an air-gapped index.html names no outside host.
const preconnects = (): Plugin => {
  let env: Record<string, string> = {}

  return {
    name: 'preconnects',
    configResolved(config) {
      env = config.env
    },
    transformIndexHtml(html) {
      // Fail loudly: a moved marker would otherwise ship a page with no preconnects, or one still holding the comment.
      if (!html.includes(PRECONNECTS_MARKER)) throw new Error(`index.html has no ${PRECONNECTS_MARKER} marker`)
      return html.replace(PRECONNECTS_MARKER, () => preconnectLinks(env).join('\n    '))
    },
  }
}

// The sentry CLI (0.49) sees a chunk's debug ID only in quotes, and the minifier turns them into backticks, so the CLI
// prepends a second snippet to each upload and every frame maps a line off. A one-for-one swap leaves the maps valid.
const DEBUG_ID_IN_BACKTICKS = /(\._sentryDebugIds\[[$\w]+\]=)`([0-9a-f-]{36})`/
const QUOTED_DEBUG_ID = /\._sentryDebugIds\[[$\w]+\]="[0-9a-f-]{36}"/
const quoteSentryDebugIds = (): Plugin => ({
  name: 'quote-sentry-debug-ids',
  generateBundle(_, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== 'chunk' || !chunk.code.includes('sentry-dbid-')) continue
      chunk.code = chunk.code.replace(DEBUG_ID_IN_BACKTICKS, '$1"$2"')
      // Fail loudly: a snippet the CLI can't see uploads maps that miss every frame, and the build still says success.
      if (!QUOTED_DEBUG_ID.test(chunk.code))
        throw new Error(`Sentry's debug ID snippet changed shape in ${chunk.fileName}`)
    }
  },
})

// `telemetry: false` below covers the plugin but not the sentry CLI it uploads through, which reports on its own.
process.env.SENTRY_CLI_NO_TELEMETRY ??= '1'

export default defineConfig({
  // react-draggable (via react-grid-layout) reads process.env.DRAGGABLE_DEBUG at
  // runtime, which throws "process is not defined" in the browser. Statically
  // replace it so dragging/resizing tiles works.
  define: {
    'process.env.DRAGGABLE_DEBUG': 'false',
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
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
          // Dynamically imported by checkout.ts alone; in vendor-misc every visitor pays for it
          // on first paint.
          if (id.includes('/dodopayments-checkout/')) return 'vendor-checkout'
          // Own chunk so ~120KB of artwork caches separately.
          if (id.includes('/@dicebear/')) return 'vendor-avatars'
          if (id.includes('/lucide-react/')) return 'vendor-icons'
          if (id.includes('/@base-ui/')) return 'vendor-base-ui'
          if (id.includes('/tailwind-merge/') || id.includes('/class-variance-authority/') || id.includes('/clsx/')) {
            return 'vendor-style-utils'
          }
          if (ROUTE_ONLY_PACKAGES.test(id)) return

          return 'vendor-misc'
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    faviconFromLogo(),
    alignYDomainToAxisTicks(),
    preconnects(),
    // Uploads hidden source maps and keeps them out of dist. Off without a token, so CI and local builds don't change.
    sentryVitePlugin({
      disable: !process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      // MapLibre's worker is bundled outside the plugin, so its map would otherwise ship.
      sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
    }),
    quoteSentryDebugIds(),
  ],
})
