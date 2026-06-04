/**
 * Transcription Service — Whisper audio/vídeo transcription
 *
 * Recebe um audio OU vídeo (mediaUrl + mimetype) vindo do WhatsApp, baixa, envia
 * para Whisper e retorna o texto transcrito + idioma detectado. Para vídeo, o
 * Whisper extrai e transcreve a faixa de áudio (padrão Orayon — sem ffmpeg/frames).
 * Usado pelo agente para virar fala do cliente em prompt textual antes do LLM.
 *
 * Falhas (URL/key/mime invalidos, download ou API com erro) retornam null —
 * o caller decide o fallback (ex.: pedir reenvio ao cliente).
 */

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions'

/**
 * Mapa de codigos de idioma do produto (ISO-639-1 upper) para os codigos
 * aceitos pela API do Whisper (lower). Idiomas fora deste mapa caem em
 * deteccao automatica.
 */
export const WHISPER_LANGUAGE_MAP: Record<string, string> = {
  PT: 'pt',
  EN: 'en',
  ES: 'es',
  FR: 'fr',
  DE: 'de',
  IT: 'it',
  JA: 'ja',
  ZH: 'zh',
  RU: 'ru',
  AR: 'ar',
}

export interface TranscriptionResult {
  text: string
  detectedLanguage?: string
}

/**
 * Determina a extensao do arquivo a partir do mimetype. Whisper aceita ogg,
 * mp3, wav, m4a, webm (áudio) e mp4/mpeg/webm (vídeo — extrai o áudio). Vídeo do
 * WhatsApp é tipicamente mp4; fora das conhecidas, defaultamos para ogg (áudio
 * nativo do WhatsApp).
 */
function pickExtension(mimetype: string): string {
  // Vídeo primeiro (video/mpeg não deve virar 'mp3').
  if (mimetype.startsWith('video/')) {
    return mimetype.includes('webm') ? 'webm' : 'mp4'
  }
  if (mimetype.includes('mp3') || mimetype.includes('mpeg')) return 'mp3'
  if (mimetype.includes('wav')) return 'wav'
  if (mimetype.includes('m4a')) return 'm4a'
  if (mimetype.includes('webm')) return 'webm'
  return 'ogg'
}

/**
 * Transcreve audio via Whisper. Retorna `null` em qualquer falha — incluindo
 * input invalido, falha de download ou erro da API. detectedLanguage e
 * retornado em uppercase para casar com o resto do dominio.
 */
export async function transcribeAudio(
  mediaUrl: string,
  mimetype: string,
  openaiApiKey: string,
  preferredLanguage?: string
): Promise<TranscriptionResult | null> {
  if (!mediaUrl || !openaiApiKey) {
    return null
  }

  // Aceita áudio E vídeo (Whisper extrai a faixa de áudio do vídeo).
  if (!mimetype || !(mimetype.startsWith('audio/') || mimetype.startsWith('video/'))) {
    return null
  }

  try {
    // 1. Baixar audio da URL fornecida (CDN do WhatsApp tipicamente).
    const audioResponse = await fetch(mediaUrl)
    if (!audioResponse.ok) {
      console.warn(
        `[transcription] download falhou: ${audioResponse.status}`
      )
      return null
    }

    const audioBlob = await audioResponse.blob()
    const extension = pickExtension(mimetype)

    // 2. Montar payload multipart para Whisper.
    const formData = new FormData()
    formData.append('file', audioBlob, `audio.${extension}`)
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'verbose_json')

    if (preferredLanguage && WHISPER_LANGUAGE_MAP[preferredLanguage]) {
      formData.append('language', WHISPER_LANGUAGE_MAP[preferredLanguage])
    }

    // 3. Chamar Whisper.
    const whisperResponse = await fetch(WHISPER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: formData,
    })

    if (!whisperResponse.ok) {
      console.warn(
        `[transcription] Whisper API falhou: ${whisperResponse.status}`
      )
      return null
    }

    const result = (await whisperResponse.json()) as {
      text?: string
      language?: string
    }

    const text = (result.text ?? '').trim()
    const detectedLanguage = result.language
      ? result.language.toUpperCase()
      : undefined

    return { text, detectedLanguage }
  } catch (error) {
    console.warn('[transcription] erro inesperado:', error)
    return null
  }
}
