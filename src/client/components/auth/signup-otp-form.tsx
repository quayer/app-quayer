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
          const redirectPath = result.user?.role === "admin" ? "/admin" : "/"
          window.location.href = redirectPath
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
      <div className={cn("flex flex-col gap-10 w-full", className)} {...props}>
        <div className="space-y-4 text-center animate-fade-in-up stagger-1">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle2 className="h-6 w-6 text-green-400" aria-hidden="true" />
          </div>
          <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] text-white leading-tight">Conta criada!</h1>
          <p className="text-[0.875rem] text-white/40 leading-relaxed">
            Sua conta foi criada com sucesso. Redirecionando...
          </p>
          <div className="flex justify-center pt-2">
            <Loader2 className="h-6 w-6 animate-spin text-white/30" aria-hidden="true" />
            <span className="sr-only">Redirecionando...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-10 w-full", className)} {...props}>
      {/* Header */}
      <div className="space-y-3 animate-fade-in-up stagger-1">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] text-white leading-tight">Verificação</h1>
        <p className="text-[0.875rem] text-white/40 leading-relaxed">
          Enviamos um código de 6 dígitos para {email || "seu email"}.
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
                maxLength={6}
                value={otp}
                onChange={(value) => setOtp(value)}
                disabled={isLoading}
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
            <FieldDescription className="text-left mt-2 text-white/30">
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
              "Verificar"
            )}
          </Button>

          <FieldDescription className="text-left text-white/30">
            Não recebeu o código?{" "}
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
            <Link href="/signup" className="inline-flex min-h-[44px] items-center gap-1 text-white/50 hover:text-white font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 rounded-sm">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Voltar para cadastro
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>
    </div>
  )
}
