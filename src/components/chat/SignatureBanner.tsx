'use client'

import { useState, useEffect } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertTriangle, X, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface SignatureBannerProps {
  isConfigured: boolean
  onDismiss?: () => void
}

const DISMISS_KEY = 'signature_banner_dismissed'
const DISMISS_DAYS = 7

export function SignatureBanner({ isConfigured, onDismiss }: SignatureBannerProps) {
  const [isDismissed, setIsDismissed] = useState(true) // Start hidden to avoid flash

  useEffect(() => {
    if (isConfigured) {
      setIsDismissed(true)
      return
    }

    const dismissedAt = localStorage.getItem(DISMISS_KEY)
    if (dismissedAt) {
      const dismissDate = new Date(dismissedAt)
      const now = new Date()
      const daysDiff = (now.getTime() - dismissDate.getTime()) / (1000 * 60 * 60 * 24)
      setIsDismissed(daysDiff < DISMISS_DAYS)
    } else {
      setIsDismissed(false)
    }
  }, [isConfigured])

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString())
    setIsDismissed(true)
    onDismiss?.()
  }

  if (isDismissed || isConfigured) return null

  return (
    <Alert
      className="mb-3 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
    >
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertDescription className="flex items-center justify-between flex-1 ml-2">
        <span className="text-sm text-amber-800 dark:text-amber-200">
          A assinatura de atendimento nao esta configurada.
          Os clientes nao saberao com quem estao falando.
        </span>
        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          <Button variant="link" size="sm" asChild className="text-amber-700 dark:text-amber-300 p-0 h-auto">
            <Link href="/integracoes/settings#assinatura">
              Configurar agora
              <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-amber-600 hover:text-amber-800 hover:bg-amber-100"
            onClick={handleDismiss}
            aria-label="Fechar alerta de assinatura"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
