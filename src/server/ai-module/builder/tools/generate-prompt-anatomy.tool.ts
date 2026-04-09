/**
 * Builder Tool — generate_prompt_anatomy
 *
 * Wrapper tool exposed to the Quayer Builder meta-agent (US-015). Given a
 * short user brief, a niche hint, and an objetivo, it performs a sub-LLM call
 * to Anthropic (same provider setup as `agent-runtime.service.ts`) to produce
 * a structured WhatsApp AI agent system prompt following the canonical
 * anatomy: [Papel] + [Objetivo] + [Regras] + [Limitações] + [Formato de resposta].
 *
 * The returned markdown is meant to be shown to the user for approval BEFORE
 * the Builder calls `create_agent`. No side effects — pure generation.
 *
 * Pattern mirrors `create-agent.tool.ts`:
 *   - Uses Vercel AI SDK `tool()` helper with Zod inputSchema.
 *   - Receives a bound context via factory function.
 *   - Reuses the shared `BuilderToolExecutionContext` type.
 */

import { tool, generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import {
  PROMPT_ANATOMY_TEMPLATE,
  NICHE_HINTS,
} from '../templates/prompt-anatomy'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Same model used by the Builder itself — keeps pricing/quality consistent. */
const GENERATION_MODEL = 'claude-sonnet-4-20250514'

/** Hard upper bound on the sub-LLM call (60s per task spec). */
const GENERATION_TIMEOUT_MS = 60_000

// ---------------------------------------------------------------------------
// Sub-LLM system prompt
// ---------------------------------------------------------------------------

const SUB_LLM_SYSTEM = `Você é um especialista em prompt engineering para agentes de atendimento via WhatsApp no mercado brasileiro.

Sua tarefa é preencher EXATAMENTE o template markdown fornecido pelo usuário, substituindo os placeholders {{papel}}, {{objetivo}}, {{regras}}, {{limitacoes}} e {{formato}} por conteúdo concreto, acionável e em português do Brasil.

Regras duras:
- Sempre em pt-BR.
- Máximo ~400 palavras no total — prompts enxutos performam melhor.
- Seção "Regras de conduta": use lista com marcadores, 3 a 6 itens.
- Seção "Limitações": use lista com marcadores, inclua sempre "Se a pergunta fugir do escopo, use transfer_to_human".
- Seção "Formato de resposta": 2-4 frases descrevendo tom, comprimento e uso de emojis/formatação.
- NUNCA invente integrações, nomes próprios, preços ou dados sensíveis que não estejam no brief.
- NUNCA inclua cabeçalhos extras além dos 5 do template.
- NUNCA envolva a resposta em blocos de código — devolva markdown cru.

Responda APENAS com o template preenchido, sem comentários antes ou depois.`

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the `generate_prompt_anatomy` tool bound to a Builder chat context.
 *
 * The Builder should call this after collecting enough information from the
 * user (nome do projeto, caso de uso, público, tom, limites) and BEFORE
 * showing the generated prompt for approval.
 */
export function generatePromptAnatomyTool(_ctx: BuilderToolExecutionContext) {
  return tool({
    description:
      'Generates a structured WhatsApp AI agent system prompt in Brazilian Portuguese from a brief, niche, and goal. Uses the canonical anatomy: Papel + Objetivo + Regras + Limitações + Formato de resposta. Returns markdown ready to be shown to the user for approval. Call this BEFORE create_agent.',
    inputSchema: z.object({
      brief: z
        .string()
        .min(20)
        .max(4000)
        .describe(
          'Descrição livre do caso de uso coletada do usuário (público, tom, regras desejadas, limites, handoff). Mínimo 20 caracteres.',
        ),
      nicho: z
        .enum(['advocacia', 'contabilidade', 'seguros', 'outro'])
        .describe('Vertical do negócio — usado para injetar contexto regulatório.'),
      objetivo: z
        .string()
        .min(10)
        .max(500)
        .describe(
          'Objetivo primário do agente em uma frase (ex: "qualificar leads de divórcio litigioso e agendar consulta").',
        ),
    }),
    execute: async (input) => {
      try {
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
          return {
            success: false as const,
            message: 'LLM provider not configured (ANTHROPIC_API_KEY missing)',
          }
        }

        const nicheHint = NICHE_HINTS[input.nicho] ?? NICHE_HINTS.outro

        const userMessage = `Preencha o template abaixo com base no brief do cliente.

## Brief do cliente
${input.brief}

## Objetivo primário
${input.objetivo}

## Contexto do nicho (${input.nicho})
${nicheHint}

## Template (preencha TODOS os placeholders)
${PROMPT_ANATOMY_TEMPLATE}`

        const anthropic = createAnthropic({ apiKey })
        const model = anthropic(GENERATION_MODEL)

        const abortController = new AbortController()
        const timeoutId = setTimeout(
          () => abortController.abort(),
          GENERATION_TIMEOUT_MS,
        )

        try {
          const result = await generateText({
            model,
            system: SUB_LLM_SYSTEM,
            messages: [{ role: 'user', content: userMessage }],
            temperature: 0.4,
            maxOutputTokens: 2000,
            abortSignal: abortController.signal,
          })

          const prompt = (result.text ?? '').trim()

          if (!prompt || prompt.length < 50) {
            return {
              success: false as const,
              message: 'LLM returned an empty or too-short prompt',
            }
          }

          return {
            success: true as const,
            prompt,
          }
        } finally {
          clearTimeout(timeoutId)
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to generate prompt anatomy'
        return {
          success: false as const,
          message,
        }
      }
    },
  })
}
