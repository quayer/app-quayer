export async function register() {
  if (!process.env.SENTRY_DSN) {
    return
  }

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
  if (!process.env.SENTRY_DSN) {
    return
  }

  const { captureRequestError } = await import('@sentry/nextjs')
  captureRequestError(err, request as Parameters<typeof captureRequestError>[1], context)
}
