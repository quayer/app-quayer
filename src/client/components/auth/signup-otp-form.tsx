"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
import { Loader2, CheckCircle2, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { api } from "@/igniter.client"
import { translateAuthError } from "@/lib/utils/translate-auth-error"
import { TurnstileWidget } from "@/client/components/auth/turnstile-widget"

interface SignupOTPFormProps extends React.ComponentProps<"div"> {
  email: string
  name: string
}

export function SignupOTPForm({ email, name, className, ...props }: SignupOTPFormProps) {
  const [otp, setOtp] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [canResend, setCanResend] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const [autoSubmitted, setAutoSubmitted] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState("")
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

  const submitCode = useCallback(async (code: string) => {
    if (code.length !== 6) {
      setError("Digite o código de 6 dígitos")
      return
    }

    setError("")
    setIsLoading(true)

    try {
      const { data, error: apiError } = await api.auth.verifySignupOTP.mutate({
        body: { email, code }
      })

      if (apiError) {
        throw apiError
      }

      const result = data as { user?: { id: string; email: string; name: string; role: string; currentOrgId: string; organizationRole: string } } | null
      if (result?.user) {
        // Backend seta cookies httpOnly via Set-Cookie header.
        setSuccess(true)

        // Limpar sessionStorage
        sessionStorage.removeItem('signup-email')
        sessionStorage.removeItem('signup-name')

        setTimeout(() => {
          window.location.href = "/"
        }, 1500)
      }
    } catch (err: unknown) {
      let errorMessage = "Não foi possível verificar. Tente novamente."

      const e = err as Record<string, unknown> | undefined
      const errObj = e?.error as Record<string, unknown> | undefined
      if (errObj?.message) {
        if (typeof errObj.message === 'object' && errObj.message !== null && (errObj.message as Record<string, unknown>).error) {
          errorMessage = String((errObj.message as Record<string, unknown>).error)
        } else if (typeof errObj.message === 'string') {
          errorMessage = errObj.message
        }
      } else if (e?.message && typeof e.message === 'string') {
        errorMessage = e.message
      }

      errorMessage = translateAuthError(errorMessage)

      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [email, isLoading])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitCode(otp)
  }

  const handleResend = async () => {
    if (!canResend) return

    setError("")
    countdownEndRef.current = Date.now() + 60 * 1000
    setCountdown(60)
    setCanResend(false)

    try {
      await api.auth.signupOTP.mutate({ body: { email, name, 'cf-turnstile-response': turnstileToken } } as Parameters<typeof api.auth.signupOTP.mutate>[0])
    } catch (err: unknown) {
      setError("Erro ao reenviar código")
      setCanResend(true)
      setCountdown(0)
    }
  }

  // Auto-submit quando 6 dígitos preenchidos
  useEffect(() => {
    if (otp.length === 6 && !isLoading && !autoSubmitted && email) {
      setAutoSubmitted(true)
      submitCode(otp)
    }
    if (otp.length < 6) setAutoSubmitted(false)
  }, [otp, isLoading, autoSubmitted, email, submitCode])

  if (success) {
    return (
      <div className={cn("flex flex-col gap-8 w-full", className)} {...props}>
        <div className="space-y-4 text-center animate-fade-in-up stagger-1" role="status" aria-live="polite" aria-atomic="true">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" aria-hidden="true" />
          </div>
          <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] text-foreground leading-tight">Conta criada!</h1>
          <p className="text-[0.9375rem] text-foreground/70 leading-relaxed">
            Sua conta foi criada com sucesso. Redirecionando...
          </p>
          <div className="flex justify-center pt-2">
            <Loader2 className="h-6 w-6 animate-spin text-foreground/70" aria-hidden="true" />
            <span className="sr-only">Redirecionando para o dashboard.</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-8 w-full", className)} {...props}>
      {/* Header */}
      <div className="space-y-3 animate-fade-in-up stagger-1">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] text-foreground leading-tight">Verificação</h1>
        <p className="text-[0.9375rem] text-foreground/70 leading-relaxed">
          Enviamos um código de 6 dígitos para {email || "seu email"}.
        </p>
      </div>

      {/* OTP Form */}
      <form onSubmit={handleSubmit} className="animate-fade-in-up stagger-2">
        <FieldGroup className="!gap-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-3 animate-fade-in">
              <div className="h-1.5 w-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" aria-hidden="true" />
              <p id="otp-error" className="text-sm text-red-700 dark:text-red-300" role="alert" aria-live="assertive">{error}</p>
            </div>
          )}
          <Field className="flex flex-col space-y-2">
            <FieldLabel htmlFor="otp" className="sr-only">
              Código de verificação
            </FieldLabel>
            <div className="w-full">
              <InputOTP
                id="otp"
                maxLength={6}
                value={otp}
                onChange={(value) => setOtp(value)}
                disabled={isLoading}
                autoFocus
                required
                aria-required="true"
                aria-label="Código de verificação de 6 dígitos"
                aria-describedby={error ? "otp-error" : undefined}
                aria-invalid={error ? true : undefined}
                containerClassName="!w-full"
              >
                <InputOTPGroup className="!w-full gap-2" role="group" aria-label="Dígitos do código">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      aria-label={`Dígito ${i + 1} de 6`}
                      className="!flex-1 !w-0 !h-14 !text-xl !rounded-lg !border !border-border !bg-muted/50 !text-foreground data-[active=true]:!border-ring data-[active=true]:!ring-ring/20"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <FieldDescription className="text-left mt-3 text-foreground/70">
              Digite o código de 6 dígitos enviado para seu email.
            </FieldDescription>
          </Field>

          <TurnstileWidget
            onSuccess={setTurnstileToken}
            action="signup-otp"
          />

          <Button
            type="submit"
            variant="ghost"
            className={cn(
              "w-full h-11 min-h-[44px] rounded-lg font-semibold text-[0.875rem] transition-all duration-300 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:outline-none",
              otp.length === 6
                ? "bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80 shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                : "bg-muted text-foreground/60 border border-border hover:bg-muted/80 hover:text-foreground/80 cursor-not-allowed"
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
              "Verificar"
            )}
          </Button>

          {/* Status message: only announce when canResend flips true. Countdown ticks visually only. */}
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {canResend ? 'Reenvio do código disponível.' : ''}
          </span>

          <FieldDescription className="text-left text-foreground/70 pt-1">
            Não recebeu o código?{" "}
            {canResend ? (
              <button
                type="button"
                onClick={handleResend}
                className="min-h-[44px] min-w-[44px] inline-flex items-center text-foreground hover:text-foreground/80 active:text-foreground/60 font-medium underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 rounded-sm"
              >
                Reenviar
              </button>
            ) : (
              <span className="text-foreground/60" aria-hidden="true">
                Aguarde {countdown}s
              </span>
            )}
          </FieldDescription>

          <FieldDescription className="text-left pt-1">
            <Link
              href="/signup"
              className="inline-flex min-h-[44px] items-center gap-1.5 text-foreground/70 hover:text-foreground active:text-foreground/90 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 rounded-sm"
              aria-label="Voltar para a página de cadastro"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar para cadastro
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>
    </div>
  )
}
