import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Extends the app's vite config rather than restating it, so tests resolve '@/...' through the same
// alias the app builds with: a second copy would drift the day someone adds one.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
      restoreMocks: true,
      env: {
        // transport throws at module scope without it, so CI (no .env) fails on the import alone.
        VITE_API_BASE_URL: 'http://vitest.invalid',
        // Tests run as production does unless they stub otherwise, and a developer's .env can't change the result.
        VITE_PUG_SERVICES_ENABLED: 'true',
        VITE_THEME_REPOSITORY: '',
      },
    },
  }),
)
