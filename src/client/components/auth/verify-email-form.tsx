"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/client/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card"
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
  InputOTPSeparator,
} from "@/client/components/ui/input-otp"
import { Alert, AlertDescription } from "@/client/components/ui/alert"
import { Loader2, CheckCircle2 } from "lucide-react"
import { api } from "@/igniter.client"

interface VerifyEmailFormProps extends React.ComponentProps<"div"> {
  email?: string
}

export function VerifyEmailForm({ email, className, ...props }: VerifyEmailFormProps) {
  const [otp, setOtp] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [canResend, setCanResend] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const [autoSubmitted, setAutoSubmitted] = useState(false)

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

    if (!email) {
      setError("Email não encontrado. Por favor, volte e faça o cadastro novamente.")
      return
    }

    if (otp.length !== 6) {
      setError("Digite o código de 6 dígitos")
      return
    }

    setError("")
    setIsLoading(true)

    try {
      const { data, error: apiError } = await api.auth.verifyEmail.mutate({
        body: { email, code: otp }
      })

      if (apiError) {
        let errorMessage = "Código inválido ou expirado"

        if (apiError.error?.message) {
          errorMessage = apiError.error.message
        } else if (apiError.message) {
          errorMessage = apiError.message
        }

        setError(errorMessage)
        setIsLoading(false)
        return
      }

      if (data?.user) {
        // Backend seta cookies httpOnly via Set-Cookie header.
        setSuccess(true)

        setTimeout(() => {
          const redirectPath = data.user?.role === "admin" ? "/admin" : "/integracoes"
          window.location.href = redirectPath
        }, 1500)
      }
    } catch (err: any) {
      console.error("Verification error:", err)

      let errorMessage = "Erro ao verificar código. Tente novamente."

      if (err?.error?.details && Array.isArray(err.error.details) && err.error.details.length > 0) {
        errorMessage = err.error.details[0].message || errorMessage
      } else if (err?.error?.message) {
        errorMessage = err.error.message
      } else if (err?.message) {
        errorMessage = err.message
      }

      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (!canResend || !email) return

    setError("")
    setCanResend(false)
    setCountdown(60)

    try {
      await api.auth.resendVerification.mutate({
        body: { email }
      })
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
      <Card className={cn("", className)} {...props}>
        <CardContent className="pt-6 pb-6 text-center space-y-4">
          <div className="flex justify-center">
            <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Email verificado com sucesso!</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Redirecionando...
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Digite o código de verificação</CardTitle>
          <CardDescription>
            Enviamos um código de 6 dígitos para {email ? email : "seu email"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              {error && (
                <Alert variant="destructive" role="alert" aria-live="assertive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Field className="flex flex-col items-center space-y-2">
                <FieldLabel htmlFor="otp" className="sr-only">
                  Código de verificação
                </FieldLabel>
                <div className="flex justify-center w-full">
                  <InputOTP
                    id="otp"
                    value={otp}
                    onChange={setOtp}
                    maxLength={6}
                    disabled={isLoading || !email}
                  >
                    <InputOTPGroup className="gap-2.5 *:data-[slot=input-otp-slot]:h-16 *:data-[slot=input-otp-slot]:w-12">
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup className="gap-2.5 *:data-[slot=input-otp-slot]:h-16 *:data-[slot=input-otp-slot]:w-12">
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <FieldDescription className="text-center mt-2">
                  Digite o código de 6 dígitos enviado para seu email
                </FieldDescription>
              </Field>

              <Field>
                <Button
                  type="submit"
                  className="w-full"
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
                <FieldDescription className="text-center">
                  Não recebeu o código?{" "}
                  {canResend ? (
                    <button
                      type="button"
                      onClick={handleResend}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                    >
                      Reenviar
                    </button>
                  ) : (
                    <span className="text-muted-foreground" aria-live="polite" aria-atomic="true">Reenviar em {countdown}s</span>
                  )}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
