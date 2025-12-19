/**
 * Onboarding Controller
 *
 * Handles first-time user onboarding flow
 */

import { igniter } from '@/igniter';
import { PrismaClient } from '@prisma/client';
import { completeOnboardingSchema } from '../onboarding.schemas';
import { signAccessToken } from '@/lib/auth/jwt';
import { UserRole, OrganizationRole } from '@/lib/auth/roles';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';

const db = new PrismaClient();

export const onboardingController = igniter.controller({
  name: 'onboarding',
  path: '/onboarding',
  description: 'User onboarding management',
  actions: {
    /**
     * Complete Onboarding
     * Creates organization and links user as master
     */
    complete: igniter.mutation({
      name: 'Complete Onboarding',
      description: 'Complete user onboarding by creating organization',
      path: '/complete',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: completeOnboardingSchema,
      handler: async ({ request, response, context }) => {
        // ✅ SECURITY FIX: Use authenticated user from context instead of forged header
        const userId = context.user?.id;
        if (!userId) {
          return response.unauthorized('Not authenticated');
        }

        const {
          organizationName,
          organizationType,
          document,
          businessHoursStart,
          businessHoursEnd,
          businessDays,
          timezone,
        } = request.body;

        // Fetch user
        const user = await db.user.findUnique({ where: { id: userId } });
        if (!user) {
          return response.notFound('User not found');
        }

        // Check if onboarding already completed
        if (user.onboardingCompleted) {
          return response.badRequest('Onboarding already completed');
        }

        // Check if document already exists
        const existingOrg = await db.organization.findUnique({
          where: { document },
        });

        if (existingOrg) {
          return response.badRequest('Documento já cadastrado para outra organização');
        }

        // Generate organization slug
        const baseSlug = organizationName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove accents
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);

        const slug = `${baseSlug}-${Date.now()}`;

        // Create organization
        const organization = await db.organization.create({
          data: {
            name: organizationName,
            slug,
            document: document.replace(/\D/g, ''), // Remove non-digits
            type: organizationType,
            businessHoursStart,
            businessHoursEnd,
            businessDays,
            timezone,
            isActive: true,
          },
        });

        // Create UserOrganization relation (master role)
        await db.userOrganization.create({
          data: {
            userId: user.id,
            organizationId: organization.id,
            role: 'master',
            isActive: true,
          },
        });

        // Update user: mark onboarding complete and set currentOrgId
        await db.user.update({
          where: { id: userId },
          data: {
            onboardingCompleted: true,
            currentOrgId: organization.id,
            lastOrganizationId: organization.id,
          },
        });

        // Generate new access token with organizationId and needsOnboarding: false
        const accessToken = signAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId: organization.id,
          organizationRole: OrganizationRole.MASTER,
          needsOnboarding: false, // ✅ CRÍTICO: Token com onboarding completo
        });

        return response.success({
          message: 'Onboarding completed successfully',
          accessToken,
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          },
        });
      },
    }),
  },
});
