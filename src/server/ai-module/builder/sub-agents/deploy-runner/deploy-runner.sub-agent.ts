/**
 * Quayer Builder — DeployRunner Sub-Agent
 *
 * Wraps the existing `executeDeployFlow` saga (publish → create instance →
 * attach connection) with two extra responsibilities:
 *
 *   1. A pre-check phase that collects every actionable blocker before we
 *      spend money on uazapi instance creation. Blockers are returned as a
 *      structured list so the Builder LLM can explain WHY a deploy can't
 *      start ("você ainda não tem canal WhatsApp") instead of surfacing a
 *      generic saga error.
 *
 *   2. Mapping of saga outcomes into a discriminated union so the caller
 *      (a Builder tool, ultimately the LLM) can render the three distinct
 *      states with tailored UX: deployed / blocked / rolled_back.
 *
 * This sub-agent performs NO LLM calls — timing is handled by `measure`.
 */

import { z } from 'zod'
import { database } from '@/server/services/database'
import { measure } from '../base'
import type { SubAgent, SubAgentContext, SubAgentResult } from '../types'
import { executeDeployFlow } from '../../deploy/deploy-flow.orchestrator'
import { validatePrompt } from '../../validators'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const deployRunnerInputSchema = z.object({
  projectId: z.string().cuid(),
  promptVersionId: z.string().cuid(),
})

export type DeployRunnerInput = z.infer<typeof deployRunnerInputSchema>

// ---------------------------------------------------------------------------
// Output (discriminated union)
// ---------------------------------------------------------------------------

export type DeployRunnerBlockerCheck =
  | 'prompt'
  | 'channel'
  | 'agent'
  | 'version'

export interface DeployRunnerBlocker {
  check: DeployRunnerBlockerCheck
  message: string
  cta?: string
}

export type DeployRunnerFailedStep =
  | 'publishVersion'
  | 'createDeployInstance'
  | 'attachConnection'
  | 'unknown'

export type DeployRunnerOutput =
  | {
      status: 'deployed'
      deploymentId: string | null
      instanceId: string | null
    }
  | {
      status: 'blocked'
      blockers: DeployRunnerBlocker[]
    }
  | {
      status: 'rolled_back'
      failedStep: DeployRunnerFailedStep
      error: string
      retryable: boolean
    }

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

const METADATA = {
  name: 'deploy-runner',
  isReadOnly: false,
  isConcurrencySafe: false,
  timeoutMs: 180_000,
} as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Tolerant coercion of `aiAgent.enabledTools` into a string[]. The schema
 * currently types it as `String[]`, but historically this field has also
 * been stored as JSON / nested relation. We accept any of those shapes and
 * fall back to `[]` for unknown payloads rather than failing the pre-check.
 */
function coerceEnabledTools(tools: unknown): string[] {
  try {
    if (Array.isArray(tools)) {
      return tools.filter((t): t is string => typeof t === 'string')
    }
    if (typeof tools === 'string') {
      const parsed = JSON.parse(tools) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === 'string')
      }
    }
    return []
  } catch {
    return []
  }
}

/**
 * A value matches a transient/retryable class if its message or `.code`
 * looks like a timeout or upstream 5xx/connection problem. Programmatic
 * errors ("projeto não encontrado", zod failures, etc) are non-retryable.
 */
function isRetryableError(err: unknown): boolean {
  const re = /TIMEOUT|503|504|ECONNREFUSED|ETIMEDOUT/i
  const codeLike = (err as { code?: unknown } | null)?.code
  if (typeof codeLike === 'string' && re.test(codeLike)) return true
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : ''
  return re.test(message)
}

/**
 * Extract which saga step blew up. The orchestrator wraps failures as
 * `"Deploy falhou em '<step>': <reason>"`. We parse that prefix to recover
 * the canonical step name; anything unrecognized maps to 'unknown'.
 */
function extractFailedStep(err: unknown): {
  failedStep: DeployRunnerFailedStep
  errorMessage: string
} {
  const message = err instanceof Error ? err.message : String(err)
  const match = message.match(/Deploy falhou em '([^']+)':\s*(.*)$/)
  if (match) {
    const rawStep = match[1]
    const reason = match[2]
    const failedStep =
      rawStep === 'publish_version'
        ? 'publishVersion'
        : rawStep === 'create_instance'
          ? 'createDeployInstance'
          : rawStep === 'attach_connection'
            ? 'attachConnection'
            : 'unknown'
    return { failedStep, errorMessage: reason || message }
  }
  return { failedStep: 'unknown', errorMessage: message }
}

// ---------------------------------------------------------------------------
// Sub-agent implementation
// ---------------------------------------------------------------------------

export const deployRunnerSubAgent: SubAgent<
  DeployRunnerInput,
  DeployRunnerOutput
