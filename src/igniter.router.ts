import { igniter } from '@/igniter'
import { exampleController } from '@/features/example'
import { instancesController } from '@/features/instances/controllers/instances.controller'
import { shareController } from '@/features/share'
import { authController } from '@/features/auth/controllers/auth.controller'
import { organizationsController } from '@/features/organizations'
import { projectsController } from '@/features/projects'
import { webhooksController } from '@/features/webhooks'
// FIXME: Temporarily disabled - needs migration to igniter.controller()
// import { uazapiWebhooksController, uazapiWebhooksEnhancedController } from '@/features/webhooks'
import { webhooksReceiverController } from '@/features/webhooks/webhooks-receiver.controller'
// FIXME: Temporarily disabled
// import { connectionsController } from '@/features/connections'
import { onboardingController } from '@/features/onboarding/controllers/onboarding.controller'
import { invitationsController } from '@/features/invitations'
import { dashboardController } from '@/features/dashboard'
import { chatsController, messagesController, mediaController } from '@/features/messages'
import { sessionsController } from '@/features/sessions'
import { contactsController } from '@/features/contacts'
import { tabulationsController } from '@/features/tabulations'
import { departmentsController } from '@/features/departments'
import { attributesController, contactAttributeController } from '@/features/attributes'
import { kanbanController } from '@/features/kanban'
import { labelsController } from '@/features/labels'
import { observationsController } from '@/features/observations'
import { filesController } from '@/features/files'
import { groupsController } from '@/features/groups'
import { sseController } from '@/features/sse'
import { callsController } from '@/features/calls'
import { analyticsController } from '@/features/analytics/controllers/analytics.controller'

/**
 * @description Main application router configuration
 * @see https://github.com/felipebarcelospro/igniter-js
 */
export const AppRouter = igniter.router({
  controllers: {
    auth: authController,
    analytics: analyticsController,
    onboarding: onboardingController,
    organizations: organizationsController,
    invitations: invitationsController,
    dashboard: dashboardController,
    contacts: contactsController,
    tabulations: tabulationsController,
    departments: departmentsController,
    attribute: attributesController,
    'contact-attribute': contactAttributeController,
    kanban: kanbanController,
    labels: labelsController,
    'contact-observation': observationsController,
    files: filesController,
    chats: chatsController,
    messages: messagesController,
    media: mediaController,
    sessions: sessionsController,
    groups: groupsController,
    projects: projectsController,
    webhooks: webhooksController,
    // FIXME: Temporarily disabled - needs migration to igniter.controller()
    // 'uazapi-webhooks': uazapiWebhooksController,
    // 'uazapi-webhooks-enhanced': uazapiWebhooksEnhancedController,
    // FIXME: Temporarily disabled - needs migration to igniter.controller()
    // connections: connectionsController,
    // 'connection-messages': connectionMessagesController,
    // 'connections-realtime': connectionsRealtimeController,
    'webhooks-receiver': webhooksReceiverController,
    calls: callsController,
    sse: sseController,
    example: exampleController,
    instances: instancesController,
    share: shareController,
  }
})

export type AppRouterType = typeof AppRouter
