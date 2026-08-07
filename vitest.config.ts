import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Extends the app's vite config rather than restating it, so tests resolve '@/...' through the same
// alias the app builds with — a second copy would drift the day someone adds one.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
  }),
)
