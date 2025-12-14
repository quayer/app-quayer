/**
 * Analytics Controller
 *
 * Receives and stores UI events from frontend
 * for debugging, analytics, and monitoring
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { logger } from '@/lib/logging/logger'

// UI Event Schema
const UIEventSchema = z.object({
  type: z.enum([
    'click',
    'navigation',
    'form_submit',
    'form_error',
    'modal_open',
    'modal_close',
    'api_call',
    'api_success',
    'api_error',
    'page_load',
    'error',
    'warning',
    'info',
    'performance',
  ]),
  element: z.string().optional(),
  page: z.string().optional(),
  timestamp: z.number(),
  sessionId: z.string(),
  userId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
})

const UIEventsBodySchema = z.object({
  events: z.array(UIEventSchema),
})

export const analyticsController = igniter.controller({
  name: 'analytics',
  path: '/analytics',
  actions: {
    /**
     * Receive UI events from frontend
     */
    receiveUIEvents: igniter.mutation({
      path: '/ui-events',
      method: 'POST',
      body: UIEventsBodySchema,
      handler: async ({ request, response }) => {
        const { events } = request.body

        try {
          // Log each event
          events.forEach((event) => {
            // Create structured log entry
            const logEntry = {
              type: 'ui_event',
              eventType: event.type,
              element: event.element,
              page: event.page,
              sessionId: event.sessionId,
              userId: event.userId,
              timestamp: new Date(event.timestamp).toISOString(),
              metadata: event.metadata,
            }

            // Log based on event type
            if (event.type === 'error') {
              logger.error('UI Error Event', logEntry)
            } else if (event.type === 'warning') {
              logger.warn('UI Warning Event', logEntry)
            } else if (event.type === 'api_error') {
              logger.error('UI API Error', logEntry)
            } else {
              logger.info('UI Event', logEntry)
            }
          })

          return response.success({
            received: events.length,
            timestamp: new Date().toISOString(),
          })
        } catch (error: any) {
          logger.error('Failed to process UI events', {
            error: error.message,
            stack: error.stack,
            eventsCount: events.length,
          })

          throw new Error('Failed to process events')
        }
      },
    }),

    /**
     * Get UI events summary (for admin debugging)
     */
    getEventsSummary: igniter.query({
      path: '/ui-events/summary',
      method: 'GET',
      query: z.object({
        sessionId: z.string().optional(),
        userId: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
      handler: async ({ request, response }) => {
        // TODO: Implement event retrieval from database or log aggregation service
        // For now, return placeholder

        return response.success({
          message: 'Events summary not yet implemented',
          note: 'Events are being logged to Winston. Implement database storage or log aggregation for querying.',
        })
      },
    }),
  },
})
