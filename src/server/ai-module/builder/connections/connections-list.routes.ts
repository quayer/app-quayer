/**
 * Connections List Route — lista as instâncias WhatsApp da org (B2 warm transfer).
 *
 * Expõe 1 action read-only sob `/builder` (composta no builder controller):
 *   GET /builder/connections/list — id/name/phoneNumber/status das conexões
 *       WHATSAPP da org ativa, para o card `handoff_pairing` deixar o dono
 *       ATRIBUIR uma instância própria a cada atendente (warm transfer).
 *
 * Org-scoped (sempre filtra por user.currentOrgId). Read-only, sem migration.
 * Degradação: sem org → badRequest; sem conexões → lista vazia.
 *
 * Contrato: docs/AUTH_MAP.md (rota anotada). Registro no controller é manual.
 */

import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { database } from '@/server/services/database'

type AuthedUser = { id: string; currentOrgId?: string | null }

// ---------------------------------------------------------------------------
// GET /builder/connections/list
// ---------------------------------------------------------------------------

const listConnections = igniter.query({
  name: 'List WhatsApp Connections',
  description:
    'Lista as conexões WhatsApp (instâncias) da organização ativa — id, nome, número e status — para o card handoff_pairing atribuir uma instância própria a cada atendente (warm transfer). Org-scoped, read-only.',
  // Relativo ao prefixo do builderController ('/builder') — NÃO repetir '/builder'.
  path: '/connections/list' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }

    const connections = await database.connection.findMany({
      where: { organizationId: user.currentOrgId, channel: 'WHATSAPP' },
      select: { id: true, name: true, phoneNumber: true, status: true },
      orderBy: { createdAt: 'desc' },
    })

    return response.success({ connections })
  },
})

export const connectionsListRoutes = { listConnections }