> = {
  metadata: METADATA,

  async run(
    input: DeployRunnerInput,
    context: SubAgentContext,
  ): Promise<SubAgentResult<DeployRunnerOutput>> {
    const started = Date.now()

    // Cooperative cancellation: short-circuit before doing any work.
    if (context.signal?.aborted) {
      return {
        success: false,
        error: 'Aborted by caller signal',
        code: 'ABORTED',
        durationMs: Date.now() - started,
      }
    }

    // 1. Zod-validate input at the trust boundary.
    const parsed = deployRunnerInputSchema.safeParse(input)
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ') || 'Invalid input',
        code: 'INVALID_INPUT',
        durationMs: Date.now() - started,
      }
    }

    return measure(async (): Promise<DeployRunnerOutput> => {
      // 2. Pre-check phase — collect EVERY blocker (no short-circuit).
      const project = await database.builderProject.findUnique({
        where: { id: parsed.data.projectId },
        select: {
          id: true,
          organizationId: true,
          aiAgentId: true,
          aiAgent: {
            select: {
              systemPrompt: true,
              enabledTools: true,
            },
          },
        },
      })

      if (!project) {
        // We raise here so `measure` translates this into an INVALID_INPUT-
        // style SubAgentResult failure — callers treat missing project as
        // an input error, not as a blocker.
        throw Object.assign(
          new Error(`Projeto ${parsed.data.projectId} não encontrado`),
          { __invalidInput: true as const },
        )
      }

      const blockers: DeployRunnerBlocker[] = []

      // 2a. Agent must be bound.
      if (!project.aiAgentId) {
        blockers.push({
          check: 'agent',
          message: 'Nenhum agente criado para este projeto.',
          cta: 'Use create_agent antes de publicar',
        })
      }

      // 2b/c. Prompt must exist and pass validators.
      const systemPrompt = project.aiAgent?.systemPrompt ?? ''
      if (!systemPrompt || systemPrompt.length < 50) {
        blockers.push({
          check: 'prompt',
          message: 'Prompt ausente ou muito curto.',
        })
      } else {
        const enabledTools = coerceEnabledTools(project.aiAgent?.enabledTools)
        const validation = validatePrompt(systemPrompt, enabledTools)
        if (!validation.pass) {
          const topIssue = validation.issues.find(
            (i) => i.severity === 'error',
          )
          const issueText = topIssue?.message ?? 'erro de validação'
          blockers.push({
            check: 'prompt',
            message: `Prompt não passou nos validadores: ${issueText}`,
            cta: 'Ajuste o prompt e gere nova versão',
          })
        }
      }

      // 2e. Version must exist and belong to this project's agent.
      // BuilderPromptVersion links to BuilderProject via `aiAgentId`, so we
      // scope the lookup by the agent id resolved above. When no agent is
      // bound yet, we still attempt the lookup (it will miss) so blockers
      // accumulate deterministically.
      const version = project.aiAgentId
        ? await database.builderPromptVersion.findFirst({
            where: {
              id: parsed.data.promptVersionId,
              aiAgentId: project.aiAgentId,
            },
            select: { id: true },
          })
        : null
      if (!version) {
        blockers.push({
          check: 'version',
          message: 'Versão de prompt não encontrada.',
        })
      }

      // 2f. Some WhatsApp channel must be available for this org. The full
      // connection gate lives in `attachConnection`; this is a sanity check
      // so the LLM can ask the user to set up a channel BEFORE we create
      // an uazapi instance. Wrapped in try/catch so a missing/incompatible
      // delegate (e.g. in environments without the table) degrades to a
      // no-op blocker rather than failing the whole pre-check.
      try {
        const delegate = (
          database as unknown as {
            whatsAppInstance?: {
              findFirst: (args: {
                where: { organizationId: string }
                select: { id: true }
              }) => Promise<{ id: string } | null>
            }
          }
        ).whatsAppInstance
        if (delegate) {
          const instance = await delegate.findFirst({
            where: { organizationId: project.organizationId },
            select: { id: true },
          })
          if (!instance) {
            blockers.push({
              check: 'channel',
              message: 'Nenhum canal WhatsApp configurado.',
              cta: 'Use create_whatsapp_instance',
            })
          }
        }
      } catch (err) {
        // Non-fatal — log and move on. The attachConnection handler will
        // still guard against missing channels at execution time.
        console.warn(
          '[deploy-runner] sanity channel check failed — skipping:',
          err,
        )
      }

      // 3. Short-circuit with the collected blockers.
      if (blockers.length > 0) {
        return { status: 'blocked', blockers }
      }

      // 4. Execute the saga. Any thrown error → rolled_back path.
      try {
        const result = await executeDeployFlow({
          projectId: parsed.data.projectId,
          promptVersionId: parsed.data.promptVersionId,
          userId: context.userId,
          organizationId: context.organizationId,
        })

        // 5a. Saga completed — `status === 'live'` is the happy signal,
        //     but the orchestrator also throws on any failure so in practice
        //     reaching here means success. We still guard defensively.
        if (result.status === 'live') {
          return {
            status: 'deployed',
            deploymentId: result.deploymentId,
            instanceId: result.instanceId ?? null,
          }
        }

        // 5b. Non-live terminal status → map to rolled_back.
        const failedStep: DeployRunnerFailedStep =
          result.failureStep === 'publish_version'
            ? 'publishVersion'
            : result.failureStep === 'create_instance'
              ? 'createDeployInstance'
              : result.failureStep === 'attach_connection'
                ? 'attachConnection'
                : 'unknown'
        const errorMessage = result.failureReason ?? 'Deploy não concluído'
        return {
          status: 'rolled_back',
          failedStep,
          error: errorMessage,
          retryable: isRetryableError(errorMessage),
        }
      } catch (err) {
        const { failedStep, errorMessage } = extractFailedStep(err)
        return {
          status: 'rolled_back',
          failedStep,
          error: errorMessage,
          retryable: isRetryableError(err),
        }
      }
    }).then((inner) => {
      // Translate the "project not found" sentinel thrown inside `measure`
      // into the INVALID_INPUT failure envelope the spec mandates.
      if (!inner.success && typeof inner.error === 'string') {
        if (inner.error.includes('não encontrado')) {
          return {
            success: false as const,
            error: inner.error,
            code: 'INVALID_INPUT',
            durationMs: inner.durationMs,
          }
        }
      }
      return inner
    })
  },
}
