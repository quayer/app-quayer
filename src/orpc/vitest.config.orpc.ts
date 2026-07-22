/**
 * Config vitest dedicado ao spike (o include do vitest.config.ts raiz não
 * cobre src/orpc/ e o spike não deve tocar arquivos fora do seu escopo).
 *
 * Rodar: npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    // Dual-package hazard do link file: do @caravela/core — força UMA cópia
    // dos pacotes @orpc (a do app) para procedures Caravela e handler
    // compartilharem a mesma instância.
    dedupe: ['@orpc/server', '@orpc/client', '@orpc/contract', '@orpc/openapi', '@orpc/openapi-client', '@orpc/zod'],
    alias: {
      '@': path.resolve(__dirname, '../'),
    },
  },
  test: {
    name: 'orpc',
    environment: 'node',
    globals: false,
    testTimeout: 30000,
    // src/orpc = infra compartilhada; *.orpc.test.ts = testes colocalizados
    // dos routers migrados (padrão a partir do departments).
    include: ['src/orpc/**/*.test.ts', 'src/**/*.orpc.test.ts'],
  },
})
