import { createRedisStoreAdapter } from '@igniter-js/adapter-redis'
import { redis } from '@/server/services/redis'

export const store = createRedisStoreAdapter(redis)
