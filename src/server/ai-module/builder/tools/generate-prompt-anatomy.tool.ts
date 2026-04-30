/**
 * Builder Tool — generate_prompt_anatomy
 *
 * Wrapper tool exposed to the Quayer Builder meta-agent (US-015). Given a
 * short user brief, a niche hint, and an objetivo, it produces a structured
 * WhatsApp AI agent system prompt following the canonical anatomy:
 * [Papel] + [Objetivo] + [Regras] + [Limitações] + [Formato de resposta].
 *
 * Implementation (post-refactor):
 *   - Delegates generation to `promptWriterSubAgent` (LLM + section parsing).
 *   - Pipes the result into `validatorSubAgent` (anatomy + blacklist +
 *     ambiguity + journey checks) so QA runs automatically instead of being
 *     opt-in dead code. Validation issues are surfaced to the LLM but
 *     non-blocking — the Builder decides whether to regenerate or warn the
 *     user.
 *   - No side effects — pure generation + validation.
 */
import { tool } from 'ai'
import { z } from 'zod'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import { buildBuilderTool } from './build-tool'
import {
  promptWriterSubAgent,
  validatorSubAgent,
} from '../sub-agents'
import type { ValidationIssue } from '../validators'

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
export function generatePromptAnatomyTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'generate_prompt_anatomy',
    metadata: { isReadOnly: true, isConcurrencySafe: true },
    tool: tool({
      description:
        'Generates a structured WhatsApp AI agent system prompt in Brazilian Portuguese from a brief, niche, and goal. Uses the canonical anatomy: Papel + Objetivo + Regras + Limitações + Formato de resposta. Automatically runs prompt validation (anatomy, blacklist, ambiguity, journey) and returns the result plus any warnings. Call this BEFORE create_agent.',
      inputSchema: z.object({
        brief: z
          .string()
          .min(20)
          .max(4000)
          .describe(
            'Descrição livre do caso de uso coletada do usuário (público, tom, regras desejadas, limites, handoff). Mínimo 20 caracteres.',
          ),
        nicho: z
          .string()
          .min(2)
          .max(200)
          .describe(
            'Texto livre descrevendo o nicho/vertical do negócio. Quayer é canal specialist, não nicho specialist — qualquer nicho é válido. Ex: "barbearia", "clínica veterinária", "curso de inglês", "loja de roupas".',
          ),
        objetivo: z
          .string()
          .min(10)
          .max(500)
          .describe(
            'Objetivo primário do agente em uma frase (ex: "qualificar leads de divórcio litigioso e agendar consulta").',
          ),
        attachedTools: z
          .array(z.string())
          .default([])
          .describe(
            'Ferramentas que o agente terá habilitadas (se já conhecidas). Usado pelo validador para checar se o prompt instrui o uso correto das tools. Se ainda não definidas, passe [].',
          ),
      }),
      execute: async (input) => {
        // 1. Generate prompt via PromptWriter sub-agent (LLM + section parse)
        const generation = await promptWriterSubAgent.run(
          {
            brief: input.brief,
            nicho: input.nicho,
            objetivo: input.objetivo,
            attachedTools: input.attachedTools,
          },
          {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            projectId: ctx.projectId,
          },
        )

        if (!generation.success) {
          return {
            success: false as const,
            message: generation.error,
            code: generation.code,
          }
        }

        const { prompt, sections } = generation.data

        // 2. Run validation pipeline (non-blocking — surfaces issues to LLM)
        const validation = await validatorSubAgent.run(
          { prompt, attachedTools: input.attachedTools },
          {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            projectId: ctx.projectId,
          },
        )

        if (!validation.success) {
          // Validator itself failed (should be rare — it's pure logic).
          // Return the prompt anyway but flag that QA was skipped so the
          // Builder LLM can decide whether to warn the user.
          return {
            success: true as const,
            prompt,
            sections,
            validation: {
              ran: false as const,
              error: validation.error,
              code: validation.code,
            },
          }
        }

        return {
          success: true as const,
          prompt,
          sections,
          validation: {
            ran: true as const,
            pass: validation.data.pass,
            issues: validation.data.issues.map(
              (issue: ValidationIssue) => ({
                validator: issue.validator,
                severity: issue.severity,
                message: issue.message,
              }),
            ),
          },
        }
      },
    }),
  })
}
