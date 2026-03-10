import { igniter } from '@/igniter'
import { exampleController } from '@/features/example'
import { instancesController } from '@/features/instances/controllers/instances.controller'
import { shareController } from '@/features/share'
import { authController } from '@/features/auth/controllers/auth.controller'
import { organizationsController } from '@/features/organizations'
import { projectsController } from '@/features/projects'
import { webhooksController } from '@/features/webhooks'
import { onboardingController } from '@/features/onboarding/controllers/onboarding.controller'
import { invitationsController } from '@/features/invitations'
import { dashboardController } from '@/features/dashboard'
import { chatsController, messagesController, mediaController } from '@/features/messages'
import { sessionsController } from '@/features/sessions'

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
    example: exampleController,
    instances: instancesController,
    share: shareController,
    sessions: sessionsController,
  }
})

export type AppRouterType = typeof AppRouter
