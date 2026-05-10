/**
 * Magic Link — Onboarding Routes
 *
 * Expõe a action `completeOnboarding`: marca o onboarding do usuário como
 * concluído e re-emite o access token com `needsOnboarding: false` para que
 * o middleware libere o acesso ao dashboard.
 *
 * Nota: emite APENAS access token (sem refresh) — comportamento original
 * preservado. O refresh existente continua válido.
 *
 * Contratos preservados (paths, shapes de response, nomes de action).
 */

import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import { signAccessToken } from '@/lib/auth/jwt';
import { UserRole } from '@/lib/auth/roles';
import { authProcedure } from '../procedures/auth.procedure';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { createAuditLog, setAuthCookies } from '../_shared/helpers';

export const onboardingRoutes = {
  /**
   * POST /auth/onboarding/complete
   *
   * Mark user onboarding as completed and re-issue access token.
   * Requires authenticated session + valid CSRF token.
   */
  completeOnboarding: igniter.mutation({
    name: 'CompleteOnboarding',
    description: 'Mark user onboarding as completed',
    path: '/onboarding/complete',
    method: 'POST',
    use: [authProcedure({ required: true }), csrfProcedure()],
    handler: async ({ request, response, context }) => {
      const userId = context.auth?.session?.user?.id;

      if (!userId) {
        return response.unauthorized('Authentication required');
      }

      const user = await db.user.findUnique({
        where: { id: userId },
        include: {
          organizations: {
            include: {
              organization: true,
            },
          },
        },
      });

      if (!user) {
        return response.notFound('User not found');
      }

      // Verify user has an organization before completing onboarding
      if (user.organizations.length === 0) {
        return response.badRequest('Cannot complete onboarding without an organization');
      }

      const currentOrgId = user.currentOrgId || user.organizations[0].organizationId;

      const updatedUser = await db.user.update({
        where: { id: userId },
        data: {
          onboardingCompleted: true,
          currentOrgId,
        },
      });

      // Re-issue access token with needsOnboarding: false so middleware
      // grants access to the dashboard. No new refresh token — existing one remains valid.
      const currentOrgRelation = user.organizations.find(
        (org) => org.organizationId === currentOrgId,
      );
      const newAccessToken = signAccessToken({
        userId: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role as UserRole,
        currentOrgId,
        organizationRole: currentOrgRelation?.role as any,
        needsOnboarding: false,
      });
      setAuthCookies(response, newAccessToken);

      // Audit log — onboarding completed
      await createAuditLog('auth.onboarding_complete', updatedUser.id, request, {}, currentOrgId);

      return response.success({
        message: 'Onboarding completed successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          onboardingCompleted: updatedUser.onboardingCompleted,
          currentOrgId,
        },
      });
    },
  }),
};
