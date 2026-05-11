/**
 * MSW handlers for uazapi (WhatsApp) endpoints hit by
 * src/lib/uaz/whatsapp-otp.ts.
 *
 * Stubbed endpoint:
 *   POST {UAZAPI_BASE_URL}/message/sendText/{instanceId}
 *
 * We match on the URL path suffix so the same handler works regardless of
 * whether tests set UAZAPI_URL to api.uazapi.com (default) or a custom host.
 *
 * The send log is exposed via `getUazapiSends()` so tests can assert what
 * was "sent" without depending on the network response itself.
 */

import { http, HttpResponse } from 'msw'

export interface UazapiSendRecord {
  url: string
  instanceId: string
  number: string
  text: string
  rawBody: unknown
}

const sends: UazapiSendRecord[] = []
let nextFailure: { status: number; body: unknown } | null = null

export function getUazapiSends(): readonly UazapiSendRecord[] {
  return sends
}

export function setUazapiFailure(status: number, body: unknown): void {
  nextFailure = { status, body }
}

export function resetUazapiMocks(): void {
  sends.length = 0
  nextFailure = null
}

export const uazapiHandlers = [
  http.post(/\/message\/sendText\/[^/]+$/, async ({ request }) => {
    const url = request.url
    const instanceId = url.split('/').pop() ?? 'unknown'
    let rawBody: unknown
    let number = ''
    let text = ''
    try {
      rawBody = await request.json()
      if (rawBody && typeof rawBody === 'object') {
        const obj = rawBody as Record<string, unknown>
        number = typeof obj.number === 'string' ? obj.number : ''
        text = typeof obj.text === 'string' ? obj.text : ''
      }
    } catch {
      rawBody = null
    }

    sends.push({ url, instanceId, number, text, rawBody })

    if (nextFailure) {
      const f = nextFailure
      nextFailure = null
      return HttpResponse.json(f.body, { status: f.status })
    }

    return HttpResponse.json({
      success: true,
      messageId: `mock-msg-${Date.now()}`,
      status: 'sent',
    })
  }),
]
