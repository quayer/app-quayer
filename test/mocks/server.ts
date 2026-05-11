/**
 * MSW Node server — intercepts outbound HTTP calls during tests so we
 * never hit real Google, uazapi, or other external services.
 *
 * Usage in a vitest integration test:
 *
 *   import { server, resetExternalMocks } from 'test/mocks/server'
 *
 *   beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
 *   afterEach(() => resetExternalMocks())
 *   afterAll(() => server.close())
 *
 * For E2E tests that hit a real Next.js server, the server-side process
 * must import this module at boot — see test/mocks/setup-integration.ts
 * for the wiring used by vitest.config.integration.ts.
 */

import { setupServer } from 'msw/node'
import { googleOAuthHandlers, resetGoogleOAuthMocks } from './handlers/google-oauth'
import { uazapiHandlers, resetUazapiMocks } from './handlers/uazapi'

export const server = setupServer(...googleOAuthHandlers, ...uazapiHandlers)

export function resetExternalMocks(): void {
  server.resetHandlers()
  resetGoogleOAuthMocks()
  resetUazapiMocks()
}

export { googleOAuthHandlers, uazapiHandlers }
export { setGoogleProfile, setGoogleTokenFailure } from './handlers/google-oauth'
export { getUazapiSends, setUazapiFailure } from './handlers/uazapi'
