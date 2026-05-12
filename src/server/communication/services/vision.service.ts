/**
 * Vision Service — descreve imagens e PDFs via OpenAI Vision (GPT-4o)
 *
 * Recebe uma imagem (ou PDF) do WhatsApp e retorna a descricao textual que
 * vai entrar no prompt do agente. Diferente de transcription.service, este
 * servico retorna sempre um VisionResult — success=false comunica o motivo
 * da falha para o caller decidir o fallback.
 */

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const MAX_IMAGE_BYTES = 20 * 1024 * 1024 // 20MB — limite pratico da Vision API.
const DEFAULT_PROMPT = 'Descreva esta imagem em detalhes em portugues.'
const DEFAULT_MODEL = 'gpt-4o-mini'

export interface VisionOptions {
  imagePrompt?: string
  visionModel?: string
  enabled?: boolean
  mediaBase64?: string
}

export interface VisionResult {
  success: boolean
  text?: string
  method?: 'vision' | 'fallback'
  type?: 'image' | 'pdf' | 'video' | 'unknown'
  error?: string
}

/** Classifica o tipo de midia para o campo `type` do resultado. */
function classifyMedia(mimetype: string): VisionResult['type'] {
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype === 'application/pdf') return 'pdf'
  if (mimetype.startsWith('video/')) return 'video'
  return 'unknown'
}

/** Aceita imagens e PDFs; recusa o resto. */
function isSupported(mimetype: string): boolean {
  return mimetype.startsWith('image/') || mimetype === 'application/pdf'
}

/**
 * Converte ArrayBuffer para data URL base64. Usamos chunks pequenos pra
 * evitar estouro de stack ao chamar String.fromCharCode com arrays grandes.
 */
function arrayBufferToDataUrl(buffer: ArrayBuffer, contentType: string): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  // btoa existe em Node 16+ e no edge runtime do Next.
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(binary, 'binary').toString('base64')
  return `data:${contentType};base64,${base64}`
}

/**
 * Chama OpenAI Chat Completions com payload de vision. Lanca em caso de erro
 * HTTP — o caller envolve em try/catch e converte em VisionResult.
 */
async function callVisionApi(
  imageDataUrl: string,
  prompt: string,
  model: string,
  openaiApiKey: string
): Promise<string> {
  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: imageDataUrl, detail: 'high' },
            },
          ],
        },
      ],
      max_tokens: 2000,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI Vision API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

/**
 * Monta o data URL a partir da base64 fornecida. Aceita tanto base64 puro
 * quanto data URL completa.
 */
function base64ToDataUrl(base64: string, mimetype: string): string {
  if (base64.startsWith('data:')) return base64
  return `data:${mimetype};base64,${base64}`
}

/**
 * Processa imagem (ou PDF) e retorna texto descritivo para o LLM.
 *
 * Em PDFs, tentamos Vision como fallback de OCR — funciona para a primeira
 * pagina/imagem renderizada, mas nao substitui extracao real de texto. Caller
 * pode tratar PDFs grandes upstream.
 */
export async function processImage(
  mediaUrl: string,
  mimetype: string,
  openaiApiKey: string,
  options: VisionOptions = {}
): Promise<VisionResult> {
  const {
    imagePrompt = DEFAULT_PROMPT,
    visionModel = DEFAULT_MODEL,
    enabled = true,
    mediaBase64,
  } = options

  if (!enabled) {
    return { success: false, error: 'disabled' }
  }

  if (!isSupported(mimetype)) {
    return { success: false, error: 'unsupported' }
  }

  const type = classifyMedia(mimetype)

  try {
    let imageDataUrl: string

    if (mediaBase64) {
      // Caller ja tem base64 (ex.: webhook entregou inline) — pula download.
      imageDataUrl = base64ToDataUrl(mediaBase64, mimetype)
    } else {
      // Baixa a midia da URL (geralmente CDN do WhatsApp).
      let downloadResponse: Response
      try {
        downloadResponse = await fetch(mediaUrl)
      } catch (err) {
        return {
          success: false,
          type,
          error: `download failed: ${err instanceof Error ? err.message : String(err)}`,
        }
      }

      if (!downloadResponse.ok) {
        return {
          success: false,
          type,
          error: `download failed: ${downloadResponse.status}`,
        }
      }

      const buffer = await downloadResponse.arrayBuffer()
      if (buffer.byteLength > MAX_IMAGE_BYTES) {
        return {
          success: false,
          type,
          error: `media too large (>20MB): ${buffer.byteLength} bytes`,
        }
      }

      const contentType =
        downloadResponse.headers.get('content-type') || mimetype
      imageDataUrl = arrayBufferToDataUrl(buffer, contentType)
    }

    const text = await callVisionApi(
      imageDataUrl,
      imagePrompt,
      visionModel,
      openaiApiKey
    )

    if (!text) {
      // PDF escaneado vazio ou modelo nao conseguiu extrair — fallback.
      return {
        success: false,
        type,
        method: 'fallback',
        error: 'empty vision response',
      }
    }

    return {
      success: true,
      text,
      method: 'vision',
      type,
    }
  } catch (error) {
    return {
      success: false,
      type,
      error: error instanceof Error ? error.message : 'unknown vision error',
    }
  }
}
