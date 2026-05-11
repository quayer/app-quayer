#!/usr/bin/env tsx
/**
 * Synthetic canary: full signup-OTP roundtrip against a deployed environment.
 *
 * Flow:
 *   1. POST /api/v1/auth/signup-otp { email: canary+{ts}@mailosaur, name }
 *   2. Poll Mailosaur for the OTP email (15s timeout)
 *   3. Extract 6-digit OTP from email body
 *   4. POST /api/v1/auth/verify-signup-otp { email, code }
 *   5. Expect 200 + access token cookie
 *   6. POST /api/v1/auth/logout (cleanup so the canary user doesn't accumulate sessions)
 *
 * Required env:
 *   - CANARY_BASE_URL          e.g. https://homol.quayer.com
 *   - MAILOSAUR_API_KEY        Mailosaur API key
 *   - MAILOSAUR_SERVER_ID      server id (the "<id>" in canary@<id>.mailosaur.net)
 *
 * Exits 0 on success, 1 on any failure with a clear error message on stderr.
 *
 * Usage:
 *   tsx test/canary/signup-roundtrip.ts
 */

const BASE_URL = process.env.CANARY_BASE_URL
const MAILOSAUR_API_KEY = process.env.MAILOSAUR_API_KEY
const MAILOSAUR_SERVER_ID = process.env.MAILOSAUR_SERVER_ID
const MAILOSAUR_HOST = process.env.MAILOSAUR_HOST ?? 'mailosaur.net'

function required(name: string, value: string | undefined): string {
  if (!value) {
    console.error(`[canary] missing required env: ${name}`)
    process.exit(2)
  }
  return value
}

interface MailosaurMessage {
  id: string
  received: string
  subject: string
  html?: { body?: string }
  text?: { body?: string }
}

async function fetchLatestMailosaurMessage(
  sentTo: string,
  apiKey: string,
  serverId: string,
  timeoutMs = 30000,
): Promise<MailosaurMessage> {
  const deadline = Date.now() + timeoutMs
  const sinceIso = new Date(Date.now() - 60_000).toISOString()
  const auth = 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64')

  while (Date.now() < deadline) {
    const res = await fetch(
      `https://mailosaur.com/api/messages/await?server=${serverId}&sentTo=${encodeURIComponent(sentTo)}&receivedAfter=${encodeURIComponent(sinceIso)}`,
      { headers: { Authorization: auth }, signal: AbortSignal.timeout(timeoutMs) },
    )
    if (res.status === 200) {
      return (await res.json()) as MailosaurMessage
    }
    if (res.status === 204) {
      await new Promise((r) => setTimeout(r, 1000))
      continue
    }
    throw new Error(`Mailosaur returned ${res.status}: ${await res.text()}`)
  }
  throw new Error(`Mailosaur: no email for ${sentTo} within ${timeoutMs}ms`)
}

function extractOtp(content: string): string {
  const m = content.match(/\b(\d{6})\b/)
  if (!m) throw new Error('Could not find 6-digit OTP in email content')
  return m[1]!
}

interface JsonResponse {
  status: number
  body: unknown
  setCookies: string[]
}

async function postJson(url: string, body: unknown, cookies: string[] = []): Promise<JsonResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'QuayerCanary/1.0 (+github-actions)',
  }
  if (cookies.length) headers.Cookie = cookies.join('; ')

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  const setCookies = res.headers.getSetCookie?.() ?? []
  let parsed: unknown
  const text = await res.text()
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text
  }
  return { status: res.status, body: parsed, setCookies }
}

async function main() {
  const baseUrl = required('CANARY_BASE_URL', BASE_URL).replace(/\/$/, '')
  const apiKey = required('MAILOSAUR_API_KEY', MAILOSAUR_API_KEY)
  const serverId = required('MAILOSAUR_SERVER_ID', MAILOSAUR_SERVER_ID)

  const tag = Date.now().toString(36)
  const email = `canary+${tag}@${serverId}.${MAILOSAUR_HOST}`
  const name = `Canary ${tag}`

  console.log(`[canary] target=${baseUrl}`)
  console.log(`[canary] email=${email}`)

  // 1. Request signup OTP
  const t0 = Date.now()
  const signup = await postJson(`${baseUrl}/api/v1/auth/signup-otp`, { email, name })
  console.log(`[canary] signupOTP status=${signup.status} (${Date.now() - t0}ms)`)
  if (signup.status >= 500) {
    console.error('[canary] FAIL: signup-otp returned 5xx', JSON.stringify(signup.body))
    process.exit(1)
  }
  // 4xx is acceptable if Turnstile is required and we don't have a token —
  // the canary is testing that the endpoint is alive and not 5xx. For a
  // full roundtrip you must provision a Turnstile bypass or whitelist the
  // canary user agent server-side.
  if (signup.status >= 400) {
    console.error(`[canary] non-2xx signup (${signup.status}). Need Turnstile bypass for canary UA.`)
    console.error(JSON.stringify(signup.body))
    process.exit(1)
  }

  // 2. Read Mailosaur inbox
  let message: MailosaurMessage
  try {
    message = await fetchLatestMailosaurMessage(email, apiKey, serverId, 60000)
  } catch (err) {
    console.error('[canary] FAIL: Mailosaur read', (err as Error).message)
    process.exit(1)
  }
  const content = (message.html?.body ?? '') + ' ' + (message.text?.body ?? '')
  console.log(`[canary] mailosaur subject="${message.subject}" id=${message.id}`)

  // 3. Extract OTP
  const code = extractOtp(content)
  console.log(`[canary] OTP extracted len=${code.length}`)

  // 4. Verify OTP
  const verify = await postJson(`${baseUrl}/api/v1/auth/verify-signup-otp`, { email, code })
  console.log(`[canary] verifySignupOTP status=${verify.status}`)
  if (verify.status !== 200) {
    console.error('[canary] FAIL: verify-signup-otp did not return 200', JSON.stringify(verify.body))
    process.exit(1)
  }
  const accessCookie = verify.setCookies.find((c) => c.startsWith('access_token='))
  if (!accessCookie) {
    console.error('[canary] FAIL: no access_token cookie in verify response')
    process.exit(1)
  }

  // 5. Logout cleanup
  const logout = await postJson(`${baseUrl}/api/v1/auth/logout`, { everywhere: true }, verify.setCookies)
  console.log(`[canary] logout status=${logout.status}`)

  console.log(`[canary] OK total=${Date.now() - t0}ms`)
  process.exit(0)
}

main().catch((err) => {
  console.error('[canary] FAIL (uncaught):', err)
  process.exit(1)
})
