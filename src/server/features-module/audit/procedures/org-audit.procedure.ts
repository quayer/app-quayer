/**
 * Org Audit Procedure
 *
 * Restringe acesso aos logs de auditoria da organização ativa do usuário.
 * Permite papéis: master, manager (usuários comuns NÃO acessam auditoria).
 * System admins sempre passam (acesso cross-org).
 */

import { igniter } from '@/igniter';
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure';

export type OrgAuditScope = {
  orgAudit: {
    organizationId: string;
    isSystemAdmin: boolean;
  };
};

/**
 * Procedure que valida permissões de auditoria org-scoped.
 * - Exige autenticação
 * - Admins (user.role === 'admin') sempre passam, sem scoping
 * - Demais: precisam de organizationRole 'master' ou 'manager' na org ativa
 */
export const orgAuditProcedure = igniter.procedure({
  name: 'OrgAuditProcedure',
  handler: async (_options: Record<string, unknown> = {}, ctx): Promise<OrgAuditScope | Response> => {
    const user = (ctx.context as unknown as {
      auth?: {
        session?: {
          user?:
            | (import('@prisma/client').User & {
                organizationId?: string | null;
                organizationRole?: string | null;
                currentOrgId?: string | null;
              })
            | null;
        };
      };
    }).auth?.session?.user;

    if (!user) {
      return Response.json(
        { error: 'Não autenticado' },
        { status: 401 },
      );
    }

    // System admin: acesso cross-org, sem scoping
    if (user.role === 'admin') {
      return {
        orgAudit: {
          organizationId: user.currentOrgId ?? user.organizationId ?? '',
          isSystemAdmin: true,
        },
      };
    }

    const orgId = user.currentOrgId ?? user.organizationId ?? null;
    if (!orgId) {
      return Response.json(
        { error: 'Nenhuma organização ativa selecionada' },
        { status: 403 },
      );
    }

    const orgRole = user.organizationRole ?? null;
    if (orgRole !== 'master' && orgRole !== 'manager') {
      return Response.json(
        {
          error:
            'Acesso negado: apenas administradores (master) e gerentes (manager) da organização podem visualizar a auditoria.',
        },
        { status: 403 },
      );
    }

    return {
      orgAudit: {
        organizationId: orgId,
        isSystemAdmin: false,
      },
    };
  },
});

/**
 * Combo helper: ambas as procedures precisam ser registradas em `use:`.
 * Uso: `use: [...orgAuditProcedures]`
 */
export const orgAuditProcedures = [
  authProcedure({ required: true }),
  orgAuditProcedure(),
] as const;
