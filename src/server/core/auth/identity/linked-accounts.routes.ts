/**
 * Identity — Linked Accounts routes
 *
 * Actions: listLinkedAccounts (GET /me/linked-accounts), unlinkAccount (DELETE /me/linked-accounts/:provider)
 * Gerencia identidades externas (Google, WhatsApp) vinculadas ao usuário autenticado.
 */

import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import { z } from 'zod';
import { authProcedure } from '../procedures/auth.procedure';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { createAuditLog } from '../_shared/helpers';

export const linkedAccountsRoutes = {
  /**
   * List Linked Accounts - Retorna identidades externas vinculadas ao usuário
   */
  listLinkedAccounts: igniter.query({
    name: 'List Linked Accounts',
    description: 'List external identity providers linked to the authenticated user',
    path: '/me/linked-accounts',
    method: 'GET',
    use: [authProcedure({ required: true })],
    handler: async ({ response, context }) => {
      const authUser = context.auth?.session?.user;
      if (!authUser) return response.status(401).json({ error: 'Unauthorized' });

      const identities = await db.userIdentity.findMany({
        where: { userId: authUser.id },
        orderBy: { connectedAt: 'asc' },
      });

      return response.success(
        identities.map((i: { provider: string; identifier: string; connectedAt: Date }) => ({
          provider: i.provider,
          identifier: i.identifier,
          connectedAt: i.connectedAt.toISOString(),
        })),
      );
    },
  }),

  /**
   * Unlink Account - Remove uma identidade externa do usuário
   *
   * Impede remoção se for o único método de autenticação disponível.
   */
  unlinkAccount: igniter.mutation({
    name: 'Unlink Account',
    description: 'Remove an external identity provider from the authenticated user',
    path: '/me/linked-accounts/:provider',
    method: 'DELETE',
    use: [authProcedure({ required: true }), csrfProcedure()],
    handler: async ({ request, response, context }) => {
      const authUser = context.auth?.session?.user;
      if (!authUser) return response.status(401).json({ error: 'Unauthorized' });

      const providerParseResult = z
        .enum(['google', 'whatsapp'])
        .safeParse((request.params as { provider?: string }).provider);

      if (!providerParseResult.success) {
        return response.status(400).json({
          error: 'Provider inválido. Use "google" ou "whatsapp".',
        });
      }

      const provider = providerParseResult.data;

      const user = await db.user.findUnique({
        where: { id: authUser.id },
        select: { password: true, currentOrgId: true },
      });

      if (!user) return response.status(404).json({ error: 'Usuário não encontrado' });

      // Contagem de todos os métodos de auth disponíveis
      const [identityCount, passkeyCount] = await Promise.all([
        db.userIdentity.count({ where: { userId: authUser.id } }),
        db.passkeyCredential.count({ where: { userId: authUser.id } }),
      ]);
      const totalAuthMethods = identityCount + (user.password ? 1 : 0) + passkeyCount;

      if (totalAuthMethods <= 1) {
        return response.status(400).json({
          error:
            'Você não pode remover seu único método de login. Adicione outro método antes.',
        });
      }

      try {
        await db.userIdentity.delete({
          where: {
            userId_provider: { userId: authUser.id, provider },
          },
        });
      } catch (err: unknown) {
        // Prisma P2025: record not found
        if (
          err !== null &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code: string }).code === 'P2025'
        ) {
          return response.status(404).json({ error: 'Conta vinculada não encontrada.' });
        }
        throw err;
      }

      await createAuditLog(
        'user.identity.unlink',
        authUser.id,
        request,
        { provider },
        user.currentOrgId,
      );

      return response.success({ unlinked: true });
    },
  }),
};
