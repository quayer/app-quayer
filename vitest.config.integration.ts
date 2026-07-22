import { config } from 'dotenv'
config()

import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/mocks/setup-integration.ts'],
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30000,
    reporters: [
      'default',
      ['json', { outputFile: 'test-results/vitest-integration.json' }],
    ],
    outputFile: { json: 'test-results/vitest-integration.json' },
  },
  resolve: {
    // Dual-package hazard do link file: do @caravela/core — força UMA cópia
    // dos pacotes @orpc (a do app) para procedures Caravela e handler
    // compartilharem a mesma instância.
    dedupe: ['@orpc/server', '@orpc/client', '@orpc/contract', '@orpc/openapi', '@orpc/openapi-client', '@orpc/zod'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
