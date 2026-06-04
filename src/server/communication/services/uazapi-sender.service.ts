/**
 * uazapi-sender — serviço low-level de envio outbound via UAZapi.
 *
 * Espelha o sender de produto-granvinhas (process-callback/services/senders/uazapi.ts)
 * mas com API ergonômica para o stack Quayer:
 *   - Funções stateless (token + baseUrl como argumentos explícitos)
 *   - Sem dependência de tipos cross-projeto
 *   - SendResult uniforme: `{ success, messageId?, error? }`
 *
 * NÃO faz:
 *   - persistência de Message
 *   - bot-echo tracking (responsabilidade do outbound orchestrator)
 *   - quebra em blocos
 *
 * Tudo que é HTTP cru fica aqui. Tudo que é orquestração fica em outbound.service.ts.
 */

export interface SendResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface SendOptions {
  /** Atraso (em ms) antes do POST — útil para simular digitação humana. */
  delayMs?: number
  /** ID da mensagem que está sendo respondida (quote/reply no WhatsApp). */
  replyToMessageId?: string
}

export interface SendButtonItem {
  id: string
  title: string
}

export interface SendListRow {
  id: string
  title: string
  description?: string
}

export interface SendListSection {
  title: string
  rows: SendListRow[]
}

export interface SendLocationPayload {
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export interface SendButtonsPayload {
  text: string
  buttons: SendButtonItem[]
}

export interface SendListPayload {
  text: string
  button: string
  sections: SendListSection[]
}

export interface SendCarouselCard {
  header_url: string
  body: string
  button_type: 'cta_url' | 'quick_reply'
  button_text: string
  button_url?: string
  buttons?: SendButtonItem[]
}

export interface SendCarouselPayload {
  text: string
  cards: SendCarouselCard[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normaliza telefone para o formato esperado pela UAZapi:
 *   - apenas dígitos
 *   - sem sufixo @s.whatsapp.net
 */
export function normalizePhone(phone: string): string {
  if (!phone) return ''
  return phone.replace('@s.whatsapp.net', '').replace(/\D/g, '')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractMessageId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const obj = data as Record<string, unknown>
  const key = obj.key as Record<string, unknown> | undefined
  const nestedData = obj.data as Record<string, unknown> | undefined

  return (
    (key?.id as string | undefined) ??
    (obj.id as string | undefined) ??
    (obj.messageId as string | undefined) ??
    (obj.messageid as string | undefined) ??
    (obj.message_id as string | undefined) ??
    (nestedData?.id as string | undefined) ??
    (nestedData?.messageId as string | undefined) ??
    (nestedData?.messageid as string | undefined) ??
    (nestedData?.message_id as string | undefined)
  )
}

function extractError(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const msg = (obj.message ?? obj.error) as string | undefined
    if (msg) return `HTTP ${status}: ${msg}`
  }
  return `HTTP ${status}`
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function postJson(
  url: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      token,
    },
    body: JSON.stringify(body),
  })
  const data = await safeJson(response)
  return { ok: response.ok, status: response.status, data }
}

async function maybeDelay(options: SendOptions): Promise<void> {
  if (options.delayMs && options.delayMs > 0) {
    await sleep(options.delayMs)
  }
}

function addReplyId(body: Record<string, unknown>, options: SendOptions): void {
  if (options.replyToMessageId) {
    body.replyid = options.replyToMessageId
  }
}

