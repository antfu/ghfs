import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // The root package does not depend on vue, but the UI does. Point
      // tests at the copy pnpm already installed for it.
      vue: fromRoot('./node_modules/.pnpm/node_modules/vue'),
    },
  },
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'playgrounds/**',
      'tests/e2e/**',
    ],
  },
})
