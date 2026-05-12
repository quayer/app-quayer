/**
 * webhook-extractor.service — Aceita webhook UAZ em formato RAW (cru) OU
 * NORMALIZED (objeto que ja foi pre-processado por outro middleware) e
 * converte para `NormalizedWebhook`, formato unico do runtime.
 *
 * Diferente da versao completa em granvinhas (que tinha CHATWOOT + META +
 * NAO_OFICIAL e ~1100 LOC), aqui o foco e UAZ + passthrough de objetos ja
 * normalizados. Suficiente para o pipeline atual do Quayer.
 *
 * Uso:
 *   if (isRawWebhook(body)) ...
 *   const normalized = extractFromWebhook(body)
 */

export type WebhookMessageType =
  | 'text'
  | 'audio'
  | 'image'
  | 'video'
  | 'document'
  | 'location'

export interface NormalizedWebhook {
  instanceId?: string
  token?: string
  direction: 'IN' | 'OUT'
  messageId: string
  contactPhone: string
  type: WebhookMessageType
  content: string
  mediaUrl?: string
  mediaMimetype?: string
  raw: unknown
}

const VALID_TYPES: ReadonlySet<WebhookMessageType> = new Set([
  'text',
  'audio',
  'image',
  'video',
  'document',
  'location',
])

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Detecta se o body veio cru da UAZ (event === "messages" e data presente).
 */
export function isRawWebhook(body: unknown): boolean {
  if (!isObject(body)) return false
  if (body.event !== 'messages') return false
  return isObject(body.data)
}

// ---------------------------------------------------------------------------
// RAW extraction
// ---------------------------------------------------------------------------

function extractTypeAndMedia(
  data: Record<string, unknown>,
): {
  type: WebhookMessageType
  content: string
  mediaUrl?: string
  mediaMimetype?: string
} {
  const rawType = String(data.type ?? 'text').toLowerCase() as WebhookMessageType
  const type = VALID_TYPES.has(rawType) ? rawType : 'text'

  let content = ''
  let mediaUrl: string | undefined
  let mediaMimetype: string | undefined

  switch (type) {
    case 'text': {
      const text = data.text as { body?: string } | undefined
      content = text?.body ?? (typeof data.body === 'string' ? data.body : '')
      break
    }
    case 'audio': {
      const audio = data.audio as { url?: string; mimetype?: string } | undefined
      mediaUrl = audio?.url
      mediaMimetype = audio?.mimetype
      content = ''
      break
    }
    case 'image': {
      const image = data.image as
        | { url?: string; mimetype?: string; caption?: string }
        | undefined
      mediaUrl = image?.url
      mediaMimetype = image?.mimetype
      content = image?.caption ?? ''
      break
    }
    case 'video': {
      const video = data.video as
        | { url?: string; mimetype?: string; caption?: string }
        | undefined
      mediaUrl = video?.url
      mediaMimetype = video?.mimetype
      content = video?.caption ?? ''
      break
    }
    case 'document': {
      const doc = data.document as
        | { url?: string; mimetype?: string; filename?: string; caption?: string }
        | undefined
      mediaUrl = doc?.url
      mediaMimetype = doc?.mimetype
      content = doc?.caption ?? doc?.filename ?? ''
      break
    }
    case 'location': {
      const loc = data.location as
        | { latitude?: number; longitude?: number; name?: string }
        | undefined
      if (loc) {
        const head = loc.name ? `${loc.name}: ` : 'Localizacao: '
        content = `${head}${loc.latitude},${loc.longitude}`
      }
      break
    }
  }

  return { type, content, mediaUrl, mediaMimetype }
}

function extractRaw(body: Record<string, unknown>): NormalizedWebhook | null {
  const data = body.data as Record<string, unknown> | undefined
  if (!isObject(data)) return null

  const messageId = String(data.id ?? '')
  const contactPhone = String(data.from ?? '')
  if (!messageId && !contactPhone) return null

  const fromMe = Boolean(data.fromMe)
  const direction: 'IN' | 'OUT' = fromMe ? 'OUT' : 'IN'

  const { type, content, mediaUrl, mediaMimetype } = extractTypeAndMedia(data)

  return {
    instanceId:
      typeof body.instance === 'string'
        ? body.instance
        : typeof body.instanceId === 'string'
          ? body.instanceId
          : undefined,
    token: typeof body.token === 'string' ? body.token : undefined,
    direction,
    messageId,
    contactPhone,
    type,
    content,
    mediaUrl,
    mediaMimetype,
    raw: body,
  }
}

// ---------------------------------------------------------------------------
// Normalized passthrough
// ---------------------------------------------------------------------------

function looksNormalized(body: Record<string, unknown>): boolean {
  return (
    typeof body.messageId === 'string' &&
    typeof body.contactPhone === 'string' &&
    body.messageId.length > 0 &&
    body.contactPhone.length > 0
  )
}

function passthroughNormalized(body: Record<string, unknown>): NormalizedWebhook | null {
  if (!looksNormalized(body)) return null
  const rawType = String(body.type ?? 'text').toLowerCase() as WebhookMessageType
  const type = VALID_TYPES.has(rawType) ? rawType : 'text'
  const direction = body.direction === 'OUT' ? 'OUT' : 'IN'

  return {
    instanceId: typeof body.instanceId === 'string' ? body.instanceId : undefined,
    token: typeof body.token === 'string' ? body.token : undefined,
    direction,
    messageId: String(body.messageId),
    contactPhone: String(body.contactPhone),
    type,
    content: typeof body.content === 'string' ? body.content : '',
    mediaUrl: typeof body.mediaUrl === 'string' ? body.mediaUrl : undefined,
    mediaMimetype:
      typeof body.mediaMimetype === 'string' ? body.mediaMimetype : undefined,
    raw: 'raw' in body ? body.raw : body,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converte body cru ou ja-normalizado em `NormalizedWebhook`. Retorna `null`
 * se o input nao for objeto ou nao tiver campos minimos para ser util.
 */
export function extractFromWebhook(body: unknown): NormalizedWebhook | null {
  if (!isObject(body)) return null

  if (isRawWebhook(body)) {
    return extractRaw(body)
  }

  return passthroughNormalized(body)
}
