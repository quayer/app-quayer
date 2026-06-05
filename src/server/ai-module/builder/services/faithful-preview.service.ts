/**
 * faithful-preview.service — QH-08
 *
 * Provides a non-streaming wrapper around the real runtime's
 * `processPlaygroundStream` so the Builder playground uses the EXACT same
 * execution path as production — same tools, same prompt resolution, same
 * BYOK credential lookup, same model routing — with zero side-effects:
 *
 *   NO  → message persisted to DB
 *   NO  → WhatsApp outbound message sent
 *   NO  → AgentRuntimeDecision row written
 *   NO  → session cost incremented in Redis
 *   NO  → contact lock acquired
 *
 * Those guarantees come from the runtime itself: `processPlaygroundStream`
 * already skips every one of those side-effects (see agent-runtime.service.ts
 * lines 1338-1560). This service is a thin, typed façade that:
 *   1. Validates input with Zod.
 *   2. Resolves agentConfigId from projectId (org-scoped DB query).
 *   3. Drains the async-generator into a single structured response.
 *
 * Side-effects that DO run (intentional — same as real runtime):
 *   YES → built-in & custom tools execute (e.g. get_pricing, search_contacts)
 *         These are needed for a *faithful* preview. To run a fully sandboxed
 *         "dry-run" (no tools), a future flag `dryRun: true` could replace the
 *         toolset with no-ops — that is out of scope for QH-08.
 */

import { z } from 'zod'
import { getDatabase } from '@/server/services/database'
import {
  processPlaygroundStream,
} from '@/server/ai-module/ai-agents/agent-runtime.service'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const faithfulPreviewInputSchema = z.object({
  projectId: z.string().uuid('projectId deve ser um UUID válido'),
  organizationId: z.string().min(1, 'organizationId é obrigatório'),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
      }),
    )
    .min(1, 'messages não pode ser vazio'),
})

export type FaithfulPreviewInput = z.infer<typeof faithfulPreviewInputSchema>

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface FaithfulPreviewResult {
  reply: string
  toolCalls: string[]
  modelUsed: string
  provider: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  cost: {
    inputCost: number
    outputCost: number
    totalCost: number
  }
  latencyMs: number
}

// ---------------------------------------------------------------------------
// Internal: split the last user message from the history
// ---------------------------------------------------------------------------

function splitMessagesForRuntime(
  messages: FaithfulPreviewInput['messages'],
): {
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
} {
  // The runtime expects the latest user message as a separate string.
  // Everything before it becomes the history array.
  const last = messages[messages.length - 1]!
  if (last.role !== 'user') {
    throw new Error(
      `O último elemento de messages deve ter role "user", mas foi "${last.role}"`,
    )
  }
  return {
    message: last.content,
    history: messages.slice(0, -1) as Array<{
      role: 'user' | 'assistant'
      content: string
    }>,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs a faithful, side-effect-free preview of an agent's response.
 *
 * Throws on validation failure or when the project / agent is not found.
 * Returns a structured result (not a stream) for simpler consumption from
 * route handlers and the Builder meta-agent tools.
 */
export async function runFaithfulPreview(
  rawInput: FaithfulPreviewInput,
): Promise<FaithfulPreviewResult> {
  // 1. Validate
  const input = faithfulPreviewInputSchema.parse(rawInput)

  // 2. Resolve agentConfigId from projectId (org-scoped)
  const db = getDatabase()
  const project = await db.builderProject.findFirst({
    where: { id: input.projectId, organizationId: input.organizationId },
    select: { id: true, aiAgentId: true },
  })

  if (!project) {
    throw new Error(`Projeto ${input.projectId} não encontrado nesta organização`)
  }
  if (!project.aiAgentId) {
    throw new Error(
      `Projeto ${input.projectId} ainda não possui um agente vinculado. ` +
        'Publique o agente antes de usar o playground fiel.',
    )
  }

  // 3. Split last user message from history (runtime signature requirement)
  const { message, history } = splitMessagesForRuntime(input.messages)

  // 4. Drain the real playground stream
  let reply = ''
  const toolCalls: string[] = []
  let modelUsed = ''
  let provider = ''
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  let cost = { inputCost: 0, outputCost: 0, totalCost: 0 }
  let latencyMs = 0

  for await (const event of processPlaygroundStream({
    agentConfigId: project.aiAgentId,
    organizationId: input.organizationId,
    message,
    history,
  })) {
    switch (event.type) {
      case 'text-delta':
        reply += event.text
        break
      case 'tool-call':
        toolCalls.push(event.toolName)
        break
      case 'finish':
        modelUsed = event.model
        provider = event.provider
        usage = event.usage
        cost = event.cost
        latencyMs = event.latencyMs
        break
      case 'error':
        throw new Error(`Runtime playground error: ${event.message}`)
      default:
        break
    }
  }

  return { reply, toolCalls, modelUsed, provider, usage, cost, latencyMs }
}
