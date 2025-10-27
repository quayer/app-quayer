/**
 * Error Display Components
 *
 * User-friendly error displays with actionable feedback
 */

import { AlertCircle, RefreshCw, ArrowLeft, Home, WifiOff, Database, Bug } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export interface ErrorDisplayProps {
  title?: string
  message?: string
  description?: string
  error?: Error
  onRetry?: () => void
  onGoBack?: () => void
  onGoHome?: () => void
  showDetails?: boolean
}

/**
 * Generic error display
 */
export function ErrorDisplay({
  title = 'Erro',
  message = 'Ocorreu um erro inesperado',
  description,
  error,
  onRetry,
  onGoBack,
  onGoHome,
  showDetails = process.env.NODE_ENV === 'development',
}: ErrorDisplayProps) {
  return (
    <div className="flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-destructive">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle>{title}</CardTitle>
          </div>
          <CardDescription className="text-base text-foreground">
            {message}
          </CardDescription>
        </CardHeader>

        {description && (
          <CardContent>
            <p className="text-sm text-muted-foreground">{description}</p>
          </CardContent>
        )}

        {showDetails && error && (
          <CardContent>
            <details className="text-xs bg-muted p-3 rounded">
              <summary className="cursor-pointer font-medium mb-2">
                Detalhes técnicos
              </summary>
              <pre className="mt-2 p-2 bg-background rounded overflow-auto">
                {error.message}
                {error.stack && `\n\n${error.stack}`}
              </pre>
            </details>
          </CardContent>
        )}

        <CardFooter className="flex gap-2">
          {onRetry && (
            <Button onClick={onRetry} variant="default">
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar Novamente
            </Button>
          )}
          {onGoBack && (
            <Button onClick={onGoBack} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          )}
          {onGoHome && (
            <Button onClick={onGoHome} variant="outline">
              <Home className="mr-2 h-4 w-4" />
              Início
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}

/**
 * Database connection error
 */
export function DatabaseErrorDisplay({ onRetry }: { onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <Database className="h-4 w-4" />
      <AlertTitle>Erro de Conexão com Banco de Dados</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Não foi possível conectar ao banco de dados. Verifique se o PostgreSQL está rodando.
        </p>
        <div className="bg-black/10 p-3 rounded text-xs">
          <p className="font-medium mb-2">Passos para resolver:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Verifique se o Docker Desktop está rodando</li>
            <li>Execute: <code className="bg-black/20 px-1 py-0.5 rounded">docker-compose up -d</code></li>
            <li>Verifique os logs: <code className="bg-black/20 px-1 py-0.5 rounded">docker-compose logs postgres</code></li>
          </ol>
        </div>
        {onRetry && (
          <Button onClick={onRetry} size="sm" variant="outline">
            <RefreshCw className="mr-2 h-3 w-3" />
            Tentar Conectar Novamente
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

/**
 * Network/API error
 */
export function NetworkErrorDisplay({ onRetry }: { onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <WifiOff className="h-4 w-4" />
      <AlertTitle>Erro de Conexão</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Não foi possível conectar ao servidor. Verifique sua conexão com a internet.
        </p>
        {onRetry && (
          <Button onClick={onRetry} size="sm" variant="outline">
            <RefreshCw className="mr-2 h-3 w-3" />
            Tentar Novamente
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

/**
 * Validation error display
 */
export function ValidationErrorDisplay({ errors }: { errors: Record<string, string> }) {
  return (
    <Alert variant="destructive">
      <Bug className="h-4 w-4" />
      <AlertTitle>Erros de Validação</AlertTitle>
      <AlertDescription>
        <ul className="list-disc list-inside space-y-1 mt-2">
          {Object.entries(errors).map(([field, message]) => (
            <li key={field} className="text-sm">
              <strong>{field}:</strong> {message}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

/**
 * Empty state (not an error, but useful)
 */
export function EmptyState({
  icon: Icon = AlertCircle,
  title = 'Nenhum resultado',
  description = 'Não encontramos nada aqui ainda.',
  action,
}: {
  icon?: React.ElementType
  title?: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <Icon className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">{description}</p>
      {action && <div>{action}</div>}
    </div>
  )
}
