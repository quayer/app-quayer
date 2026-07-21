/**
 * Builder Connections-list — porta mecânica para oRPC (lote B5 do builder).
 *
 * Origem: ./connections-list.routes.ts (1 action).
 *   listConnections GET /builder/connections/list
 */
import { database } from '@/server/services/database'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const authed = base.use(authOrApiKey)

// ==========================================
// LIST — GET /builder/connections/list
// ==========================================
export const listConnections = authed
  .route({
    method: 'GET',
    path: '/builder/connections/list',
    summary: 'List WhatsApp Connections',
  })
  .handler(async ({ context }) => {
    const { orgId } = builderOrg(context)

    const connections = await database.connection.findMany({
      where: { organizationId: orgId, channel: 'WHATSAPP' },
      select: { id: true, name: true, phoneNumber: true, status: true },
      orderBy: { createdAt: 'desc' },
    })

    return ok({ connections })
  })

export const connectionsListActions = { listConnections }
