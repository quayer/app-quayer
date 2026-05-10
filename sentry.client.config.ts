import * as Sentry from '@sentry/nextjs'

// Client-side Sentry. DSN é injetado no bundle em build-time via
// NEXT_PUBLIC_SENTRY_DSN (deploy-homol.yml passa como build-arg).
// Aponta pro projeto `quayer-frontend` (separado do backend pra ter
// quotas/alertas/dashboards independentes — server vai pra quayer-backend).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
    tracesSampleRate: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 0.05 : 0.2,
    // Session Replay: 0% por padrão (privacidade), 10% em erros pra debug.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    ignoreErrors: [
      // React control-flow / hydration
      'NEXT_REDIRECT',
      'NEXT_NOT_FOUND',
      // ResizeObserver loop bug (Chrome bug, não é erro real)
      /^ResizeObserver loop/,
      // Extensões de browser e bots
      /^TypeError: Failed to fetch$/,
    ],
  })
}
