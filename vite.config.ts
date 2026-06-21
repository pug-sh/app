import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
          if (id.includes('/recharts/')) return 'vendor-charts'
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
  plugins: [react(), tailwindcss()],
})
