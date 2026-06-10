/**
 * revert_prompt — Builder tool (QH-07d)
 *
 * Undo / rollback: restores the agent's active system prompt to the content of
 * a PRIOR BuilderPromptVersion. Non-destructive — like update_agent_prompt and
 * edit_prompt_section, it creates a NEW linear version (max + 1) carrying the
 * old content, tagged `createdBy: 'rollback'`. The new version stays a DRAFT
 * (publishedAt null) until the user explicitly publishes.
 *
 * Target selection:
 *   - `targetVersionId` (uuid) — roll back to that exact version, OR
 *   - `target: 'previous'`     — roll back to the version immediately before
 *                                the current active one (versionNumber - 1 by
 *                                rank, i.e. the highest below the active).
 *
 * "Active" version is resolved exactly like edit_prompt_section: prefer the
 * latest published, fall back to the latest draft.
 *
 * Tenant boundary: the agent must belong to the active project (ctx.projectId +
 * ctx.organizationId). Rules: zero `any`, Zod input, <= 200 lines.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import {
  resolveProjectAgent,
  OPTIONAL_AGENT_ID_DESCRIPTION,
} from './resolve-project-agent'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const revertPromptInputSchema = z.object({
  agentId: z.string().uuid().optional().describe(OPTIONAL_AGENT_ID_DESCRIPTION),
  targetVersionId: z
    .string()
    .uuid()
    .optional()
    .describe('BuilderPromptVersion.id to restore. Omit to use `target` instead.'),
  target: z
    .literal('previous')
    .optional()
    .describe('Use "previous" to roll back to the version right before the active one.'),
  description: z
    .string()
    .max(500)
    .optional()
    .describe('Human-readable reason for the rollback (e.g. "desfaz tom muito formal").'),
})

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function revertPromptTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'revert_prompt',
    metadata: { isReadOnly: false, isConcurrencySafe: false, requiresApproval: true },
    tool: tool({
      description:
        'Reverts (undo/rollback) the active agent prompt to a PRIOR version. The agent is ' +
        'resolved automatically from the active project — do NOT provide agentId. Provide ' +
        '`targetVersionId` for a specific version, or `target: "previous"` to step back one ' +
        'version. Creates a NEW draft BuilderPromptVersion (tagged rollback) with the old ' +
        'content — non-destructive and not published until the user publishes. Use when the ' +
        'user says "desfaz", "volta a versão anterior", or "reverte o prompt".',
      inputSchema: revertPromptInputSchema,
      execute: async (input) => {
        try {
          if (!input.targetVersionId && !input.target) {
            return {
              success: false as const,
              message: 'Provide "targetVersionId" or set "target" to "previous".',
            }
          }

          // Resolve the REAL agent from the active project (LLM-provided ids
          // are ignored when divergent — they tend to be hallucinated).
          const resolved = await resolveProjectAgent(ctx, input.agentId)
          if (!resolved.ok) {
            return { success: false as const, message: resolved.message }
          }
          const agentId = resolved.agentId

          // Active version (prefer published, fall back to latest draft) — same
          // ordering as edit_prompt_section so "previous" is well-defined.
          const activeVersion = await database.builderPromptVersion.findFirst({
            where: { aiAgentId: agentId },
            orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { versionNumber: 'desc' }],
            select: { id: true, versionNumber: true },
          })
          if (!activeVersion) {
            return { success: false as const, message: 'No prompt version history found for this agent' }
          }

          // Resolve the target version (explicit id OR "previous").
          const target = input.targetVersionId
            ? await database.builderPromptVersion.findFirst({
                where: { id: input.targetVersionId, aiAgentId: agentId },
                select: { id: true, versionNumber: true, content: true },
              })
            : await database.builderPromptVersion.findFirst({
                where: { aiAgentId: agentId, versionNumber: { lt: activeVersion.versionNumber } },
                orderBy: { versionNumber: 'desc' },
                select: { id: true, versionNumber: true, content: true },
              })

          if (!target) {
            return {
              success: false as const,
              message: input.targetVersionId
                ? 'Target version not found for this agent'
                : 'No earlier version to revert to — this agent has only one version',
            }
          }
          if (target.id === activeVersion.id) {
            return {
              success: false as const,
              message: `Target v${target.versionNumber} is already the active version — nothing to revert`,
            }
          }

          // Persist a NEW draft carrying the old content (publishedAt stays null).
          const nextVersion = activeVersion.versionNumber + 1
          const version = await database.builderPromptVersion.create({
            data: {
              aiAgentId: agentId,
              versionNumber: nextVersion,
              content: target.content,
              description: input.description ?? `revert_prompt: rollback to v${target.versionNumber}`,
              createdBy: 'rollback',
            },
            select: { id: true },
          })

          return {
            success: true as const,
            versionNumber: nextVersion,
            versionId: version.id,
            revertedToVersionNumber: target.versionNumber,
            revertedToVersionId: target.id,
            message:
              `Rolled back to v${target.versionNumber} — new draft v${nextVersion} created. Not yet published.`,
          }
        } catch (err) {
          return {
            success: false as const,
            message: err instanceof Error ? err.message : 'Failed to revert prompt',
          }
        }
      },
    }),
  })
}
