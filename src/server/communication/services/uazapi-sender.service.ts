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
  return (key?.id as string | undefined) ?? (obj.messageId as string | undefined)
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
  try {
    if (options.delayMs && options.delayMs > 0) {
      await sleep(options.delayMs)
    }

    const body: Record<string, unknown> = {
      number: normalizePhone(recipient),
      text: content,
    }
    if (options.replyToMessageId) {
      body.replyid = options.replyToMessageId
    }

    const { ok, status, data } = await postJson(`${baseUrl}/send/text`, token, body)
    if (!ok) {
      return { success: false, error: extractError(data, status) }
    }
    return { success: true, messageId: extractMessageId(data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
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
  try {
    if (options.delayMs && options.delayMs > 0) {
      await sleep(options.delayMs)
    }

    const body: Record<string, unknown> = {
      number: normalizePhone(recipient),
      image: imageUrl,
      imageUrl, // compat: alguns deploys UAZ aceitam camelCase
      caption: caption ?? '',
    }
    if (options.replyToMessageId) {
      body.replyid = options.replyToMessageId
    }

    const { ok, status, data } = await postJson(`${baseUrl}/send/image`, token, body)
    if (!ok) {
      return { success: false, error: extractError(data, status) }
    }
    return { success: true, messageId: extractMessageId(data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
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
  try {
    if (options.delayMs && options.delayMs > 0) {
      await sleep(options.delayMs)
    }

    const body: Record<string, unknown> = {
      number: normalizePhone(recipient),
      audio: audioUrl,
      mimetype: 'audio/ogg',
    }
    if (options.replyToMessageId) {
      body.replyid = options.replyToMessageId
    }

    const { ok, status, data } = await postJson(`${baseUrl}/send/audio`, token, body)
    if (!ok) {
      return { success: false, error: extractError(data, status) }
    }
    return { success: true, messageId: extractMessageId(data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
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
