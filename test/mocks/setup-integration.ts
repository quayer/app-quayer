/**
 * Vitest setup file for integration tests (vitest.config.integration.ts).
 *
 * Starts the MSW node server so outbound calls to Google, uazapi, and
 * other external services are intercepted. Unhandled outbound requests
 * raise an error so the test fails fast instead of silently hitting the
 * real internet.
 *
 * NOTE: the dev/local Next.js server is left alone — only requests made
 * by code under test (inside this Vitest process) are intercepted.
 */

// ---------------------------------------------------------------------------
// Ambiente determinístico da suíte de integração.
//
// A suíte NÃO depende de um .env de desenvolvedor: os secrets abaixo são
// valores sintéticos de teste (mesmo padrão dos testes unitários, que os
// definem inline). Sem eles, os handlers de auth respondem 500
// ("JWT_MAGIC_LINK_SECRET is required" etc.) e a suíte fica vermelha por
// configuração, não por regressão. Todos são `??=` — um valor já exportado
// no shell vence.
//
// DATABASE_URL: o app sob teste (singleton de src/server/services/database)
// lê DATABASE_URL; as factories leem TEST_DATABASE_URL. Integração SEMPRE
// aponta o app para o banco de teste (compose.test.yml, porta 5433) — nunca
// para um banco de dev de um .env local.
// ---------------------------------------------------------------------------
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://quayer_test:quayer_test@localhost:5433/quayer_test?schema=public'
process.env.TEST_DATABASE_URL = TEST_DB_URL
process.env.DATABASE_URL = TEST_DB_URL

process.env.JWT_SECRET ??= 'integration-test-jwt-0123456789-abcdefghijklmn'
process.env.JWT_REFRESH_SECRET ??= 'integration-test-refresh-0123456789-abcdefgh'
process.env.JWT_MAGIC_LINK_SECRET ??= 'integration-test-magiclink-0123456789-abcdef'
process.env.ENCRYPTION_KEY ??= 'integration-test-encryption-key-32ch'

import { afterAll, afterEach, beforeAll } from 'vitest'
import { server, resetExternalMocks } from './server'

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  resetExternalMocks()
})

afterAll(() => {
  server.close()
})
