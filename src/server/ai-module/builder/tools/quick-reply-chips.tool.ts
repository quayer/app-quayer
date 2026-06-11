/**
 * quick_reply_chips — transient Builder UI tool.
 *
 * Lets the Builder meta-agent offer tappable answer options in chat without
 * mutating builderState. The chosen chip is submitted through the existing
 * `quick_reply_chips` card route and is replayed as a normal user answer.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'

export const quickReplyChipInputSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .describe('Texto curto exibido no botão. Se omitido, usa value.'),
  value: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe('Resposta enviada ao Builder quando o usuário tocar no botão.'),
})

export const quickReplyChipsInputSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(280)
    .describe('Pergunta curta exibida acima dos botões.'),
  chips: z
    .array(quickReplyChipInputSchema)
    .min(2)
    .max(4)
    .describe('Entre 2 e 4 opções claras, mutuamente úteis e curtas.'),
})

export type QuickReplyChipsInput = z.infer<typeof quickReplyChipsInputSchema>

function dedupeChips(chips: QuickReplyChipsInput['chips']) {
  const seen = new Set<string>()
  const out: QuickReplyChipsInput['chips'] = []

  for (const chip of chips) {
    const value = chip.value.trim()
    const label = chip.label?.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(label ? { label, value } : { value })
  }

  return out
}

export function quickReplyChipsTool(_ctx: BuilderToolExecutionContext) {
  void _ctx

  return buildBuilderTool({
    name: 'quick_reply_chips',
    metadata: {
      isReadOnly: true,
      isConcurrencySafe: true,
      requiresApproval: false,
    },
    tool: tool({
      description:
        'Use para exibir botões de resposta rápida no chat quando o usuário precisa escolher entre 2-4 opções. ' +
        'Não grava estado. O botão escolhido volta como uma resposta normal do usuário. ' +
        'Use especialmente na fase Conhecer para objetivo do agente, perfil do criador e decisões simples. ' +
        'Não use para campos que já têm card ativo obrigatório.',
      inputSchema: quickReplyChipsInputSchema,
      execute: async (input) => {
        const chips = dedupeChips(input.chips)
        if (chips.length === 0) {
          return {
            success: false as const,
            message: 'Nenhuma opção válida para exibir.',
          }
        }

        return {
          success: true as const,
          prompt: input.prompt.trim(),
          chips,
        }
      },
    }),
  })
}
