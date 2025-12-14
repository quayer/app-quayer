'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to monitoring service
    console.error('Global Error:', error)
  }, [error])

  // Global error must include html and body tags
  // Using lowercase html/body which are allowed in App Router global-error
  return (
    <html lang="pt-BR">
      <head>
        <title>Erro - Quayer</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{
        margin: 0,
        padding: 0,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f3f4f6',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{
          maxWidth: '400px',
          width: '90%',
          textAlign: 'center',
          padding: '40px 20px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}>
          <div style={{
            fontSize: '48px',
            fontWeight: 'bold',
            color: '#dc2626',
            marginBottom: '16px',
          }}>
            500
          </div>

          <h1 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#1f2937',
            margin: '0 0 12px 0',
          }}>
            Erro Interno
          </h1>

          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: '0 0 24px 0',
          }}>
            Algo deu errado. Por favor, tente novamente.
          </p>

          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
          }}>
            <button
              onClick={() => reset()}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#fff',
                background: '#10b981',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Tentar Novamente
            </button>

            <a
              href="/"
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                background: '#f3f4f6',
                border: 'none',
                borderRadius: '8px',
                textDecoration: 'none',
              }}
            >
              Ir para Inicio
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
