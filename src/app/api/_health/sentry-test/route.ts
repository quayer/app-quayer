import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Smoke test endpoint para validar que o Sentry está capturando eventos.
 *
 * Gated por NEXT_PUBLIC_APP_ENV !== 'production' (homol/dev/test apenas).
 * Em prod retorna 404 pra não revelar a existência da rota.
 *
 * Uso:
 *   curl https://homol.quayer.com/api/_health/sentry-test
 *   # → { ok: true, eventId, environment, release }
 *
 * Depois abrir https://quayer.sentry.io/issues/?environment=homol e ver
 * o evento "Sentry smoke test (homol)".
 */
export async function GET() {
  const env = process.env.NEXT_PUBLIC_APP_ENV
  if (env === 'production') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  if (!process.env.SENTRY_DSN) {
    return NextResponse.json(
      { ok: false, reason: 'SENTRY_DSN not configured' },
      { status: 503 },
    )
  }

  const eventId = Sentry.captureException(
    new Error(`Sentry smoke test (${env ?? 'unknown'})`),
    {
      tags: { smoke_test: 'true', source: 'health-check' },
      level: 'info',
    },
  )

  const flushed = await Sentry.flush(2000)

  return NextResponse.json({
    ok: true,
    eventId,
    flushed,
    environment: env,
    release: process.env.SENTRY_RELEASE ?? null,
    timestamp: new Date().toISOString(),
  })
}
