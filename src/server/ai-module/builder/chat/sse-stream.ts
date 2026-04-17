/**
 * SSE stream builder for Builder chat — wraps `streamAgentResponse` into
 * a ReadableStream<Uint8Array> that serializes AgentStreamEvent into the
 * "data: <json>\n\n" SSE frame format.
 *
 * Kept in its own file so chat.routes.ts stays focused on route wiring.
 */

import type { AgentStreamEvent } from '@/server/ai-module/ai-agents/agent-runtime.service'
import {
  streamAgentResponse,
  type StreamAgentResponseParams,
} from './handlers/stream-agent-response'
import { persistErrorMessage } from './handlers/persist-message'

export function buildSseResponse(params: StreamAgentResponseParams): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: AgentStreamEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        )
      }

      try {
        for await (const ev of streamAgentResponse(params)) {
          if (ev.type === '__budget_exhausted__') {
            sendEvent({ type: 'error', message: ev.message })
            break
          }
          sendEvent(ev)
        }
      } catch (fatal: unknown) {
        const msg = fatal instanceof Error ? fatal.message : 'Unknown error'
        console.error('[chatRoutes.sendMessage] Fatal stream error:', fatal)
        try {
          sendEvent({ type: 'error', message: msg })
          await persistErrorMessage({
            conversationId: params.conversationId,
            content: `Stream error: ${msg}`,
          })
        } catch {
          // already closing
        }
      } finally {
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
}
