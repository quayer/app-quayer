import type { PrismaClient } from '@prisma/client'

/**
 * Max length (chars) of the system prompt excerpt kept in the summary.
 * Keeps token usage bounded even if the agent has a very long system prompt.
 */
const SYSTEM_PROMPT_EXCERPT_LENGTH = 500

/**
 * Builds a textual summary of the current project state.
 *
 * Deterministic in v1 — pure string concatenation, no LLM call.
 * The shape is intentionally Markdown-like so it can be injected straight
 * into the Builder chat system prompt without further formatting.
 *
 * Future: can be upgraded to LLM-generated for even more compression.
 */
export function buildStateSummary(data: {
  project: { name: string; type: string; status: string }
  agent?: { name: string; systemPromptExcerpt: string; toolsCount: number } | null
  lastVersionNumber?: number | null
}): string {
  const { project, agent, lastVersionNumber } = data

  const agentBlock = agent
    ? [
        '# Agent',
        `- Name: ${agent.name}`,
        `- System prompt (first ${SYSTEM_PROMPT_EXCERPT_LENGTH} chars): ${agent.systemPromptExcerpt}`,
        `- Tools connected: ${agent.toolsCount}`,
        `- Current version: ${lastVersionNumber != null ? `v${lastVersionNumber}` : 'not yet created'}`,
      ].join('\n')
    : [
        '# Agent',
        '- not yet created',
      ].join('\n')

  return [
    '# Project state',
    `- Name: ${project.name}`,
    `- Type: ${project.type}`,
    `- Status: ${project.status}`,
    '',
    agentBlock,
    '',
    '# Last update',
    new Date().toISOString(),
    '',
  ].join('\n')
}

/**
 * Regenerates the `stateSummary` for a Builder conversation.
 *
 * Should be called after every turn that mutates project state
 * (tool calls, prompt edits, agent linkage, etc.).
 *
 * Steps:
 *   1. Load the conversation + project (+ optional aiAgent relation)
 *   2. Load the latest BuilderPromptVersion for that agent (if any)
 *   3. Deterministically build the summary string
 *   4. Persist it on `BuilderProjectConversation.stateSummary`
 *
 * Missing data (no agent linked, no versions yet) is handled gracefully
 * with sensible "not yet created" placeholders instead of throwing.
 *
 * @param conversationId - BuilderProjectConversation.id
 * @param prisma         - PrismaClient (accepts tx client too, so callers can
 *                         use this inside a transaction)
 * @returns the new summary string (already persisted)
 */
export async function updateStateSummary(
  conversationId: string,
  prisma: PrismaClient,
): Promise<string> {
  const conversation = await prisma.builderProjectConversation.findUnique({
    where: { id: conversationId },
    include: {
      project: {
        include: {
          aiAgent: true,
        },
      },
    },
  })

  if (!conversation) {
    throw new Error(`BuilderProjectConversation not found: ${conversationId}`)
  }

  const project = conversation.project
  const agent = project.aiAgent

  // Fetch latest prompt version for the linked agent (if any).
  let lastVersionNumber: number | null = null
  if (agent) {
    const latestVersion = await prisma.builderPromptVersion.findFirst({
      where: { aiAgentId: agent.id },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    })
    lastVersionNumber = latestVersion?.versionNumber ?? null
  }

  const summary = buildStateSummary({
    project: {
      name: project.name,
      type: project.type,
      status: project.status,
    },
    agent: agent
      ? {
          name: agent.name,
          systemPromptExcerpt: (agent.systemPrompt ?? 'not yet created').slice(
            0,
            SYSTEM_PROMPT_EXCERPT_LENGTH,
          ),
          toolsCount: Array.isArray(agent.enabledTools) ? agent.enabledTools.length : 0,
        }
      : null,
    lastVersionNumber,
  })

  await prisma.builderProjectConversation.update({
    where: { id: conversationId },
    data: { stateSummary: summary },
  })

  return summary
}
