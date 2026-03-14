"use client"

import { useState, useEffect } from "react"
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
import { Alert, AlertDescription } from "@/client/components/ui/alert"
import { Loader2, CheckCircle2, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { api } from "@/igniter.client"
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

  useEffect(() => {
    if (countdown > 0 && !canResend) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else if (countdown === 0) {
      setCanResend(true)
    }
  }, [countdown, canResend])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (otp.length !== 6) {
      setError("Digite o código de 6 dígitos")
      return
    }

    setError("")
    setIsLoading(true)

    try {
      const { data, error: apiError } = await api.auth.verifySignupOTP.mutate({
        body: { email, code: otp }
      })

      if (apiError) {
        throw apiError
      }

      if (data?.user) {
        // Backend seta cookies httpOnly via Set-Cookie header.
        setSuccess(true)

        // Limpar sessionStorage
        sessionStorage.removeItem('signup-email')
        sessionStorage.removeItem('signup-name')

        setTimeout(() => {
          const redirectPath = data.user?.role === "admin" ? "/admin" : "/integracoes"
          window.location.href = redirectPath
        }, 1500)
      }
    } catch (err: any) {
      console.error("OTP verification error:", err)

      let errorMessage = "Erro ao verificar código. Tente novamente."

      // Handle Igniter error structure
      if (err?.error?.message) {
        // Check if it's an object with 'error' property
        if (typeof err.error.message === 'object' && err.error.message.error) {
          errorMessage = err.error.message.error
        } else if (typeof err.error.message === 'string') {
          errorMessage = err.error.message
        }
      } else if (err?.message) {
        if (err.message.includes('invalid') || err.message.includes('inválido')) {
          errorMessage = "Código inválido. Verifique e tente novamente."
        } else if (err.message.includes('expired') || err.message.includes('expirado')) {
          errorMessage = "Código expirado. Solicite um novo código."
        } else {
          errorMessage = err.message
        }
      }

      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (!canResend) return

    setError("")
    setCanResend(false)
    setCountdown(60)

    try {
      await api.auth.signupOTP.mutate({ body: { email, name, 'cf-turnstile-response': turnstileToken } as any })
    } catch (err: any) {
      console.error("Resend error:", err)
      setError("Erro ao reenviar código")
      setCanResend(true)
      setCountdown(0)
    }
  }

  // Auto-submit quando 6 dígitos preenchidos
  useEffect(() => {
    if (otp.length === 6 && !isLoading && !autoSubmitted && email) {
      setAutoSubmitted(true)
      handleSubmit({ preventDefault: () => {} } as React.FormEvent)
    }
    if (otp.length < 6) setAutoSubmitted(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp])

  if (success) {
    return (
      <div className={cn("flex flex-col gap-8 max-w-sm mx-auto w-full", className)} {...props}>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle2 className="h-6 w-6 text-green-400" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Conta criada!</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Sua conta foi criada com sucesso. Redirecionando...
          </p>
          <div className="flex justify-center pt-2">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-hidden="true" />
            <span className="sr-only">Redirecionando...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-8 max-w-sm mx-auto w-full", className)} {...props}>
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Verificação</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Enviamos um código de 6 dígitos para {email || "seu email"}.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive" role="alert" aria-live="assertive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* OTP Form */}
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field className="flex flex-col items-center space-y-2">
            <FieldLabel htmlFor="otp" className="sr-only">
              Código de verificação
            </FieldLabel>
            <div className="flex justify-center w-full">
              <InputOTP
                id="otp"
                maxLength={6}
                value={otp}
                onChange={(value) => setOtp(value)}
                disabled={isLoading}
                autoFocus
                required
                aria-required="true"
              >
                <InputOTPGroup className="gap-2.5 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border *:data-[slot=input-otp-slot]:border-gray-200 dark:*:data-[slot=input-otp-slot]:border-gray-700 *:data-[slot=input-otp-slot]:bg-white dark:*:data-[slot=input-otp-slot]:bg-gray-800 *:data-[slot=input-otp-slot]:text-gray-900 dark:*:data-[slot=input-otp-slot]:text-white">
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <FieldDescription className="text-center mt-2 text-gray-500 dark:text-gray-400">
              Digite o código de 6 dígitos enviado para seu email.
            </FieldDescription>
          </Field>

          <TurnstileWidget
            onSuccess={setTurnstileToken}
            action="signup-otp"
          />

          <Button
            type="submit"
            className={cn(
              "w-full min-h-[44px] transition-colors",
              otp.length === 6
                ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 border-transparent"
                : "bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
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

          <FieldDescription className="text-center text-gray-500 dark:text-gray-400">
            Não recebeu o código?{" "}
            {canResend ? (
              <button
                type="button"
                onClick={handleResend}
                className="min-h-[44px] min-w-[44px] inline-flex items-center text-gray-900 dark:text-white underline underline-offset-4 hover:text-gray-700 dark:hover:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500 focus-visible:ring-offset-2 rounded-sm"
              >
                Reenviar
              </button>
            ) : (
              <span className="text-gray-400 dark:text-gray-500" aria-live="polite" aria-atomic="true">
                Aguarde {countdown}s
              </span>
            )}
          </FieldDescription>

          <FieldDescription className="text-center">
            <Link href="/signup" className="inline-flex min-h-[44px] items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500 focus-visible:ring-offset-2 rounded-sm">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Voltar para cadastro
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>
    </div>
  )
}
