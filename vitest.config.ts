import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    env: loadEnv(mode, process.cwd(), ''),
    globalSetup: ['./__tests__/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Playwright specs live in e2e/ and run under `npm run test:e2e`.
    exclude: ['**/node_modules/**', '**/.next/**', 'e2e/**', 'playwright.config.ts'],
  },
}))
