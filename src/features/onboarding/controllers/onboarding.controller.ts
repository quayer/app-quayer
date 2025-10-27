/**
 * Onboarding Controller
 *
 * Handles first-time user onboarding flow
 */

import { igniter } from '@/igniter';
import { PrismaClient } from '@prisma/client';
import { completeOnboardingSchema } from '../onboarding.schemas';
import { signAccessToken } from '@/lib/auth/jwt';
import { UserRole } from '@/lib/auth/roles';

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
      body: completeOnboardingSchema,
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
          return response.unauthorized({ error: 'Not authenticated' });
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
          return response.notFound({ error: 'User not found' });
        }

        // Check if onboarding already completed
        if (user.onboardingCompleted) {
          return response.badRequest({ error: 'Onboarding already completed' });
        }

        // Check if document already exists
        const existingOrg = await db.organization.findUnique({
          where: { document },
        });

        if (existingOrg) {
          return response.badRequest({ error: 'Documento já cadastrado para outra organização' });
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

        // Generate new access token with organizationId
        const accessToken = signAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId: organization.id,
          organizationRole: 'master',
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
