/**
 * Builder Tool — publish_agent (US-006, refactored to delegate to deployRunnerSubAgent)
 *
 * Publishes the AI agent bound to the current BuilderProject by delegating to
 * `deployRunnerSubAgent`, which wraps the 3-step `executeDeployFlow` saga
 * (publish version → create instance → attach connection) with structured
 * pre-checks and a discriminated-union output (deployed | blocked | rolled_back).
 *
 * The tool keeps two responsibilities the sub-agent intentionally does NOT own:
 *   1. Plan check — `organization.billingType === 'free'` blocks publishing.
 *   2. BYOK provider check — at least one active OrganizationProvider with
 *      `category = 'AI'` is required.
 *
 * Both checks run BEFORE the sub-agent so we never spend money on uazapi
 * instance creation for an org that can't pay or doesn't have an LLM key.
 *
 * Input shape changed: `{ promptVersionId? }` (was `{ agentId, instanceId? }`).
 *   - `agentId` is no longer accepted: the agent is resolved from the project
 *     binding (`BuilderProject.aiAgentId`), which `ctx.projectId` already pins.
 *   - `instanceId` is no longer accepted: instance selection lives inside the
 *     saga's `attachConnection` step.
 *   - `promptVersionId` is optional. When omitted we resolve the latest
 *     `BuilderPromptVersion` for the project's bound agent (descending
 *     `versionNumber`). If no version exists we return a blocker.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import { deployRunnerSubAgent } from '../sub-agents'
import type {
  DeployRunnerBlocker,
  DeployRunnerFailedStep,
} from '../sub-agents'

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

/**
 * Tool-level blocker shape. Mirrors `DeployRunnerBlocker` so we can merge
 * tool-level checks (plan, BYOK) with sub-agent checks
 * (agent/prompt/version/channel) under a single discriminator.
 */
interface ToolBlocker {
  check: 'plan' | 'byok' | DeployRunnerBlocker['check']
  message: string
  cta?: string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function publishAgentTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'publish_agent',
    metadata: { isReadOnly: false, isConcurrencySafe: false, requiresApproval: true },
    tool: tool({
      description:
        'Publishes the AI agent bound to the current Builder project to a WhatsApp instance. Runs plan + BYOK pre-checks, then delegates to the deploy-runner sub-agent which validates the prompt/version/channel and runs the publish→create-instance→attach-connection saga (with rollback on failure). Returns structured blockers with redirect URLs when the deploy cannot proceed.',
      inputSchema: z.object({
        promptVersionId: z
          .string()
          .cuid()
          .optional()
          .describe(
            'The BuilderPromptVersion.id to publish. If omitted, the latest version of the project-bound agent is used.',
          ),
      }),
      execute: async (input) => {
        try {
          // -----------------------------------------------------------------
          // 1. Tool-level pre-checks (plan + BYOK).
          //    These are intentionally outside the sub-agent so we don't
          //    even attempt agent/prompt validation if the org can't publish.
          // -----------------------------------------------------------------
          const blockers: ToolBlocker[] = []
          const redirects: Record<string, string> = {}

          // 1a. Plan check
          const org = await database.organization.findUnique({
            where: { id: ctx.organizationId },
            select: { billingType: true },
          })

          if (!org || org.billingType === 'free') {
            blockers.push({
              check: 'plan',
              message: 'No active paid plan. Upgrade to publish agents.',
              cta: 'Upgrade your plan',
            })
            redirects.plan = '/admin/billing'
          }

          // 1b. BYOK provider check
          const providerCount = await database.organizationProvider.count({
            where: {
              organizationId: ctx.organizationId,
              category: 'AI',
              isActive: true,
            },
          })

          if (providerCount === 0) {
            blockers.push({
              check: 'byok',
              message:
                'No BYOK AI provider configured. Add your own API key (OpenAI, Anthropic, etc.) to publish.',
              cta: 'Configure a provider',
            })
            redirects.byok = '/configuracoes/provedores'
          }

          if (blockers.length > 0) {
            return {
              success: false,
              blockers,
              redirects,
              message: `Cannot publish agent: ${blockers.length} blocker(s) found.`,
            }
          }

          // -----------------------------------------------------------------
          // 2. Resolve promptVersionId (if not provided).
          //    Look up the project's bound agent, then take the latest
          //    BuilderPromptVersion for that agent.
          // -----------------------------------------------------------------
          let promptVersionId = input.promptVersionId

          if (!promptVersionId) {
            const project = await database.builderProject.findUnique({
              where: { id: ctx.projectId },
              select: { aiAgentId: true },
            })

            if (!project?.aiAgentId) {
              return {
                success: false,
                blockers: [
                  {
                    check: 'agent',
                    message: 'Nenhum agente criado para este projeto.',
                    cta: 'Use create_agent antes de publicar',
                  },
                ],
                message:
                  'Cannot publish agent: 1 blocker(s) found.',
              }
            }

            const latestVersion = await database.builderPromptVersion.findFirst(
              {
                where: { aiAgentId: project.aiAgentId },
                orderBy: { versionNumber: 'desc' },
                select: { id: true },
              },
            )

            if (!latestVersion) {
              return {
                success: false,
                blockers: [
                  {
                    check: 'version',
                    message:
                      'Nenhuma versão de prompt encontrada para o agente deste projeto.',
                    cta: 'Gere uma versão de prompt antes de publicar',
                  },
                ],
                message: 'Cannot publish agent: 1 blocker(s) found.',
              }
            }

            promptVersionId = latestVersion.id
          }

          // -----------------------------------------------------------------
          // 3. Delegate to the deploy-runner sub-agent.
          // -----------------------------------------------------------------
          const result = await deployRunnerSubAgent.run(
            {
              projectId: ctx.projectId,
              promptVersionId,
            },
            {
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              projectId: ctx.projectId,
            },
          )

          // 3a. Sub-agent envelope failure (invalid input / aborted / etc).
          if (!result.success) {
            return {
              success: false,
              message: result.error,
              code: result.code,
            }
          }

          // 3b. Map the discriminated union into the tool's response shape.
          const output = result.data

          if (output.status === 'deployed') {
            return {
              success: true,
              deploymentId: output.deploymentId,
              instanceId: output.instanceId,
              message: 'Agent published successfully.',
            }
          }

          if (output.status === 'blocked') {
            return {
              success: false,
              blockers: output.blockers,
              message: `Cannot publish agent: ${output.blockers.length} blocker(s) found.`,
            }
          }

          // status === 'rolled_back'
          const failedStep: DeployRunnerFailedStep = output.failedStep
          return {
            success: false,
            failedStep,
            error: output.error,
            retryable: output.retryable,
            message: `Deploy failed at ${failedStep} and was rolled back. Retryable: ${output.retryable}.`,
          }
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Failed to publish agent'
          return { success: false, message }
        }
      },
    }),
  })
}
