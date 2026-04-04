import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
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
