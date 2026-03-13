import { igniter } from '@/igniter'
import { instancesController } from '@/server/features/instances/controllers/instances.controller'
import { shareController } from '@/server/features/share'
import { authController } from '@/server/features/auth/controllers/auth.controller'
import { organizationsController } from '@/server/features/organizations'
import { projectsController } from '@/server/features/projects'
import { webhooksController } from '@/server/features/webhooks'
import { onboardingController } from '@/server/features/onboarding/controllers/onboarding.controller'
import { invitationsController } from '@/server/features/invitations'
import { dashboardController } from '@/server/features/dashboard'
import { chatsController, messagesController, mediaController } from '@/server/features/messages'
import { sessionsController } from '@/server/features/sessions'
import { auditController } from '@/server/features/audit'
import { notificationsController } from '@/server/features/notifications'
import { deviceSessionsController } from '@/server/features/device-sessions'
import { ipRulesController } from '@/server/features/ip-rules'
import { filesController } from '@/server/features/files'
import { customRolesController } from '@/server/features/permissions/controllers/custom-roles.controller'
import { verifiedDomainsController } from '@/server/features/verified-domains/controllers/verified-domains.controller'
import { scimTokensController } from '@/server/features/scim-tokens/controllers/scim-tokens.controller'

/**
 * @description Main application router configuration
 * @see https://github.com/felipebarcelospro/igniter-js
 */
export const AppRouter = igniter.router({
  controllers: {
    auth: authController,
    onboarding: onboardingController,
    organizations: organizationsController,
    invitations: invitationsController,
    dashboard: dashboardController,
    chats: chatsController,
    messages: messagesController,
    media: mediaController,
    projects: projectsController,
    webhooks: webhooksController,
    instances: instancesController,
    share: shareController,
    sessions: sessionsController,
    audit: auditController,
    notifications: notificationsController,
    deviceSessions: deviceSessionsController,
    ipRules: ipRulesController,
    files: filesController,
    customRoles: customRolesController,
    verifiedDomains: verifiedDomainsController,
    scimTokens: scimTokensController,
  }
})

export type AppRouterType = typeof AppRouter
