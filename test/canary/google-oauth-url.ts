#!/usr/bin/env tsx
/**
 * Synthetic canary: validates that POST /api/v1/auth/google returns a
 * well-formed Google OAuth authorization URL with a strong CSRF state token.
 *
 * Why we do NOT exercise the full OAuth callback in synthetic monitoring:
 *   - Google's bot detection blocks repeated automated logins, even from
 *     dedicated Workspace accounts.
 *   - The maintenance burden (consent screen changes, MFA challenges) is
 *     high relative to the marginal coverage gained.
 *   - Validating the authUrl + state contract catches ~80% of real failure
 *     modes (broken secret loading, regressed CSRF logic, wrong redirect_uri,
 *     unverified app status, expired client credentials).
 *
 * Required env:
 *   - CANARY_BASE_URL          e.g. https://homol.quayer.com
 *   - CANARY_EXPECTED_REDIRECT (optional) e.g. https://homol.quayer.com/api/v1/auth/google/callback
 *
 * Exits 0 on success, 1 on contract violation, 2 on missing env.
 */

const BASE_URL = process.env.CANARY_BASE_URL
const EXPECTED_REDIRECT = process.env.CANARY_EXPECTED_REDIRECT

function fail(msg: string): never {
  console.error(`[canary-google] FAIL: ${msg}`)
  process.exit(1)
}

async function main() {
  if (!BASE_URL) {
    console.error('[canary-google] missing CANARY_BASE_URL')
    process.exit(2)
  }
  const base = BASE_URL.replace(/\/$/, '')

  const t0 = Date.now()
  const res = await fetch(`${base}/api/v1/auth/google`, {
    method: 'GET',
    headers: { 'User-Agent': 'QuayerCanary/1.0 (+github-actions)' },
    signal: AbortSignal.timeout(10_000),
  })

  if (res.status !== 200) fail(`status=${res.status} expected=200`)

  let body: unknown
  try {
    body = await res.json()
  } catch {
    fail('non-JSON response')
  }

  const data = (body as { data?: { authUrl?: string } }).data
  if (!data || typeof data.authUrl !== 'string') fail('missing data.authUrl')

  const authUrl = data.authUrl!
  console.log(`[canary-google] authUrl (truncated): ${authUrl.slice(0, 80)}...`)

  // Contract checks
  if (!authUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth')) {
    fail(`authUrl does not target Google OAuth: ${authUrl.slice(0, 80)}`)
  }

  const url = new URL(authUrl)
  const params = url.searchParams

  const state = params.get('state')
  if (!state || state.length < 32) fail(`state too short or missing (len=${state?.length})`)

  const clientId = params.get('client_id')
  if (!clientId || !clientId.endsWith('.apps.googleusercontent.com')) {
    fail(`client_id not a valid Google client (${clientId})`)
  }

  const redirectUri = params.get('redirect_uri')
  if (!redirectUri) fail('redirect_uri missing')
  if (redirectUri.includes('localhost') || redirectUri.includes('127.0.0.1')) {
    fail(`redirect_uri points to localhost in synthetic target: ${redirectUri}`)
  }
  if (EXPECTED_REDIRECT && redirectUri !== EXPECTED_REDIRECT) {
    fail(`redirect_uri=${redirectUri} expected=${EXPECTED_REDIRECT}`)
  }

  const scope = params.get('scope') ?? ''
  if (!scope.includes('email') || !scope.includes('profile')) {
    fail(`scope missing email/profile: ${scope}`)
  }

  // Cookie check: oauth_state must be set so CSRF can be validated on callback.
  const setCookies = res.headers.getSetCookie?.() ?? []
  const hasStateCookie = setCookies.some((c) => /oauth_state=/.test(c))
  if (!hasStateCookie) {
    console.warn('[canary-google] WARN: no oauth_state cookie in response — may break CSRF on callback')
  }

  console.log(`[canary-google] OK total=${Date.now() - t0}ms state.len=${state.length}`)
  process.exit(0)
}

main().catch((err) => {
  console.error('[canary-google] FAIL (uncaught):', err)
  process.exit(1)
})