async function sendToPath(
  path: string,
  token: string,
  baseUrl: string,
  body: Record<string, unknown>,
  options: SendOptions,
): Promise<SendResult> {
  try {
    await maybeDelay(options)
    addReplyId(body, options)

    const { ok, status, data } = await postJson(`${baseUrl}${path}`, token, body)
    if (!ok) {
      return { success: false, error: extractError(data, status) }
    }
    return { success: true, messageId: extractMessageId(data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// sendText
// ---------------------------------------------------------------------------

export async function sendText(
  token: string,
  baseUrl: string,
  recipient: string,
  content: string,
  options: SendOptions = {},
): Promise<SendResult> {
  return sendToPath(
    '/send/text',
    token,
    baseUrl,
    {
      number: normalizePhone(recipient),
      text: content,
    },
    options,
  )
}

// ---------------------------------------------------------------------------
// sendImage
// ---------------------------------------------------------------------------

export async function sendImage(
  token: string,
  baseUrl: string,
  recipient: string,
  imageUrl: string,
  caption?: string,
  options: SendOptions = {},
): Promise<SendResult> {
  return sendToPath(
    '/send/image',
    token,
    baseUrl,
    {
      number: normalizePhone(recipient),
      image: imageUrl,
      imageUrl, // compat: alguns deploys UAZ aceitam camelCase
      caption: caption ?? '',
    },
    options,
  )
}

// ---------------------------------------------------------------------------
// sendAudio
// ---------------------------------------------------------------------------

export async function sendAudio(
  token: string,
  baseUrl: string,
  recipient: string,
  audioUrl: string,
  options: SendOptions = {},
): Promise<SendResult> {
  return sendToPath(
    '/send/audio',
    token,
    baseUrl,
    {
      number: normalizePhone(recipient),
      audio: audioUrl,
      audioUrl,
      mimetype: 'audio/ogg',
    },
    options,
  )
}

// ---------------------------------------------------------------------------
// sendDocument
// ---------------------------------------------------------------------------

export async function sendDocument(
  token: string,
  baseUrl: string,
  recipient: string,
  documentUrl: string,
  caption?: string,
  options: SendOptions = {},
): Promise<SendResult> {
  return sendToPath(
    '/send/document',
    token,
    baseUrl,
    {
      number: normalizePhone(recipient),
      document: documentUrl,
      documentUrl,
      caption: caption ?? '',
    },
    options,
  )
}

// ---------------------------------------------------------------------------
// sendVideo
// ---------------------------------------------------------------------------

export async function sendVideo(
  token: string,
  baseUrl: string,
  recipient: string,
  videoUrl: string,
  caption?: string,
  options: SendOptions = {},
): Promise<SendResult> {
  return sendToPath(
    '/send/video',
    token,
    baseUrl,
    {
      number: normalizePhone(recipient),
      video: videoUrl,
      videoUrl,
      caption: caption ?? '',
    },
    options,
  )
}

// ---------------------------------------------------------------------------
// sendLocation
// ---------------------------------------------------------------------------

export async function sendLocation(
  token: string,
  baseUrl: string,
  recipient: string,
  location: SendLocationPayload,
  options: SendOptions = {},
): Promise<SendResult> {
  return sendToPath(
    '/send/location',
    token,
    baseUrl,
    {
      number: normalizePhone(recipient),
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name,
      address: location.address,
    },
    options,
  )
}

// ---------------------------------------------------------------------------
// sendButtons
// ---------------------------------------------------------------------------

export async function sendButtons(
  token: string,
  baseUrl: string,
  recipient: string,
  payload: SendButtonsPayload,
  options: SendOptions = {},
): Promise<SendResult> {
  return sendToPath(
    '/send/buttons',
    token,
    baseUrl,
    {
      number: normalizePhone(recipient),
      text: payload.text,
      buttons: payload.buttons,
    },
    options,
  )
}

// ---------------------------------------------------------------------------
// sendList
// ---------------------------------------------------------------------------

export async function sendList(
  token: string,
  baseUrl: string,
  recipient: string,
  payload: SendListPayload,
  options: SendOptions = {},
): Promise<SendResult> {
  return sendToPath(
    '/send/list',
    token,
    baseUrl,
    {
      number: normalizePhone(recipient),
      text: payload.text,
      button: payload.button,
      sections: payload.sections,
    },
    options,
  )
}

// ---------------------------------------------------------------------------
// sendCarousel
// ---------------------------------------------------------------------------

export async function sendCarousel(
  token: string,
  baseUrl: string,
  recipient: string,
  payload: SendCarouselPayload,
  options: SendOptions = {},
): Promise<SendResult> {
  return sendToPath(
    '/send/carousel',
    token,
    baseUrl,
    {
      number: normalizePhone(recipient),
      text: payload.text,
      cards: payload.cards,
    },
    options,
  )
}

// ---------------------------------------------------------------------------
// sendTyping
// ---------------------------------------------------------------------------

export async function sendTyping(
  token: string,
  baseUrl: string,
  recipient: string,
  isTyping: boolean,
): Promise<boolean> {
  try {
    const body = {
      number: normalizePhone(recipient),
      presence: isTyping ? 'composing' : 'paused',
    }
    const { ok } = await postJson(`${baseUrl}/chat/presence`, token, body)
    return ok
  } catch {
    // typing é best-effort — nunca falha o pipeline.
    return false
  }
}
