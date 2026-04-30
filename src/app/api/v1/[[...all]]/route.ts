import { AppRouter } from '@/igniter.router'
import { nextRouteHandlerAdapter } from '@igniter-js/core/adapters'

export const dynamic = 'force-dynamic'

export const { GET, POST, PUT, DELETE, PATCH } = nextRouteHandlerAdapter(AppRouter)
