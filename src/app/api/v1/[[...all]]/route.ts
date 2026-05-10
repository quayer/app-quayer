import { AppRouter } from '@/igniter.router'
import { nextRouteHandlerAdapter } from '@igniter-js/core/adapters'
import { withApiLogger } from '@/lib/logs/api-logger.middleware'

const adapter = nextRouteHandlerAdapter(AppRouter)

export const GET = withApiLogger('GET', adapter.GET)
export const POST = withApiLogger('POST', adapter.POST)
export const PUT = withApiLogger('PUT', adapter.PUT)
export const DELETE = withApiLogger('DELETE', adapter.DELETE)
export const PATCH = withApiLogger('PATCH', adapter.PATCH)
