/**
 * Builder Tool — list_whatsapp_instances (US-011)
 *
 * Lists existing WhatsApp `Connection` records (the Quayer name for WhatsApp
 * instances) visible to the current Builder chat context. Scoped strictly to
 * the organization of the chat so the Builder AI can never leak data across
 * tenants.
 *
 * Pattern mirrors `create-agent.tool.ts`:
 *   - Vercel AI SDK `tool()` helper
 *   - Factory function binding the runtime context
 *   - Direct Prisma access via the shared `database` singleton (no HTTP)
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'

// ---------------------------------------------------------------------------
// Context (shared shape with create-agent.tool.ts / create-instance.tool.ts)
// ---------------------------------------------------------------------------

export interface BuilderToolExecutionContext {
  /** BuilderProject.id that owns the conversation */
  projectId: string
  /** Organization.id (tenant boundary) */
  organizationId: string
  /** User.id of the Builder chat author */
  userId: string
}

// ---------------------------------------------------------------------------
// Types returned to the LLM
// ---------------------------------------------------------------------------

interface InstanceSummary {
  id: string
  name: string
  phoneNumber: string | null
  /** Normalised lowercase status string (LLM-friendly) */
  status: 'connected' | 'connecting' | 'disconnected' | 'error'
}

type ListInstancesResult =
  | { success: true; instances: InstanceSummary[]; count: number }
  | { success: false; message: string; instances: [] }

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function listInstancesTool(ctx: BuilderToolExecutionContext) {
  return tool({
    description:
      'Lists WhatsApp instances (connections) available in the current organization. Returns an array with id, name, phoneNumber, and status. Use this before create_whatsapp_instance to avoid creating duplicates, and when the user asks which WhatsApp numbers are already connected.',
    inputSchema: z.object({}),
    execute: async (): Promise<ListInstancesResult> => {
      try {
        const rows = await database.connection.findMany({
          where: {
            organizationId: ctx.organizationId,
            channel: 'WHATSAPP',
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            status: true,
          },
        })

        const instances: InstanceSummary[] = rows.map((row) => ({
          id: row.id,
          name: row.name,
          phoneNumber: row.phoneNumber,
          status: row.status.toLowerCase() as InstanceSummary['status'],
        }))

        return {
          success: true,
          instances,
          count: instances.length,
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to list WhatsApp instances'
        return { success: false, message, instances: [] }
      }
    },
  })
}
