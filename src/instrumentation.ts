export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

export const onRequestError = async (
  err: unknown,
  request: unknown,
  context: { routerKind: string; routePath: string; routeType: string }
) => {
  const { captureRequestError } = await import('@sentry/nextjs')
  captureRequestError(err, request as Parameters<typeof captureRequestError>[1], context)
}
