import { igniter } from '@/igniter'
import { authController } from '@/server/core/auth/auth.controller'
import { deviceSessionsController } from '@/server/core/auth/device-sessions/device-sessions.controller'
import { builderController } from '@/server/ai-module/builder/builder.controller'
import { messagesController } from '@/server/communication/messages/messages.controller'
import { logsController } from '@/server/features-module/logs/controllers/logs.controller'
import { logsSseController } from '@/server/features-module/logs/controllers/logs-sse.controller'
import { providersController } from '@/server/core/providers/providers.controller'

/**
 * @description Main application router configuration
 * @see https://github.com/felipebarcelospro/igniter-js
 */
export const AppRouter = igniter.router({
  controllers: {
    auth: authController,
    builder: builderController,
    'device-sessions': deviceSessionsController,
    logs: logsController,
    'logs-sse': logsSseController,
    messages: messagesController,
    providers: providersController,
  }
})

export type AppRouterType = typeof AppRouter
