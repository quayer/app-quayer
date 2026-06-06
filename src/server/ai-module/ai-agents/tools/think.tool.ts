/**
 * think — builtin tool de raciocínio interno (scratchpad).
 *
 * Por quê: dá ao agente um lugar explícito para "pensar antes de responder"
 * (planejar passos, conferir uma conta, decidir a próxima tool) sem que esse
 * texto vaze para o cliente. Inspirado no padrão `think` do Orayon.Profissoes.
 *
 * Limite: no máximo MAX_THINK_CALLS_PER_TURN chamadas por turno, para evitar
 * loops de "pensar sem agir". O contador vive na closure da factory e é criado
 * fresco a cada turno (createBuiltinTools roda 1x por mensagem) → reseta sozinho.
 *
 * Efeito colateral: nenhum. Não toca DB, não envia mensagem. O conteúdo do
 * pensamento fica registrado no transcript (args da tool call) para auditoria.
 *
 * Exporta:
 *   - MAX_THINK_CALLS_PER_TURN
 *   - thinkInputSchema
 *   - createThinkTool()   ← spread em createBuiltinTools()
 */

import { tool } from 'ai'
import { z } from 'zod'

export const MAX_THINK_CALLS_PER_TURN = 3

export const thinkInputSchema = z.object({
  thought: z
    .string()
    .min(1)
    .max(2000)
    .describe(
      'Seu raciocínio passo a passo (plano, checagem de conta, decisão de qual ' +
        'tool usar). NÃO é mostrado ao cliente — é só para você organizar a ação.',
    ),
})

export type ThinkInput = z.infer<typeof thinkInputSchema>

export interface ThinkResult {
  success: boolean
  callsUsed: number
  callsRemaining: number
  message?: string
}

// ---------------------------------------------------------------------------
// Tool factory (spread into createBuiltinTools())
// ---------------------------------------------------------------------------

export function createThinkTool() {
  let calls = 0

  return tool({
    description:
      'Bloco de raciocínio interno (rascunho). Use para planejar passos, conferir ' +
      'uma conta ou decidir a próxima ação ANTES de responder. O cliente NUNCA vê ' +
      `o conteúdo. Máximo de ${MAX_THINK_CALLS_PER_TURN} usos por turno.`,
    inputSchema: thinkInputSchema,
    execute: async (): Promise<ThinkResult> => {
      calls += 1

      if (calls > MAX_THINK_CALLS_PER_TURN) {
        return {
          success: false,
          callsUsed: calls,
          callsRemaining: 0,
          message:
            `Limite de ${MAX_THINK_CALLS_PER_TURN} reflexões por turno atingido. ` +
            'Pare de pensar e responda ao cliente ou chame uma tool de ação.',
        }
      }

      return {
        success: true,
        callsUsed: calls,
        callsRemaining: MAX_THINK_CALLS_PER_TURN - calls,
      }
    },
  })
}
