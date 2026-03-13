"use client"

import { useCallback, useRef } from "react"
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile"
import { toast } from "sonner"

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void
  onError?: () => void
  onExpire?: () => void
  action?: string
}

/**
 * Cloudflare Turnstile anti-bot widget.
 * Only renders when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 * Mode: managed (invisible for humans, visual challenge only if suspicious).
 */
export function TurnstileWidget({
  onSuccess,
  onError,
  onExpire,
  action,
}: TurnstileWidgetProps) {
  const ref = useRef<TurnstileInstance | null>(null)

  const handleError = useCallback(() => {
    toast.error("Verificação falhou. Tente novamente.")
    ref.current?.reset()
    onError?.()
  }, [onError])

  const handleExpire = useCallback(() => {
    toast.error("Verificação expirou. Tente novamente.")
    ref.current?.reset()
    onExpire?.()
  }, [onExpire])

  if (!SITE_KEY) return null

  return (
    <div aria-label="Verificação de segurança" role="group">
      <Turnstile
        ref={ref}
        siteKey={SITE_KEY}
        onSuccess={onSuccess}
        onError={handleError}
        onExpire={handleExpire}
        options={{
          action,
          size: "flexible",
          theme: "auto",
        }}
      />
    </div>
  )
}
