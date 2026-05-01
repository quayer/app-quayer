import { igniter } from '@/igniter'
import { authController } from '@/server/core/auth/auth.controller'
import { builderController } from '@/server/ai-module/builder/builder.controller'
import { aiController } from '@/server/ai-module/ai/controllers/ai.controller'
import { logsController } from '@/server/features-module/logs/controllers/logs.controller'
import { logsSseController } from '@/server/features-module/logs/controllers/logs-sse.controller'

/**
 * @description Main application router configuration
 * @see https://github.com/felipebarcelospro/igniter-js
 */
export const AppRouter = igniter.router({
  controllers: {
    auth: authController,
    builder: builderController,
    ai: aiController,
    logs: logsController,
    'logs-sse': logsSseController,
  }
})

export type AppRouterType = typeof AppRouter
