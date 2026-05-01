import { Igniter } from '@igniter-js/core'
import { createIgniterAppContext } from './igniter.context'
import { store } from '@/server/services/store'
import { logger } from '@/server/services/logger'

export const igniter = Igniter
  .context(createIgniterAppContext())
  .store(store)
  .logger(logger)
  .config({
    baseURL: process.env.NEXT_PUBLIC_IGNITER_API_URL || 'http://localhost:3000',
    basePath: process.env.NEXT_PUBLIC_IGNITER_API_BASE_PATH || '/api/v1',
  })
  .create()
