/**
 * Integration Builder — role gate para mutações de LIFECYCLE.
 *
 * MVP gate (plan §5):
 *   lifecycle (activate / pause / resume / delete / credentials) =
 *     ADMIN (global, platform-wide `UserRole.ADMIN`)
 *     OR MASTER (responsável da própria org, `OrganizationRole.MASTER`)
 *
 * MANAGER / USER / sem-membership ficam FORA do lifecycle nesta fase.
 *
 * Operações read-only (list / states) NÃO passam por aqui — elas são abertas
 * a qualquer membro da org e a checagem fica na própria rota (org-scope),
 * não neste helper.
 *
 * O helper NÃO lança: retorna um objeto discriminado para a rota mapear em
 * `response.forbidden(reason)` quando `allowed === false`.
 */

import { UserRole, OrganizationRole } from '@/lib/auth/roles'
import { getDatabase } from '@/server/services/database'

/** Resultado discriminado da checagem de lifecycle. */
export type IntegrationLifecycleAccess =
  | { allowed: true }
  | { allowed: false; reason: string }

const DENY_REASON =
  'Apenas administradores ou responsáveis (MASTER) da organização podem gerenciar integrações.'

/**
 * Verifica se o usuário pode executar mutações de lifecycle de integrações
 * na organização informada.
 *
 * @param user - usuário autenticado; `role` é a role global (string column).
 * @param organizationId - org-alvo da operação de lifecycle.
 * @returns `{ allowed: true }` ou `{ allowed: false, reason }` (pt-BR).
 */
export async function assertIntegrationLifecycleRole(
  user: { id: string; role?: string | null },
  organizationId: string,
): Promise<IntegrationLifecycleAccess> {
  // ADMIN global: curto-circuito, sem hit no banco.
  if (user.role === UserRole.ADMIN) {
    return { allowed: true }
  }

  // MASTER da org: precisa de membership autoritativa.
  const membership = await getDatabase().userOrganization.findFirst({
    where: {
      userId: user.id,
      organizationId,
      role: OrganizationRole.MASTER,
    },
    select: { id: true },
  })

  if (membership) {
    return { allowed: true }
  }

  // MANAGER / USER / sem-membership: fora do lifecycle no MVP.
  return { allowed: false, reason: DENY_REASON }
}
