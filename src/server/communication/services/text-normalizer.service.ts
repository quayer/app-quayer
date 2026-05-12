/**
 * text-normalizer.service — Sanitiza texto antes de mandar para o LLM.
 *
 * 3 funcoes pure:
 *   - isBinaryGarbage(text): detecta lixo binario / base64 contiguo longo
 *   - cleanMessage(text): trim, remove chars de controle, colapsa espacos
 *   - normalizeForAI(message): escolhe entre transcription/content, aplica
 *                              cleanMessage, e retorna "[mensagem ilegivel]"
 *                              se o conteudo for lixo binario.
 *
 * Inspirado em granvinhas/process-message/utils/text.ts, ajustado para o
 * pipeline do Quayer (mensagem com type/content/transcription opcional).
 */

const NON_PRINTABLE_THRESHOLD = 0.4
const BASE64_CONTIGUOUS_LIMIT = 200
// Aceitamos ASCII printable (0x20-0x7E), espaco, quebra, tab e Latin-1
// estendido (acentos PT-BR e afins).
 
const PRINTABLE_REGEX = /[\x20-\x7E -ɏ\n\t\r]/g
const BASE64_CHARS_REGEX = /^[A-Za-z0-9+/=]+$/

/**
 * Heuristica: texto e "lixo binario" se a maioria dos chars nao for printable
 * OU se houver bloco base64 contiguo (sem espaco) muito longo.
 */
export function isBinaryGarbage(text: string): boolean {
  if (!text || text.length === 0) return false

  const printable = text.match(PRINTABLE_REGEX) ?? []
  const printableRatio = printable.length / text.length

  if (printableRatio < 1 - NON_PRINTABLE_THRESHOLD) {
    // mais de 40% nao-printable
    return true
  }

  // Base64 contiguo longo (sem espaco) — provavel binario codificado
  const longestNonSpace = text
    .split(/\s+/)
    .reduce((max, chunk) => (chunk.length > max ? chunk.length : max), 0)

  if (longestNonSpace > BASE64_CONTIGUOUS_LIMIT) {
    // valida se eh realmente char-set base64
    const candidate = text.split(/\s+/).find((c) => c.length > BASE64_CONTIGUOUS_LIMIT)
    if (candidate && BASE64_CHARS_REGEX.test(candidate)) {
      return true
    }
  }

  return false
}

/**
 * Limpa string para envio ao LLM:
 *  - trim
 *  - remove caracteres de controle (chars < 32) exceto \n e \t
 *  - colapsa espacos/tabs/multi-spaces (mas mantem \n)
 */
export function cleanMessage(text: string): string {
  if (!text || typeof text !== 'string') return ''

  // 1. Remove chars de controle exceto \n (0x0A) e \t (0x09)
   
  let result = text.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')

  // 2. Colapsa espacos horizontais multiplos (preservando \n)
  result = result.replace(/[ \f\v]+/g, ' ')

  // 3. Trim final
  result = result.trim()

  return result
}

interface NormalizableMessage {
  content: string | null
  type?: string | null
  transcription?: string | null
}

const MEDIA_TYPES_WITH_TRANSCRIPTION = new Set(['audio', 'video'])

/**
 * Decide qual campo enviar para o LLM e aplica saneamento.
 * Ordem de preferencia:
 *   1. message.transcription (se type for audio/video e existir)
 *   2. message.content
 * Aplica cleanMessage no resultado. Se o resultado limpo for "binario", devolve
 * sentinela explicito "[mensagem ilegivel]" para o LLM nao tentar interpretar.
 */
export function normalizeForAI(message: NormalizableMessage): string {
  const type = (message.type ?? '').toLowerCase()
  const useTranscription =
    MEDIA_TYPES_WITH_TRANSCRIPTION.has(type) && !!message.transcription

  const source = useTranscription ? message.transcription : message.content
  if (!source) return ''

  // Detecta lixo binario ANTES da limpeza para nao mascarar o problema
  if (isBinaryGarbage(source)) {
    return '[mensagem ilegivel]'
  }

  return cleanMessage(source)
}
