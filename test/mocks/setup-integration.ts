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
