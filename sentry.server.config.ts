import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
    release: process.env.SENTRY_RELEASE || undefined,
    tracesSampleRate: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 0.05 : 0.2,
    // Next.js usa exceptions como control-flow para redirect/notFound — não são erros.
    ignoreErrors: ['NEXT_REDIRECT', 'NEXT_NOT_FOUND'],
  })
}
