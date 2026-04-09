/**
 * Builder Controller
 *
 * Wraps the ai-agents infrastructure with Builder-specific endpoints.
 * Follows the pattern of src/server/ai-module/ai-agents/controllers/ai-agents.controller.ts
 *
 * Stories implemented:
 *   - US-005: POST /builder/projects/create — create a new Builder project (draft)
 *   - US-007: POST /builder/projects/publish — publish a BuilderPromptVersion
 */

import { igniter } from '@/igniter'
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure'
import { database } from '@/server/services/database'
import {
  processAgentMessageStream,
  type AgentStreamEvent,
} from '@/server/ai-module/ai-agents/agent-runtime.service'
import {
  createProjectInputSchema,
  publishProjectInputSchema,
  sendChatMessageInputSchema,
} from './builder.schemas'
import { builderProjectRepository } from './repositories/builder-project.repository'
import { BUILDER_RESERVED_NAME } from './builder.constants'
import { updateStateSummary } from './services/context-summary.service'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type FinishEvent = Extract<AgentStreamEvent, { type: 'finish' }>

export const builderController = igniter.controller({
  name: 'builder',
  path: '/builder',
  description:
    'Builder — conversational wrapper over ai-agents for project creation and publishing',
  actions: {
    // ==========================================
    // US-005: CREATE PROJECT
    // ==========================================
    createProject: igniter.mutation({
      name: 'Create Builder Project',
      description:
        'Create a draft BuilderProject, its 1:1 conversation, and the first user message in one transaction',
      path: '/projects/create',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: createProjectInputSchema,
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) {
          return response.unauthorized('Não autenticado')
        }
        if (!user.currentOrgId) {
          return response.badRequest('Organização não selecionada')
        }

        const { prompt, type } = request.body

        try {
          // Derive a short human-readable name from the first line of the prompt.
          const firstLine = prompt.split('\n')[0]?.trim() ?? 'Novo projeto'
          const name =
            firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine

          const { project, conversation } =
            await builderProjectRepository.createWithInitialMessage({
              organizationId: user.currentOrgId,
              userId: user.id,
              prompt,
              type,
              name,
            })

          return response.json({
            success: true,
            data: {
              projectId: project.id,
              conversationId: conversation.id,
            },
            message: 'Projeto criado',
          })
        } catch (error: unknown) {
          console.error('[builderController] Error creating project:', error)
          const message =
            error instanceof Error ? error.message : 'Erro desconhecido'
          return response.badRequest(`Erro ao criar projeto: ${message}`)
        }
      },
    }),

    // ==========================================
    // US-007: PUBLISH PROJECT
    // ==========================================
    publishProject: igniter.mutation({
      name: 'Publish Builder Project',
      description:
        'Publish a BuilderPromptVersion and move the BuilderProject to production status. Does not touch active conversations (sticky versioning handled at runtime — US-029).',
      path: '/projects/publish',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: publishProjectInputSchema,
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) {
          return response.unauthorized('Não autenticado')
        }
        if (!user.currentOrgId) {
          return response.badRequest('Organização não selecionada')
        }

        const { projectId, promptVersionId } = request.body

        // 1. Validate project belongs to user's org
        const project = await builderProjectRepository.findProjectForOrg(
          projectId,
          user.currentOrgId
        )
        if (!project) {
          return response.notFound('Projeto não encontrado')
        }

        // 2. A Builder project must have an AI agent bound before it can publish.
        //    The agent is created by the Builder LLM via a tool call in an earlier step.
        if (!project.aiAgentId) {
          return response.badRequest(
            'Projeto ainda não possui um agente associado. Continue a conversa no Builder para criá-lo.'
          )
        }

        // 3. Validate the prompt version belongs to the project's agent
        const version = await builderProjectRepository.findPromptVersionForAgent(
          promptVersionId,
          project.aiAgentId
        )
        if (!version) {
          return response.notFound(
            'Versão de prompt não encontrada ou não pertence a este projeto'
          )
        }

        try {
          const published = await builderProjectRepository.publishVersion({
            projectId,
            promptVersionId,
            publishedBy: user.id,
          })

          return response.json({
            success: true,
            data: {
              version: published.versionNumber,
              publishedAt: published.publishedAt,
            },
            message: 'Projeto publicado',
          })
        } catch (error: any) {
          console.error('[builderController] Error publishing project:', error)
          return response.badRequest('Erro ao publicar projeto')
        }
      },
    }),

    // ==========================================
    // US-006: SEND CHAT MESSAGE (streaming)
    // ==========================================
    sendChatMessage: igniter.mutation({
      name: 'Send Builder Chat Message',
      description:
        'Send a user message to the Builder meta-agent and stream the response via SSE (text-delta, tool-call, tool-result, finish, error).',
      path: '/projects/:id/chat/message' as const,
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: sendChatMessageInputSchema,
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as
          | { id: string; currentOrgId?: string | null }
          | undefined
        if (!user) {
          return response.unauthorized('Não autenticado')
        }
        if (!user.currentOrgId) {
          return response.badRequest('Organização não selecionada')
        }

        const { id: projectId } = request.params as { id: string }
        if (!projectId || !UUID_REGEX.test(projectId)) {
          return response.badRequest('projectId inválido')
        }

        const { content } = request.body

        // 1. Fetch conversation (1:1 with project) + project for org check
        const conversation = await database.builderProjectConversation.findUnique({
          where: { projectId },
          include: { project: true },
        })
        if (!conversation) {
          return response.notFound('Conversa do Builder não encontrada')
        }
        if (conversation.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta conversa')
        }

        // 2. Find the Builder AI agent for this org
        const builderAgent = await database.aIAgentConfig.findFirst({
          where: {
            organizationId: user.currentOrgId,
            name: BUILDER_RESERVED_NAME,
          },
        })
        if (!builderAgent) {
          return response.badRequest(
            'Builder AI not initialized for this organization. Contact admin to run the register-builder-agent script.',
          )
        }

        // 3. Save the user message
        await database.builderProjectMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'user',
            content,
          },
        })

        // 4. Build conversation context for the LLM call.
        //    The runtime queries the WhatsApp `message` table by sessionId (which
        //    will be empty for our synthetic builder sessionId) — so we inline
        //    the Builder history + state summary as a banner inside messageContent.
        const history = await database.builderProjectMessage.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { role: true, content: true, createdAt: true },
        })
        const orderedHistory = history.reverse()

        const historyBlock = orderedHistory
          .map((m) => `[${m.role}] ${m.content}`)
          .join('\n')

        const stateBanner = conversation.stateSummary
          ? `# Current Project State\n${conversation.stateSummary}\n\n`
          : ''

        const augmentedMessageContent =
          `${stateBanner}# Conversation so far\n${historyBlock}\n\n# New user message\n${content}`

        // 5. Synthetic IDs (Option A) — the Builder chat is NOT a WhatsApp
        //    conversation. The runtime tolerates this: buildConversationContext
        //    returns [] for unknown sessionIds, and tools get these IDs purely
        //    as execution context (they can be treated as opaque strings).
        const streamParams = {
          agentConfigId: builderAgent.id,
          sessionId: conversation.id,
          contactId: user.id,
          connectionId: 'builder-internal',
          organizationId: user.currentOrgId,
          messageContent: augmentedMessageContent,
        }

        const encoder = new TextEncoder()
        const conversationId = conversation.id

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const sendEvent = (event: AgentStreamEvent) => {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              )
            }

            let accumulatedText = ''
            let finishEvent: FinishEvent | null = null

            try {
              for await (const event of processAgentMessageStream(streamParams)) {
                if (event.type === 'text-delta') {
                  accumulatedText += event.text
                }
                if (event.type === 'finish') {
                  finishEvent = event
                }
                sendEvent(event)

                if (event.type === 'finish') {
                  try {
                    await database.builderProjectMessage.create({
                      data: {
                        conversationId,
                        role: 'assistant',
                        content: accumulatedText,
                        toolCalls: event.toolCalls as unknown as object,
                        metadata: {
                          usage: event.usage,
                          cost: event.cost,
                          model: event.model,
                          provider: event.provider,
                          latencyMs: event.latencyMs,
                        } as unknown as object,
                      },
                    })
                    // Fire-and-forget state summary refresh.
                    void updateStateSummary(conversationId, database).catch(
                      (err: unknown) => {
                        console.error(
                          '[builderController.sendChatMessage] updateStateSummary failed:',
                          err,
                        )
                      },
                    )
                  } catch (persistErr: unknown) {
                    console.error(
                      '[builderController.sendChatMessage] Failed to persist assistant message:',
                      persistErr,
                    )
                  }
                  break
                }

                if (event.type === 'error') {
                  try {
                    await database.builderProjectMessage.create({
                      data: {
                        conversationId,
                        role: 'system_banner',
                        content: `Error from Builder AI: ${event.message}`,
                      },
                    })
                  } catch (persistErr: unknown) {
                    console.error(
                      '[builderController.sendChatMessage] Failed to persist error message:',
                      persistErr,
                    )
                  }
                  break
                }
              }
            } catch (loopErr: unknown) {
              const message =
                loopErr instanceof Error ? loopErr.message : 'Unknown stream error'
              console.error(
                '[builderController.sendChatMessage] Stream loop error:',
                loopErr,
              )
              try {
                sendEvent({ type: 'error', message })
                await database.builderProjectMessage.create({
                  data: {
                    conversationId,
                    role: 'system_banner',
                    content: `Stream error: ${message}`,
                  },
                })
              } catch {
                // swallow — we're about to close the stream anyway
              }
            } finally {
              // Reference to keep `finishEvent` from being tree-shaken as unused;
              // also useful as a breakpoint hook for observability.
              void finishEvent
              try {
                controller.close()
              } catch {
                // already closed
              }
            }
          },
        })

        return new Response(stream, {
          headers: new Headers({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          }),
        })
      },
    }),
  },
})
