/**
 * Builder Module — Image Caption Service (Onda D1, G2 visão/imagens)
 *
 * CAMINHO MULTIMODAL NOVO — `runLLMSubAgent` (sub-agents/base.ts) é TEXT-ONLY
 * (`messages: [{ role:'user', content: string }]`), então este serviço cria um
 * caminho próprio que monta `content` como array de partes `text` + `image`.
 *
 * Dado o buffer cru de uma imagem baixada (já SSRF-guarded + sniffada pelo
 * pipeline), gera uma LEGENDA curta descritiva em PT-BR via vision-LLM, para
 * compor o catálogo visual da fonte (`KnowledgeImage.caption`).
 *
 * DECISÕES (docs/builder/ONDA_D_VISION_PLAN.md):
 *   - MODELO DE VISÃO FIXO: `gpt-4o-mini` via `modelOverride` (custo previsível,
 *     sempre suporta visão — o modelo BYOK do org pode ser text-only). Resolve a
 *     credencial pelo MESMO `credentialResolver` usado pelos sub-agents.
 *   - Imagem direta no payload (sem `providerOptions.detail:'low'` — não é
 *     suportado de forma uniforme pelo AI SDK; gpt-4o-mini já é barato).
 *   - Timeout PRÓPRIO (~20s via AbortController) + try/catch total.
 *
 * FAIL-OPEN ABSOLUTO: NUNCA lança. Qualquer erro (credencial ausente, provider,
 * timeout, resposta vazia) vira `{ ok: false, error }`. O caller (image-pipeline)
 * trata caption ausente como "imagem fica sem legenda" — nunca derruba o
 * source-enrich.job, nunca muda o status da fonte, nunca bloqueia o RAG/texto.
 *
 * Contrato: docs/builder/ONDA_D_VISION_PLAN.md §pipeline-de-visão + CONTRATOS D1 §4.
 */

import { generateText } from 'ai'
import { getModel } from '@/server/ai-module/ai-agents/services/provider-factory'
import { credentialResolver } from '@/lib/providers/credential-resolver.service'
import { logger } from '@/server/services/logger'
import {
  IMAGE_CAPTION_SYSTEM,
  IMAGE_CAPTION_USER,
  CAPTION_MAX_CHARS,
} from './image-caption.prompt'

// ---------------------------------------------------------------------------
// Prompt (PT-BR): system/user/cap vivem em image-caption.prompt.ts — a versão de
// lá inclui o ISOLAMENTO DE SEGURANÇA anti-prompt-injection (a imagem é conteúdo
// NÃO CONFIÁVEL: texto na foto pedindo p/ mudar de comportamento é ignorado).
// Este serviço só orquestra a chamada multimodal + timeout + fail-open.
// ---------------------------------------------------------------------------

/** Timeout próprio da chamada de visão (ms). */
const CAPTION_TIMEOUT_MS = 20_000

// ---------------------------------------------------------------------------
// Contrato público
// ---------------------------------------------------------------------------

export interface CaptionInput {
  /** Buffer cru da imagem (já baixada SSRF-guarded + validada pelo pipeline). */
  buffer: Buffer
  /** MIME type da imagem (vem do `sniffImage(...).contentType`). */
  mimeType: string
}

export type CaptionResult =
  | { ok: true; caption: string }
  | { ok: false; error: string }

export interface CaptionContext {
  organizationId: string
  userId: string
  projectId: string
}

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

/**
 * Gera a legenda PT-BR de uma imagem via vision-LLM (gpt-4o-mini fixo).
 *
 * NUNCA lança — fail-open total. Em qualquer falha retorna `{ ok: false }`.
 */
export async function captionImage(
  input: CaptionInput,
  ctx: CaptionContext,
): Promise<CaptionResult> {
  // Guarda barata: buffer vazio não vale uma chamada paga.
  if (!input.buffer || input.buffer.length === 0) {
    return { ok: false, error: 'empty-buffer' }
  }

  try {
    // MODELO DE VISÃO FIXO — custo previsível, sempre suporta visão.
    const provider = 'openai'
    const model = 'gpt-4o-mini'

    // BYOK pelo MESMO resolver dos sub-agents. `userId` faz parte do contrato
    // (paridade de assinatura com o caminho text-only), mas a resolução é por
    // org/projeto/provider — alinhado ao runLLMSubAgent.
    const resolved = await credentialResolver.resolve('AI', provider, {
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
    })
    const apiKey = resolved?.credentials?.apiKey as string | undefined

    const llm = getModel(provider, model, apiKey)

    // Timeout próprio — não herda nenhum signal externo (caminho fire-and-forget).
    const abortController = new AbortController()
    const timeoutId = setTimeout(
      () => abortController.abort(),
      CAPTION_TIMEOUT_MS,
    )

    try {
      const result = await generateText({
        model: llm,
        system: IMAGE_CAPTION_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: IMAGE_CAPTION_USER },
              {
                type: 'image',
                image: input.buffer,
                mediaType: input.mimeType,
              },
            ],
          },
        ],
        temperature: 0.2,
        maxOutputTokens: 200,
        abortSignal: abortController.signal,
      })

      const caption = sanitizeCaption(result.text)
      if (!caption) {
        return { ok: false, error: 'empty-response' }
      }

      return { ok: true, caption }
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    const error = isAbort
      ? 'timeout'
      : err instanceof Error
        ? err.message
        : 'unknown-error'
    // Fail-open: só loga, não propaga.
    logger.warn(
      `[image-caption] caption failed (ignored, fail-open): ${error}`,
      { organizationId: ctx.organizationId, projectId: ctx.projectId },
    )
    return { ok: false, error }
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Normaliza a saída do LLM em uma legenda limpa:
 *   - trim + colapsa espaços/quebras
 *   - remove aspas envolventes residuais
 *   - trunca em CAPTION_MAX_CHARS (corte defensivo)
 */
function sanitizeCaption(raw: string | undefined | null): string {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return ''

  // Remove aspas envolventes (o prompt já pede sem aspas, mas defende).
  const unquoted = text.replace(/^["'“”]+|["'“”]+$/g, '').trim()
  if (!unquoted) return ''

  if (unquoted.length <= CAPTION_MAX_CHARS) return unquoted
  return unquoted.slice(0, CAPTION_MAX_CHARS).trimEnd()
}
