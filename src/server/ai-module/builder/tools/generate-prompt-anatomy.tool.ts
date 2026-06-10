/**
 * Builder Tool — generate_prompt_anatomy
 *
 * Wrapper tool exposed to the Quayer Builder meta-agent (US-015). Given a
 * short user brief, a niche hint, and an objetivo, it produces a structured
 * WhatsApp AI agent system prompt following the canonical 10-section anatomy
 * (shared checklist in `templates/prompt-section-checklist.ts` — same source
 * consumed by the validator, so writer/validator can never drift).
 *
 * Implementation:
 *   - Loads the conversation's `builderState` (org-scoped) and projects the
 *     data already collected via cards (tools, hours, handoff, activation,
 *     identity, services) into the writer input. Missing data is generated
 *     with sensible defaults tagged [REVISAR].
 *   - Delegates generation to `promptWriterSubAgent` (LLM + section parsing).
 *   - SELF-CORRECTION LOOP: pipes the result into `validatorSubAgent`; when
 *     validation fails with errors, retries ONCE feeding the validator errors
 *     back to the writer (max 2 attempts total). The FINAL validation result
 *     is always returned so the meta-agent can report honestly — it must
 *     NEVER claim "prompt pronto" while `validation.pass === false`.
 *   - No DB writes — pure generation + validation (read-only state load).
 */
import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import { buildBuilderTool } from './build-tool'
import {
  promptWriterSubAgent,
  validatorSubAgent,
  builderStateToPromptWriterContext,
  type PromptWriterBuilderContext,
  type PromptWriterInput,
  type PromptWriterOutput,
} from '../sub-agents'
import { parseBuilderState } from '../cards/builder-state'
import type { ValidationIssue } from '../validators'

// ---------------------------------------------------------------------------
// Constants & result shapes
// ---------------------------------------------------------------------------

/** Max generation attempts: 1 initial + 1 self-correction retry. */
const MAX_ATTEMPTS = 2

interface ToolValidationRan {
  ran: true
  pass: boolean
  issues: Array<Pick<ValidationIssue, 'validator' | 'severity' | 'message'>>
}

interface ToolValidationSkipped {
  ran: false
  error: string
  code?: string
}

type ToolValidation = ToolValidationRan | ToolValidationSkipped

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LoadedBuilderContext {
  builderContext: PromptWriterBuilderContext | undefined
  selectedToolKeys: string[]
}

/**
 * Load the conversation's builderState for this project (org-scoped) and
 * project it into the writer context + tool keys selected via card.
 * Fail-open: any miss returns an empty context so generation still works
 * for conversations without collected data.
 */
async function loadBuilderContext(
  ctx: BuilderToolExecutionContext,
): Promise<LoadedBuilderContext> {
  try {
    const conversation = await database.builderProjectConversation.findFirst({
      where: { projectId: ctx.projectId, organizationId: ctx.organizationId },
      select: { builderState: true },
    })
    if (!conversation) {
      return { builderContext: undefined, selectedToolKeys: [] }
    }
    const state = parseBuilderState(conversation.builderState)
    return {
      builderContext: builderStateToPromptWriterContext(state),
      selectedToolKeys: state.selectedToolKeys,
    }
  } catch {
    return { builderContext: undefined, selectedToolKeys: [] }
  }
}

/** Run the validator sub-agent and collapse its envelope into ToolValidation. */
async function runValidation(
  prompt: string,
  attachedTools: string[],
  ctx: BuilderToolExecutionContext,
): Promise<ToolValidation> {
  const validation = await validatorSubAgent.run(
    { prompt, attachedTools },
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      projectId: ctx.projectId,
    },
  )

  if (!validation.success) {
    // Validator itself failed (should be rare — it's pure logic). Surface the
    // skip so the Builder LLM can decide whether to warn the user.
    return { ran: false, error: validation.error, code: validation.code }
  }

  return {
    ran: true,
    pass: validation.data.pass,
    issues: validation.data.issues.map((issue: ValidationIssue) => ({
      validator: issue.validator,
      severity: issue.severity,
      message: issue.message,
    })),
  }
}

/** Error-severity messages only — what the retry must fix. */
function errorMessages(validation: ToolValidation): string[] {
  if (!validation.ran) return []
  return validation.issues
    .filter((i) => i.severity === 'error')
    .map((i) => i.message)
}

