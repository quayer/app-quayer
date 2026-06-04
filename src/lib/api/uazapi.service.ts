interface UazapiResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// Resolução em cadeia: nome canônico (UAZAPI_*) tem precedência;
// nomes intermediário (UAZAPI_URL) e legado (UAZ_API_*) ficam como fallback
// para não quebrar dev local nem ambientes que ainda não migraram.
function getAdminToken(): string | undefined {
  return process.env.UAZAPI_ADMIN_TOKEN ?? process.env.UAZ_API_KEY
}

function getBaseUrl(): string {
  return (
    process.env.UAZAPI_BASE_URL ??
    process.env.UAZAPI_URL ??
    process.env.UAZ_API_URL ??
    'https://api.uazapi.com'
  )
}

export const uazapiService = {
  async createInstance(name: string): Promise<UazapiResult<{ token: string; instance?: { id: string } }>> {
    const apiKey = getAdminToken()
    const baseUrl = getBaseUrl()
    if (!apiKey) return { success: false, error: 'UAZAPI_ADMIN_TOKEN not configured' }

    try {
      const res = await fetch(`${baseUrl}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ instanceName: name }),
      })
      const data = await res.json()
      return { success: res.ok, data, error: res.ok ? undefined : data?.message }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  async generateQR(token: string): Promise<UazapiResult<{ qrcode: string }>> {
    const baseUrl = getBaseUrl()
    try {
      const res = await fetch(`${baseUrl}/instance/connect`, {
        method: 'GET',
        headers: { apikey: token },
      })
      const data = await res.json()
      return { success: res.ok, data, error: res.ok ? undefined : data?.message }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  /**
   * Registra (upsert) a URL de webhook na instância UAZAPI.
   *
   * Sem isso, a instância criada pela saga NUNCA entrega mensagem ao nosso
   * `/api/v1/webhooks/uazapi` — era o buraco que deixava o agente "publicado"
   * mudo. O secret viaja na query (`?secret=`) porque a UAZAPI não garante
   * envio de header customizado; o webhook aceita header OU query.
   *
   * ⚠️ Contrato a confirmar no E2E (Wave 7): o shape do body de `POST /webhook`
   * varia entre versões da UAZAPI. Mantido best-effort (nunca aborta o deploy).
   */
  async setWebhook(
    token: string,
    webhookUrl: string,
  ): Promise<UazapiResult> {
    const baseUrl = getBaseUrl()
    try {
      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: token },
        body: JSON.stringify({
          url: webhookUrl,
          enabled: true,
          // Eventos mínimos que o runtime consome: mensagens + estado da conexão.
          events: ['messages', 'connection'],
        }),
      })
      const data = await res.json().catch(() => ({}))
      return { success: res.ok, data, error: res.ok ? undefined : data?.message }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
}

/**
 * Monta a URL pública do webhook inbound da UAZAPI com o secret na query.
 * O handler em `/api/v1/webhooks/uazapi` aceita o secret via header
 * `x-webhook-secret` OU via `?secret=` (fallback) — ver route.ts.
 */
export function buildUazapiWebhookUrl(): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const secret = process.env.UAZAPI_WEBHOOK_SECRET
  if (!appUrl || !secret) return null
  return `${appUrl.replace(/\/$/, '')}/api/v1/webhooks/uazapi?secret=${encodeURIComponent(secret)}`
}
