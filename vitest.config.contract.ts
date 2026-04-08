/**
 * Vitest config for the CONTRACT test layer (US-108).
 *
 * Contract tests live under `test/contract/**` and validate that backend
 * response SHAPES match what the frontend expects. They run against a
 * live dev server (default `http://localhost:3000`) and read no DB state.
 *
 * Run with:
 *   npx vitest --config vitest.config.contract.ts
 *
 * Snapshots are stored next to each test in `__snapshots__/`. Never edit
 * them by hand — regenerate with `--update-snapshots` after a deliberate
 * contract change. See docs/auth/CONTRACT_TESTING.md.
 */
import { config } from 'dotenv'
config()

import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/contract/**/*.contract.test.ts'],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
