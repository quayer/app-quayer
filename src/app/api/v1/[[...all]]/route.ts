import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

async function getHandler() {
  const { AppRouter } = await import('@/igniter.router')
  const { nextRouteHandlerAdapter } = await import('@igniter-js/core/adapters')
  return nextRouteHandlerAdapter(AppRouter)
}

export async function GET(req: NextRequest, ctx: unknown) {
  const h = await getHandler()
  return h.GET(req, ctx)
}
export async function POST(req: NextRequest, ctx: unknown) {
  const h = await getHandler()
  return h.POST(req, ctx)
}
export async function PUT(req: NextRequest, ctx: unknown) {
  const h = await getHandler()
  return h.PUT(req, ctx)
}
export async function DELETE(req: NextRequest, ctx: unknown) {
  const h = await getHandler()
  return h.DELETE(req, ctx)
}
export async function PATCH(req: NextRequest, ctx: unknown) {
  const h = await getHandler()
  return h.PATCH(req, ctx)
}
