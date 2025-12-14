import { igniter } from '@/igniter'
import { exampleController } from '@/features/example'
import { instancesController } from '@/features/instances/controllers/instances.controller'
import { authController } from '@/features/auth/controllers/auth.controller'
import { organizationsController } from '@/features/organizations'
import { projectsController } from '@/features/projects'
import { webhooksController } from '@/features/webhooks'
import { onboardingController } from '@/features/onboarding/controllers/onboarding.controller'
import { invitationsController } from '@/features/invitations'
import { dashboardController } from '@/features/dashboard'
import { chatsController, messagesController, mediaController } from '@/features/messages'
import { sessionsController } from '@/features/sessions'
import { departmentsController } from '@/features/departments'
import { attributesController, contactAttributeController } from '@/features/attributes'
import { labelsController } from '@/features/labels'
import { observationsController } from '@/features/observations'
import { sseController } from '@/features/sse'
import { callsController } from '@/features/calls'
import { analyticsController } from '@/features/analytics/controllers/analytics.controller'
import { contactsController } from '@/features/contacts'
import { systemSettingsController } from '@/features/system-settings'
import { logsController, logsSseController } from '@/features/logs'
import { permissionsController } from '@/features/permissions'
import { apiKeysController } from '@/features/api-keys'
import { notificationsController } from '@/features/notifications'
import { chatwootController } from '@/features/chatwoot'

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
    departments: departmentsController,
    attribute: attributesController,
    'contact-attribute': contactAttributeController,
    contacts: contactsController,
    labels: labelsController,
    'contact-observation': observationsController,
    chats: chatsController,
    messages: messagesController,
    media: mediaController,
    sessions: sessionsController,
    projects: projectsController,
    webhooks: webhooksController,
    calls: callsController,
    sse: sseController,
    example: exampleController,
    instances: instancesController,
    'system-settings': systemSettingsController,
    logs: logsController,
    'logs-sse': logsSseController,
    permissions: permissionsController,
    'api-keys': apiKeysController,
    notifications: notificationsController,
    chatwoot: chatwootController,
  }
})

export type AppRouterType = typeof AppRouter
