/**
 * Cliente das rotas ADMIN/instância do broker UAZAPI — dialeto v2.
 *
 * DIALETO (provado por probe contra quayer.uazapi.com em 2026-06-11, e espelhando
 * o sender de produção `uazapi-sender.service.ts` que já fala v2):
 *   - Rotas ADMIN (criar instância): header `admintoken` + POST /instance/init.
 *   - Rotas DE INSTÂNCIA (connect/QR, webhook): header `token` (token da instância).
 * O código anterior usava o dialeto v1 (`apikey` + POST /instance/create) e
 * recebia 401 do broker em TODAS as chamadas — o QR nunca nasceu em homol
 * ("Missing AdminToken Header" no probe).
 *
 * Respostas são NORMALIZADAS aqui (token/instanceId/qrcode aparecem em paths
 * diferentes conforme a versão do broker) para os consumidores não conhecerem
 * o shape cru. Erros do broker vêm em `{"error": "..."}` (v2) — com fallback
 * para `message` (v1).
 */

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

function brokerError(data: unknown, fallback: string): string {
  const d = data as { error?: unknown; message?: unknown } | null
  const raw = d?.error ?? d?.message
  return typeof raw === 'string' && raw.length > 0 ? raw : fallback
}

export const uazapiService = {
  async createInstance(name: string): Promise<UazapiResult<{ token: string; instance?: { id: string } }>> {
    const adminToken = getAdminToken()
    const baseUrl = getBaseUrl()
    if (!adminToken) return { success: false, error: 'UAZAPI_ADMIN_TOKEN not configured' }

    try {
      const res = await fetch(`${baseUrl}/instance/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', admintoken: adminToken },
        // v2 usa `name`; `instanceName` (v1) vai junto por tolerância.
        body: JSON.stringify({ name, instanceName: name }),
      })
      const raw = (await res.json().catch(() => ({}))) as {
        token?: string
        instance?: { id?: string; token?: string }
        id?: string
      }
      if (!res.ok) {
        return {
          success: false,
          error: brokerError(raw, `Broker retornou HTTP ${res.status}`),
        }
      }
      const token = raw.token ?? raw.instance?.token
      if (!token) {
        return { success: false, error: 'Broker não retornou token da instância' }
      }
      const instanceId = raw.instance?.id ?? raw.id
      return {
        success: true,
        data: { token, instance: instanceId ? { id: instanceId } : undefined },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  async generateQR(token: string): Promise<UazapiResult<{ qrcode: string }>> {
    const baseUrl = getBaseUrl()
    try {
      // v2: POST /instance/connect com header `token` — body vazio gera QR
      // (com `phone` geraria paircode; não usamos).
      const res = await fetch(`${baseUrl}/instance/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token },
        body: JSON.stringify({}),
      })
      const raw = (await res.json().catch(() => ({}))) as {
        qrcode?: string
        instance?: { qrcode?: string }
      }
      if (!res.ok) {
        return {
          success: false,
          error: brokerError(raw, `Broker retornou HTTP ${res.status}`),
        }
      }
      const qrcode = raw.qrcode ?? raw.instance?.qrcode
      if (!qrcode) {
        return { success: false, error: 'Broker não retornou QR code' }
      }
      return { success: true, data: { qrcode } }
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
        headers: { 'Content-Type': 'application/json', token },
        body: JSON.stringify({
          url: webhookUrl,
          enabled: true,
          // Eventos mínimos que o runtime consome: mensagens + estado da conexão.
          events: ['messages', 'connection'],
        }),
      })
      const data = await res.json().catch(() => ({}))
      return {
        success: res.ok,
        data,
        error: res.ok ? undefined : brokerError(data, `Broker retornou HTTP ${res.status}`),
      }
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
