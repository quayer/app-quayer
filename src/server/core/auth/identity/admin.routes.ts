/**
 * Identity — Admin routes
 *
 * Action: listUsers (GET /users)
 * Operações restritas a role=admin. Filtra por organização do usuário (multi-tenant).
 */

import { igniter } from '@/igniter';
import { authProcedure } from '../procedures/auth.procedure';
import { csrfProcedure } from '../procedures/csrf.procedure';

export const adminRoutes = {
  /**
   * List Users (Admin only)
   */
  listUsers: igniter.query({
    name: 'List Users',
    description: 'List all users (admin only)',
    path: '/users',
    method: 'GET',
    use: [authProcedure({ required: true }), csrfProcedure()],
    handler: async ({ request, response, context }) => {
      const user = context.auth?.session?.user;

      if (!user) {
        return response.status(401).json({ error: 'Not authenticated' });
      }

      // Verificar se é admin
      if (user.role !== 'admin') {
        return response.status(403).json({ error: 'Admin access required' });
      }

      // Filtrar por organização do usuário (multi-tenant)
      const orgId = user.currentOrgId;
      if (!orgId) {
        return response.status(400).json({ error: 'No organization selected' });
      }

      const users = await context.db.user.findMany({
        where: {
          organizations: { some: { organizationId: orgId } },
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          emailVerified: true,
          currentOrgId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return response.success(users);
    },
  }),
};