/**
 * Honest-reporting guidance for the meta-agent, derived from the FINAL
 * validation outcome. Returned as `message` on every success payload.
 */
function buildOutcomeMessage(
  validation: ToolValidation,
  attempts: number,
): string {
  if (!validation.ran) {
    return (
      'Prompt gerado, mas a validação automática FALHOU ao executar (QA pulado). ' +
      'Informe o usuário que o prompt ainda não foi verificado.'
    )
  }
  if (validation.pass) {
    const warnings = validation.issues.filter((i) => i.severity === 'warning')
    return warnings.length > 0
      ? `Prompt gerado e APROVADO na validação em ${attempts} tentativa(s), com ${warnings.length} aviso(s) não-bloqueante(s).`
      : `Prompt gerado e APROVADO na validação em ${attempts} tentativa(s).`
  }
  const errors = errorMessages(validation)
  return (
    `ATENÇÃO: o prompt foi gerado mas REPROVOU na validação mesmo após ${attempts} tentativa(s). ` +
    'NUNCA diga ao usuário que o prompt está pronto/aprovado. Liste as pendências e proponha corrigi-las antes de criar o agente. ' +
    `Pendências: ${errors.join(' | ')}`
  )
}

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
        'Generates a structured WhatsApp AI agent system prompt in Brazilian Portuguese from a brief, niche, and goal. Uses the canonical 10-section anatomy (Papel, Objetivo, Tom de voz, Comunicação, Ferramentas, Regras críticas, Fluxo, Gatilhos/Fallback, Limitações, Encerramento) and automatically injects the data already collected in this conversation (tools, horário, handoff, ativação, identidade). Runs prompt validation with ONE automatic self-correction retry and returns the FINAL validation result. If `validation.pass` is false, you MUST tell the user the prompt has pending issues — never report it as ready. Call this BEFORE create_agent.',
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
            'Ferramentas que o agente terá habilitadas (se já conhecidas). Usado pelo gerador (seção Ferramentas) e pelo validador. Se ainda não definidas, passe [] — as selecionadas via card são adicionadas automaticamente.',
          ),
      }),
      execute: async (input) => {
        const subAgentContext = {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          projectId: ctx.projectId,
        }

        // 0. Project builderState (cards already collected) into writer input.
        //    Tools selected via card union with the LLM-provided list.
        const { builderContext, selectedToolKeys } =
          await loadBuilderContext(ctx)
        const attachedTools = Array.from(
          new Set([...input.attachedTools, ...selectedToolKeys]),
        )

        // 1-2. Generate → validate, with ONE self-correction retry (max 2).
        let generation: Awaited<
          ReturnType<typeof promptWriterSubAgent.run>
        > | null = null
        let best: PromptWriterOutput | null = null
        let validation: ToolValidation | null = null
        let attempts = 0

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          const writerInput: PromptWriterInput = {
            brief: input.brief,
            nicho: input.nicho,
            objetivo: input.objetivo,
            attachedTools,
            builderContext,
            // Retry only: feed the previous validation errors back.
            validatorFeedback:
              attempt > 1 && validation ? errorMessages(validation) : undefined,
          }

          generation = await promptWriterSubAgent.run(
            writerInput,
            subAgentContext,
          )

          if (!generation.success) {
            // LLM/parse failure: keep the previous attempt (if any) as best.
            break
          }

          attempts = attempt
          best = generation.data
          validation = await runValidation(
            best.prompt,
            attachedTools,
            ctx,
          )

          // Stop when QA passed or could not run (retry would be blind).
          if (!validation.ran || validation.pass) break
          if (errorMessages(validation).length === 0) break
        }

        // Hard failure: nothing was ever generated.
        if (!best || !validation) {
          return {
            success: false as const,
            message: generation && !generation.success
              ? generation.error
              : 'Falha desconhecida ao gerar o prompt.',
            code:
              generation && !generation.success ? generation.code : undefined,
          }
        }

        // 3. Return prompt + FINAL validation (honest-reporting contract).
        return {
          success: true as const,
          prompt: best.prompt,
          sections: best.sections,
          attempts,
          validation,
          message: buildOutcomeMessage(validation, attempts),
        }
      },
    }),
  })
}
