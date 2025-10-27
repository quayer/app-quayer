'use client'

/**
 * Global Error Handler
 *
 * Catches all unhandled errors in production
 * Shows user-friendly messages while logging details
 */

import { useEffect } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to monitoring service in production
    console.error('Global error:', error)

    // TODO: Send to error tracking service (e.g., Sentry)
    // if (process.env.NODE_ENV === 'production') {
    //   Sentry.captureException(error)
    // }
  }, [error])

  const isDevelopment = process.env.NODE_ENV === 'development'

  return (
    <html lang="pt-BR">
      <body>
        <div className="flex min-h-screen items-center justify-center p-4 bg-background">
          <div className="w-full max-w-lg space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle className="text-lg font-semibold">
                Algo deu errado
              </AlertTitle>
              <AlertDescription className="mt-3 space-y-4">
                <p className="text-sm">
                  Ocorreu um erro inesperado na aplicação. Nossa equipe foi notificada
                  e estamos trabalhando para resolver o problema.
                </p>

                {isDevelopment && (
                  <details className="text-xs bg-black/10 p-3 rounded">
                    <summary className="cursor-pointer font-medium mb-2">
                      Detalhes técnicos (somente em desenvolvimento)
                    </summary>
                    <div className="space-y-2 mt-2">
                      <div>
                        <strong>Mensagem:</strong>
                        <pre className="mt-1 p-2 bg-black/20 rounded overflow-auto">
                          {error.message}
                        </pre>
                      </div>
                      {error.digest && (
                        <div>
                          <strong>Digest:</strong>
                          <code className="ml-2">{error.digest}</code>
                        </div>
                      )}
                      {error.stack && (
                        <div>
                          <strong>Stack trace:</strong>
                          <pre className="mt-1 p-2 bg-black/20 rounded overflow-auto text-xs">
                            {error.stack}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button
                    onClick={reset}
                    variant="default"
                    className="flex-1"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Tentar Novamente
                  </Button>
                  <Button
                    onClick={() => window.location.href = '/'}
                    variant="outline"
                    className="flex-1"
                  >
                    <Home className="mr-2 h-4 w-4" />
                    Ir para Início
                  </Button>
                </div>

                <p className="text-xs opacity-70 text-center">
                  Se o problema persistir, entre em contato com o suporte.
                </p>
              </AlertDescription>
            </Alert>

            {/* Helpful troubleshooting tips */}
            <Alert>
              <AlertTitle className="text-sm font-medium">
                Dicas de solução:
              </AlertTitle>
              <AlertDescription>
                <ul className="text-xs space-y-1 mt-2 list-disc list-inside">
                  <li>Recarregue a página (Ctrl+R ou Cmd+R)</li>
                  <li>Limpe o cache do navegador</li>
                  <li>Verifique sua conexão com a internet</li>
                  <li>Tente usar outro navegador</li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </body>
    </html>
  )
}
