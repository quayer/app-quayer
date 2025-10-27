'use client'

import React from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <Alert variant="destructive" className="max-w-lg">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro na Aplicação</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="text-sm mb-4">
                Ocorreu um erro inesperado. Por favor, tente recarregar a página.
              </p>
              <details className="text-xs opacity-70 mb-4">
                <summary className="cursor-pointer">Detalhes técnicos</summary>
                <pre className="mt-2 p-2 bg-black/10 rounded overflow-auto">
                  {this.state.error?.message}
                </pre>
              </details>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                Recarregar Página
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )
    }

    return this.props.children
  }
}