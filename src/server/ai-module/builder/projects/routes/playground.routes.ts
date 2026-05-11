/**
 * Builder Projects — Playground routes
 * Actions: playgroundStream
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { playgroundStreamBodySchema } from '../../builder.schemas'
import { getDatabase } from '@/server/services/database'
import {
  processPlaygroundStream,
  type AgentStreamEvent,
} from '@/server/ai-module/ai-agents/agent-runtime.service'

// ---------------------------------------------------------------------------
// Shared param schema
// ---------------------------------------------------------------------------

const playgroundProjectParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})

// ---------------------------------------------------------------------------
// Tipagem mínima do usuário autenticado — evita `any` espalhado.
// ---------------------------------------------------------------------------

type AuthedUser = {
  id: string
  currentOrgId?: string | null
  role?: string | null
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const playgroundRoutes = {
  // ==========================================
  // PLAYGROUND STREAM — POST /projects/:id/playground/stream
  // ==========================================
  playgroundStream: igniter.mutation({
    name: 'Playground Stream',
    description:
      'Stateless SSE stream for testing an agent in the Playground tab. ' +
      'Does NOT persist any messages, tool calls, or metrics.',
    path: '/projects/:id/playground/stream' as const,
    method: 'POST',
    use: [authOrApiKeyProcedure({ required: true })],
    body: playgroundStreamBodySchema,
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = playgroundProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const { message, history: rawHistory } = request.body
      const history = rawHistory ?? []

      const db = getDatabase()
      const project = await db.builderProject.findFirst({
        where: { id, organizationId: user.currentOrgId },
        select: { id: true, aiAgentId: true },
      })

      if (!project) return response.notFound('Projeto não encontrado')
      if (!project.aiAgentId) {
        return response.notFound('Este projeto ainda não tem um agente vinculado')
      }

      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const sendEvent = (event: AgentStreamEvent) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            )
          }
          try {
            for await (const ev of processPlaygroundStream({
              agentConfigId: project.aiAgentId!,
              organizationId: user!.currentOrgId!,
              message,
              history,
            })) {
              sendEvent(ev)
              if (ev.type === 'finish' || ev.type === 'error') break
            }
          } catch (fatal: unknown) {
            const msg = fatal instanceof Error ? fatal.message : 'Unknown error'
            console.error('[playgroundStream] Fatal:', fatal)
            try {
              sendEvent({ type: 'error', message: msg })
            } catch {
              // already closing
            }
          } finally {
            try { controller.close() } catch { /* already closed */ }
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
}
