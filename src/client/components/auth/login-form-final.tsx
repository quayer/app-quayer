"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/client/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/client/components/ui/field"
import { Input } from "@/client/components/ui/input"
import { Loader2, ArrowRight } from "lucide-react"
import { GoogleIcon } from "@/client/components/ui/google-icon"
import { WhatsAppIcon } from "@/client/components/auth/whatsapp-icon"
import Link from "next/link"
import { api } from "@/igniter.client"
import { translateAuthError } from "@/lib/utils/translate-auth-error"
import { TurnstileWidget } from "@/client/components/auth/turnstile-widget"
import { SIGNUP_ENABLED } from "@/lib/config"
import { startAuthentication } from '@simplewebauthn/browser'
import { getCsrfHeaders, ensureCsrfHeaders } from "@/client/hooks/use-csrf-token"

export function LoginFormFinal({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const runConditionalUI = async () => {
      try {
        const res = await fetch('/api/v1/auth/passkey/login/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
          credentials: 'include',
          signal,
        })
        if (!res.ok) return
        const { data: optionsWithId } = await res.json()
        const authResp = await startAuthentication({ optionsJSON: optionsWithId, useBrowserAutofill: true })
        // verify-conditional exige csrfProcedure — garante cookie + header
        const csrfHeaders = await ensureCsrfHeaders()
        const verifyRes = await fetch('/api/v1/auth/passkey/login/verify-conditional', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...csrfHeaders },
          credentials: 'include',
          signal,
          body: JSON.stringify({ response: authResp, challengeId: optionsWithId.challengeId })
        })
        if (!verifyRes.ok) return
        const { data: result } = await verifyRes.json()
        if (result.needsOnboarding) router.push('/onboarding')
        else if (result.user?.role === 'admin') router.push('/admin')
        else router.push('/')
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.debug('[Conditional UI]', err)
      }
    }

    runConditionalUI()
    return () => controller.abort()
  }, [router])

  const handleOTPRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const { data, error: apiError } = await api.auth.loginOTP.mutate({
        body: { email, 'cf-turnstile-response': turnstileToken }
      } as Parameters<typeof api.auth.loginOTP.mutate>[0])

      if (apiError) {
        throw apiError
      }

      const isNewUser = (data as { isNewUser?: boolean; magicLinkSessionId?: string } | null)?.isNewUser
      const magicLinkSessionId = (data as { isNewUser?: boolean; magicLinkSessionId?: string } | null)?.magicLinkSessionId
      const params = new URLSearchParams({ email })
      if (isNewUser) params.set('signup', 'true')
      if (magicLinkSessionId) params.set('mlsid', magicLinkSessionId)
      router.push(`/login/verify?${params.toString()}`)
    } catch (err: unknown) {
      let errorMessage = "Erro ao enviar código. Tente novamente."

      const e = err as Record<string, unknown> | undefined
      const errObj = e?.error as Record<string, unknown> | undefined
      if (errObj?.details && Array.isArray(errObj.details) && errObj.details.length > 0) {
        errorMessage = String(errObj.details[0]?.message) || errorMessage
      } else if (typeof errObj?.message === 'string') {
        errorMessage = errObj.message
      } else if (typeof e?.message === 'string') {
        errorMessage = e.message
      }

      setError(translateAuthError(errorMessage))
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true)
    setError("")

    try {
      const { data, error: apiError } = await api.auth.googleAuth.query()

      if (apiError) {
        setError("Erro ao iniciar autenticação com Google")
        setIsGoogleLoading(false)
        return
      }

      if (data && 'authUrl' in data && data.authUrl) {
        window.location.href = data.authUrl
      } else {
        setError("Erro ao obter URL de autenticação do Google")
        setIsGoogleLoading(false)
      }
    } catch {
      setError("Erro ao conectar com Google. Tente novamente.")
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-10 w-full", className)} {...props}>
      {/* Header with staggered animation */}
      <div className="space-y-3 animate-fade-in-up stagger-1">
        <h1 id="login-form-title" className="text-[1.75rem] font-bold tracking-[-0.03em] text-foreground leading-tight">
          Faça login no Quayer
        </h1>
        {SIGNUP_ENABLED && (
          <p className="text-[0.875rem] text-foreground/70 leading-relaxed">
            Não tem conta?{" "}
            <Link
              href="/signup"
              className="inline-flex items-center gap-0.5 text-foreground hover:text-foreground/80 font-medium underline underline-offset-2 transition-colors"
            >
              Comece agora
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </p>
        )}
      </div>

      <form onSubmit={handleOTPRequest} aria-labelledby="login-form-title" className="animate-fade-in-up stagger-2">
        <FieldGroup>
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-3 animate-fade-in">
              <div aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-300" role="alert" aria-live="assertive">{error}</p>
            </div>
          )}

          {/* Email input */}
          <Field>
            <FieldLabel
              htmlFor="email-input"
              className="text-[0.8rem] font-medium text-foreground/70 uppercase tracking-wider"
            >
              Email
            </FieldLabel>
            <Input
              id="email-input"
              name="email"
              type="email"
              inputMode="email"
              placeholder="voce@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading || isGoogleLoading}
              autoFocus
              autoComplete="username webauthn"
              aria-required="true"
              className="h-11 auth-input"
            />
          </Field>

          <TurnstileWidget
            onSuccess={setTurnstileToken}
            action="login"
          />

          {/* Primary submit — WhatsApp green */}
          <Field>
            <Button
              type="submit"
              variant="ghost"
              aria-label="Continuar com WhatsApp"
              className={cn(
                "w-full h-11 min-h-[44px] rounded-lg font-semibold text-[0.875rem] transition-all duration-300",
                "bg-[#075E54] text-white hover:bg-[#054C44] active:bg-[#043A34]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:opacity-60"
              )}
              disabled={isLoading || isGoogleLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Enviando...
                </>
              ) : (
                <>
                  <WhatsAppIcon className="mr-2 h-[18px] w-[18px] text-white" />
                  Continuar com WhatsApp
                </>
              )}
            </Button>
            <p className="mt-2 text-center text-[0.75rem] text-foreground/60 leading-relaxed">
              Enviaremos um código de verificação para você.
            </p>
          </Field>

          <FieldSeparator className="text-foreground/60">ou</FieldSeparator>

          {/* Google OAuth */}
          <Field>
            <Button
              variant="ghost"
              type="button"
              onClick={handleGoogleLogin}
              disabled={isGoogleLoading || isLoading}
              aria-busy={isGoogleLoading}
              className="w-full h-11 min-h-[44px] rounded-lg bg-muted text-foreground border border-border hover:bg-muted/80 hover:border-border/80 transition-all duration-200"
            >
              {isGoogleLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Conectando...
                </>
              ) : (
                <>
                  <GoogleIcon className="mr-2 size-4" aria-hidden="true" />
                  Continuar com Google
                </>
              )}
            </Button>
          </Field>
        </FieldGroup>
      </form>

      <p className="text-center text-[0.75rem] text-foreground/70 leading-relaxed animate-fade-in-up stagger-3">
        Ao entrar, você concorda com os{" "}
        <Link href="/termos" className="underline underline-offset-2 hover:text-foreground transition-colors">Termos de Serviço</Link>
        {" "}e a{" "}
        <Link href="/privacidade" className="underline underline-offset-2 hover:text-foreground transition-colors">Política de Privacidade</Link>.
      </p>
    </div>
  )
}
