/**
 * Session — Organization routes
 *
 * Action: switchOrganization (POST /switch-organization)
 * Troca a org ativa do usuario, rotaciona refresh token e emite novo access token.
 */

import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import { switchOrganizationSchema } from '../auth.schemas';
import { signAccessToken, signRefreshToken, verifyRefreshToken, getExpirationDate } from '@/lib/auth/jwt';
import { authProcedure } from '../procedures/auth.procedure';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { UserRole } from '@/lib/auth/roles';
import {
  createAuditLog,
  setAuthCookies,
} from '../_shared/helpers';

export const organizationRoutes = {
  /**
   * Switch Organization
   */
  switchOrganization: igniter.mutation({
    name: 'Switch Organization',
    description: 'Switch current organization',
    path: '/switch-organization',
    method: 'POST',
    body: switchOrganizationSchema,
    use: [authProcedure({ required: true }), csrfProcedure()],
    handler: async ({ request, response, context }) => {
      const user = context.auth?.session?.user;
      if (!user) {
        return response.status(401).json({ error: 'Not authenticated' });
      }

      const { organizationId } = request.body;

      // Buscar organizações ativas do usuário (authProcedure já incluiu)
      const userWithOrgs = await db.user.findUnique({
        where: { id: user.id },
        include: {
          organizations: {
            where: { isActive: true },
            include: { organization: true },
          },
        },
      });

      if (!userWithOrgs) {
        return response.status(404).json({ error: 'User not found' });
      }

      // Verificar se usuário pertence à organização (ou é admin)
      const userOrg = userWithOrgs.organizations.find(
        (org) => org.organizationId === organizationId
      );

      if (!userOrg && user.role !== 'admin') {
        return response.status(403).json({ error: 'Access denied to this organization' });
      }

      // Admin pode trocar para qualquer org, mas precisa verificar se existe
      if (user.role === 'admin' && !userOrg) {
        const orgExists = await db.organization.findUnique({
          where: { id: organizationId },
        });
        if (!orgExists) {
          return response.status(404).json({ error: 'Organization not found' });
        }
      }

      // Atualizar organização atual
      await db.user.update({
        where: { id: user.id },
        data: { currentOrgId: organizationId },
      });

      // Gerar novo access token com organizationId atualizado
      const accessToken = signAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role as UserRole,
        currentOrgId: organizationId,
        organizationRole: userOrg?.role as any,
        needsOnboarding: !user.onboardingCompleted, // ✅ Incluir no token para middleware
      });

      // Rotate refresh token: revoke current, issue a new one
      const cookieHeader = request.headers.get('cookie') || '';
      const currentRawRefreshToken = cookieHeader
        .split(';')
        .map((c: string) => c.trim())
        .find((c: string) => c.startsWith('refreshToken='))
        ?.split('=')
        .slice(1)
        .join('=');

      let newRefreshToken: string | undefined;

      if (currentRawRefreshToken) {
        const currentPayload = verifyRefreshToken(currentRawRefreshToken);
        if (currentPayload) {
          await db.refreshToken.update({
            where: { id: currentPayload.tokenId },
            data: { revokedAt: new Date() },
          });
        }
      }

      const refreshTokenData = await db.refreshToken.create({
        data: {
          userId: user.id,
          token: signRefreshToken({ userId: user.id, tokenId: '' }),
          expiresAt: getExpirationDate('7d'),
        },
      });

      newRefreshToken = signRefreshToken({
        userId: user.id,
        tokenId: refreshTokenData.id,
      });

      await db.refreshToken.update({
        where: { id: refreshTokenData.id },
        data: { token: newRefreshToken },
      });

      // Set new accessToken cookie with updated org and rotated refresh token
      setAuthCookies(response, accessToken, newRefreshToken);

      // Audit log — registrar troca de organização
      await createAuditLog(
        'auth.switch_organization',
        user.id,
        request,
        {
          fromOrgId: user.currentOrgId ?? null,
          toOrgId: organizationId,
          organizationRole: userOrg?.role ?? null,
        },
        organizationId,
      );

      return response.success({
        currentOrgId: organizationId,
        organizationRole: userOrg?.role || null,
      });
    },
  }),
};
