"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/client/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/client/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/client/components/ui/input-otp"
import { Loader2, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { api } from "@/igniter.client"
import { translateAuthError } from "@/lib/utils/translate-auth-error"
import { TwoFactorChallenge } from "@/client/components/auth/two-factor-challenge"
import { getCsrfHeaders } from "@/client/hooks/use-csrf-token"

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits
  if (local.length >= 10) {
    const ddd = local.slice(0, 2)
    const last4 = local.slice(-4)
    return `(${ddd}) •••••-${last4}`
  }
  return `•••• ${phone.slice(-4)}`
}

interface LoginOTPFormProps extends React.ComponentProps<"div"> {
  email?: string
  phone?: string
  magicLinkSessionId?: string
}

export function LoginOTPForm({ email, phone, magicLinkSessionId, className, ...props }: LoginOTPFormProps) {
  const identifier = phone || email
  const searchParams = useSearchParams()
  const isSignup = searchParams.get('signup') === 'true'
  const [otp, setOtp] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [canResend, setCanResend] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const [autoSubmitted, setAutoSubmitted] = useState(false)
  const [twoFactorChallengeId, setTwoFactorChallengeId] = useState<string | null>(null)
  const countdownEndRef = useRef(Date.now() + 60 * 1000)

  useEffect(() => {
    if (canResend) return
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((countdownEndRef.current - Date.now()) / 1000))
      setCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(id)
        setCanResend(true)
      }
    }, 250)
    return () => clearInterval(id)
  }, [canResend])

  // Escutar login via magic link em outra aba → redirecionar automaticamente
  useEffect(() => {
    try {
      const bc = new BroadcastChannel('quayer-auth')
      bc.onmessage = (event) => {
        if (event.data?.type === 'auth-success' && event.data?.redirectPath) {
          window.location.href = event.data.redirectPath
        }
      }
      return () => bc.close()
    } catch { /* BroadcastChannel não suportado */ }
  }, [])

  // Poll server to detect magic link verification (cross-tab, cross-browser)
  useEffect(() => {
    if (!magicLinkSessionId) return

    const POLL_INTERVAL = 3000 // 3 seconds
    const POLL_TIMEOUT = 5 * 60 * 1000 // 5 minutes
    const startTime = Date.now()
    let active = true

    const poll = async () => {
      if (!active) return

      // Timeout check
      if (Date.now() - startTime > POLL_TIMEOUT) {
        setError('Link expirado. Solicite um novo código.')
        return
      }

      try {
        const { data, error: apiError } = await api.auth.checkMagicLinkStatus.mutate({
          body: { sessionId: magicLinkSessionId }
        })

        if (apiError || !data) {
          // Non-fatal — continue polling
          if (active) setTimeout(poll, POLL_INTERVAL)
          return
        }

        const result = data as {
          verified: boolean
          expired?: boolean
          redirectPath?: string
          requiresTwoFactor?: boolean
          challengeId?: string
        }

        if (result.expired) {
          setError('Link expirado. Solicite um novo código.')
          return
        }

        if (result.verified) {
          // Magic link was verified in another tab!
          if (result.requiresTwoFactor && result.challengeId) {
            setTwoFactorChallengeId(result.challengeId)
            return
          }
          if (result.redirectPath) {
            window.location.href = result.redirectPath
            return
          }
        }

        // Not yet verified — keep polling
        if (active) setTimeout(poll, POLL_INTERVAL)
      } catch {
        // Network error — keep polling
        if (active) setTimeout(poll, POLL_INTERVAL)
      }
    }

    // Start polling after initial delay
    const timerId = setTimeout(poll, POLL_INTERVAL)

    return () => {
      active = false
      clearTimeout(timerId)
    }
  }, [magicLinkSessionId])

  const submitCode = useCallback(async (code: string) => {
    if (!identifier) {
      setError("Identificador não encontrado. Volte e tente novamente.")
      return
    }

    if (code.length !== 6) {
      setError("Digite o código de 6 dígitos")
      return
    }

    if (phone) {
      setError('')
      setIsLoading(true)
      try {
        const res = await fetch('/api/v1/auth/verify-login-otp-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
          credentials: 'include',
          body: JSON.stringify({ phone, code })
        })
        const data = await res.json()
        if (!res.ok) { setError(data?.error?.message || 'Código inválido'); setIsLoading(false); return }
        const r = data.data
        if (r.requiresTwoFactor && r.challengeId) {
          setTwoFactorChallengeId(r.challengeId)
          setIsLoading(false)
          return
        }
        if (r.needsOnboarding) window.location.href = '/onboarding'
        else window.location.href = r.user?.role === 'admin' ? '/admin' : '/'
      } catch {
        setError('Erro ao verificar código')
        setIsLoading(false)
      }
      return
    }

    if (!email) {
      setError("Email não encontrado. Volte e tente novamente.")
      return
    }

    setError("")
    setIsLoading(true)

    try {
      // Call different endpoint based on signup vs login flow
      const { data, error: apiError } = isSignup
        ? await api.auth.verifySignupOTP.mutate({
            body: { email, code }
          })
        : await api.auth.verifyLoginOTP.mutate({
            body: { email, code }
          })

      if (apiError) {
        throw apiError
      }

      const responseData = data as { user?: { role: string }; needsOnboarding?: boolean; requiresTwoFactor?: boolean; challengeId?: string } | null
      if (responseData?.requiresTwoFactor && responseData?.challengeId) {
        setTwoFactorChallengeId(responseData.challengeId)
        setIsLoading(false)
        return
      }
      if (responseData?.user) {
        // Backend seta cookies httpOnly via Set-Cookie header.
        const userRole = responseData.user.role
        const needsOnboarding = responseData.needsOnboarding

        if (needsOnboarding) {
          window.location.href = "/onboarding"
        } else {
          window.location.href = userRole === "admin" ? "/admin" : "/"
        }
      }
    } catch (err: unknown) {
      let errorMessage = "Não foi possível verificar. Tente novamente."

      const e = err as Record<string, unknown> | undefined
      const errObj = e?.error as Record<string, unknown> | undefined
      if (e?.data && typeof (e.data as Record<string, unknown>).error === 'string') {
        errorMessage = (e.data as Record<string, unknown>).error as string
      } else if (errObj?.details && Array.isArray(errObj.details) && errObj.details.length > 0) {
        errorMessage = String(errObj.details[0]?.message) || errorMessage
      } else if (typeof errObj?.message === 'string') {
        errorMessage = errObj.message
      } else if (typeof e?.message === 'string') {
        errorMessage = e.message
      } else if (typeof err === 'string') {
        errorMessage = err
      }

      errorMessage = translateAuthError(errorMessage)

      setError(errorMessage)
      setIsLoading(false)
    }
  }, [identifier, phone, email, isSignup, isLoading])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitCode(otp)
  }

  const handleResend = async () => {
    if (!canResend || !identifier) return

    setError("")
    countdownEndRef.current = Date.now() + 60 * 1000
    setCountdown(60)
    setCanResend(false)

    try {
      if (phone) {
        const res = await fetch('/api/v1/auth/login-otp-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
          credentials: 'include',
          body: JSON.stringify({ phone })
        })
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10)
          setError(`Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} minuto(s).`)
          countdownEndRef.current = Date.now() + retryAfter * 1000
          setCountdown(retryAfter)
          setCanResend(false)
          return
        }
        return
      }
      // Use different endpoint based on signup vs login flow
      // Note: Turnstile not required for resend — server exempts re-sends within active session
      // Note: signup resend needs the name, which we don't have here
      // For now, only support resend for login flow
      if (!isSignup) {
        if (!email) {
          setError("Email não encontrado. Volte e tente novamente.")
          setCanResend(true)
          setCountdown(0)
          return
        }
        await api.auth.loginOTP.mutate({ body: { email } })
      } else {
        setError("Para reenviar o código de cadastro, volte à página anterior")
        setCanResend(true)
        setCountdown(0)
      }
    } catch {
      setError("Erro ao reenviar código")
      setCanResend(true)
      setCountdown(0)
    }
  }

  // Auto-submit quando 6 dígitos preenchidos
  useEffect(() => {
    if (otp.length === 6 && !isLoading && !autoSubmitted && identifier) {
      setAutoSubmitted(true)
      submitCode(otp)
    }
    if (otp.length < 6) setAutoSubmitted(false)
  }, [otp, isLoading, autoSubmitted, identifier, submitCode])

  const handle2FASuccess = (result: { user: { role: string; currentOrgId?: string }; needsOnboarding?: boolean }) => {
    if (result.needsOnboarding) {
      window.location.href = "/onboarding"
    } else {
      window.location.href = result.user.role === "admin" ? "/admin" : "/"
    }
  }

  if (twoFactorChallengeId) {
    return (
      <TwoFactorChallenge
        challengeId={twoFactorChallengeId}
        onSuccess={handle2FASuccess}
        onCancel={() => { setTwoFactorChallengeId(null); setOtp(""); setAutoSubmitted(false) }}
        className={className}
      />
    )
  }

  return (
    <div className={cn("flex flex-col gap-10 w-full", className)} {...props}>
      {/* Header */}
      <div className="space-y-3 animate-fade-in-up stagger-1">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] text-white leading-tight flex items-center gap-2">
          Verificar código
          {phone && <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />}
        </h1>
        <p className="text-[0.875rem] text-white/40 leading-relaxed">
          {phone
            ? <>Enviado via <span className="text-[#25D366] font-medium">WhatsApp</span> para {formatPhoneDisplay(phone)}</>
            : `Enviamos um código de 6 dígitos para ${email || "seu email"}.`
          }
        </p>
      </div>

      {/* OTP Form */}
      <form onSubmit={handleSubmit} className="animate-fade-in-up stagger-2">
        <FieldGroup>
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-3 animate-fade-in">
              <div className="h-1.5 w-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
              <p className="text-sm text-red-300" role="alert" aria-live="assertive">{error}</p>
            </div>
          )}
          <Field className="flex flex-col space-y-2">
            <FieldLabel htmlFor="otp" className="sr-only">
              Código de verificação
            </FieldLabel>
            <div className="w-full">
              <InputOTP
                id="otp"
                value={otp}
                onChange={setOtp}
                maxLength={6}
                disabled={isLoading || !identifier}
                autoFocus
                required
                aria-required="true"
                containerClassName="!w-full"
              >
                <InputOTPGroup className="!w-full gap-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="!flex-1 !w-0 !h-14 !text-xl !rounded-lg !border !border-white/[0.08] !bg-white/[0.04] !text-white data-[active=true]:!border-white/30 data-[active=true]:!ring-white/10"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            {!phone && (
              <FieldDescription className="text-left mt-2 text-white/30">
                Verifique sua caixa de entrada
              </FieldDescription>
            )}
          </Field>

          <Button
            type="submit"
            variant="ghost"
            className={cn(
              "w-full h-11 min-h-[44px] rounded-lg font-semibold text-[0.875rem] transition-all duration-300",
              otp.length === 6
                ? "bg-white text-[#0a0d14] hover:bg-white/90 active:bg-white/80 shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                : "bg-white/[0.06] text-white/30 border border-white/[0.06] hover:bg-white/[0.08] hover:text-white/40"
            )}
            disabled={isLoading || otp.length !== 6}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Verificando...
              </>
            ) : (
              "Verificar código"
            )}
          </Button>

          <FieldDescription className="text-left text-white/30">
            {phone ? 'Não recebeu no WhatsApp?' : 'Não recebeu o código?'}{" "}
            {canResend ? (
              <button
                type="button"
                onClick={handleResend}
                className="min-h-[44px] min-w-[44px] inline-flex items-center text-white hover:text-white/80 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 rounded-sm"
              >
                Reenviar
              </button>
            ) : (
              <span className="text-white/20" aria-live="polite" aria-atomic="true">
                Aguarde {countdown}s
              </span>
            )}
          </FieldDescription>

          <FieldDescription className="text-left">
            <Link href="/login" className="inline-flex min-h-[44px] items-center gap-1 text-white/50 hover:text-white font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 rounded-sm">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Voltar
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>
    </div>
  )
}
