import { igniter } from '@/igniter'
import { instancesController } from '@/server/communication/instances/controllers/instances.controller'
import { shareController } from '@/server/communication/share'
import { authController } from '@/server/core/auth/controllers/auth.controller'
import { organizationsController } from '@/server/core/organizations'
import { projectsController } from '@/server/crm/projects'
import { webhooksController } from '@/server/features-module/webhooks'
import { onboardingController } from '@/server/core/onboarding/controllers/onboarding.controller'
import { invitationsController } from '@/server/core/invitations'
import { dashboardController } from '@/server/features-module/dashboard'
import { chatsController, messagesController, mediaController } from '@/server/communication/messages'
import { sessionsController } from '@/server/core/sessions'
import { auditController } from '@/server/features-module/audit'
import { notificationsController } from '@/server/core/notifications'
import { deviceSessionsController } from '@/server/core/device-sessions'
import { ipRulesController } from '@/server/core/ip-rules'
import { filesController } from '@/server/communication/files'
import { customRolesController } from '@/server/core/permissions/controllers/custom-roles.controller'
import { verifiedDomainsController } from '@/server/core/verified-domains/controllers/verified-domains.controller'
import { scimTokensController } from '@/server/core/scim-tokens/controllers/scim-tokens.controller'
import { systemSettingsController } from '@/server/core/system-settings/controllers/system-settings.controller'
import { apiKeysController } from '@/server/core/api-keys/controllers/api-keys.controller'
import { connectionSettingsController } from '@/server/communication/connection-settings/controllers/connection-settings.controller'
import { plansController } from '@/server/core/billing/controllers/plans.controller'
import { subscriptionsController } from '@/server/core/billing/controllers/subscriptions.controller'
import { invoicesController } from '@/server/core/billing/controllers/invoices.controller'
import { billingWebhooksController } from '@/server/core/billing/controllers/billing-webhooks.controller'
import { billingHealthController } from '@/server/core/billing/controllers/billing-health.controller'
import { templatesController } from '@/server/communication/templates'
import { flowsController } from '@/server/communication/flows'
import { campaignsController } from '@/server/communication/campaigns'
import { businessProfileController } from '@/server/communication/business-profile'
import { aiAgentsController } from '@/server/ai-module/ai-agents/controllers/ai-agents.controller'
import { builderController } from '@/server/ai-module/builder/builder.controller'
import { boardsController } from '@/server/features-module/boards'

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
    'system-settings': systemSettingsController,
    'api-keys': apiKeysController,
    'connection-settings': connectionSettingsController,
    plans: plansController,
    subscriptions: subscriptionsController,
    invoices: invoicesController,
    'billing-webhooks': billingWebhooksController,
    'billing-health': billingHealthController,
    templates: templatesController,
    flows: flowsController,
    campaigns: campaignsController,
    'business-profile': businessProfileController,
    'ai-agents': aiAgentsController,
    builder: builderController,
    boards: boardsController,
  }
})

export type AppRouterType = typeof AppRouter
