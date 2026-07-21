/**
 * Config vitest dedicado ao spike (o include do vitest.config.ts raiz não
 * cobre src/orpc-spike/ e o spike não deve tocar arquivos fora do seu escopo).
 *
 * Rodar: npx vitest run --config src/orpc-spike/vitest.config.spike.ts
 */
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../'),
    },
  },
  test: {
    name: 'orpc-spike',
    environment: 'node',
    globals: false,
    testTimeout: 30000,
    include: ['src/orpc-spike/**/*.test.ts'],
  },
})
