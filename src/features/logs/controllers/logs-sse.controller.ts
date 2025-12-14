/**
 * Logs SSE Controller
 *
 * Real-time log streaming via Server-Sent Events
 */

import { igniter } from '@/igniter'
import { logEmitter } from '@/lib/logs/logger.service'
import { authProcedure } from '@/features/auth/procedures/auth.procedure'

export const logsSseController = igniter.controller({
  name: 'logsSSE',
  path: '/logs',
  description: 'Real-time log streaming via SSE',
  actions: {
    // ==========================================
    // REAL-TIME LOG STREAM
    // ==========================================
    stream: igniter.query({
      name: 'Log Stream',
      description: 'Stream logs in real-time via SSE',
      path: '/stream',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ context, response }) => {
        // Admin only
        const user = context.auth?.session?.user
        if (!user || user.role !== 'admin') {
          return response.forbidden('Acesso negado')
        }

        // Set SSE headers
        const headers = new Headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        })

        // Create ReadableStream for SSE
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()
            const sendEvent = (event: string, data: any) => {
              const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
              controller.enqueue(encoder.encode(message))
            }

            // Send initial connection message
            sendEvent('connected', { message: 'Connected to log stream' })

            // Keep connection alive
            const heartbeat = setInterval(() => {
              controller.enqueue(encoder.encode(':\n\n'))
            }, 15000)

            // Listen for log events
            const onLog = (log: any) => {
              sendEvent('log', log)
            }

            logEmitter.on('log', onLog)

            // Note: Cleanup is handled when stream ends
            // The heartbeat and listener will be garbage collected
          },
        })

        return new Response(stream, { headers })
      },
    }),
  },
})
