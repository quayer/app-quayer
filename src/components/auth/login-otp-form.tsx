"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Loader2, CheckCircle2 } from "lucide-react"
import { api } from "@/igniter.client"

interface LoginOTPFormProps extends React.ComponentProps<"div"> {
  email?: string
}

export function LoginOTPForm({ email, className, ...props }: LoginOTPFormProps) {
  const searchParams = useSearchParams()
  const isSignup = searchParams.get('signup') === 'true'
  const [otp, setOtp] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [canResend, setCanResend] = useState(false)
  const [countdown, setCountdown] = useState(60)

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
      setError("Email não encontrado. Volte e digite seu email novamente.")
      return
    }

    if (otp.length !== 6) {
      setError("Digite o código de 6 dígitos")
      return
    }

    setError("")
    setIsLoading(true)

    try {
      // Call different endpoint based on signup vs login flow
      const { data, error: apiError } = isSignup
        ? await api.auth.verifySignupOTP.mutate({
            body: { email, code: otp }
          })
        : await api.auth.verifyLoginOTP.mutate({
            body: { email, code: otp }
          })

      // ✅ CORREÇÃO: Verificar se apiError existe E não é um objeto vazio
      if (apiError && Object.keys(apiError).length > 0) {
        throw apiError
      }

      // ✅ CORREÇÃO: Verificar também se data é null (indica erro mesmo sem apiError)
      if (!data) {
        throw new Error("Código inválido ou expirado. Tente novamente.")
      }

      // ✅ CORREÇÃO: Verificar se a resposta contém erro antes de processar
      if ('error' in data) {
        throw new Error(data.error)
      }

      // ✅ CORREÇÃO: Type narrowing - garantir que temos accessToken
      if ('accessToken' in data && data.accessToken) {
        localStorage.setItem("accessToken", data.accessToken)
        if (data.refreshToken) {
          localStorage.setItem("refreshToken", data.refreshToken)
        }

        const cookieValue = encodeURIComponent(data.accessToken)
        document.cookie = 'accessToken=' + cookieValue + '; path=/; max-age=86400; SameSite=Lax'

        setSuccess(true)

        setTimeout(() => {
          // ✅ CORREÇÃO BRUTAL: Respeitar needsOnboarding antes de redirecionar
          const userRole = 'user' in data && data.user?.role
          const needsOnboarding = 'needsOnboarding' in data && data.needsOnboarding

          // Se precisa de onboarding, ir para /onboarding independente do role
          if (needsOnboarding) {
            window.location.href = "/onboarding"
            return
          }

          // Caso contrário, redirecionar baseado no role
          const redirectPath = userRole === "admin" ? "/admin" : "/integracoes"
          window.location.href = redirectPath
        }, 1500)
      }
    } catch (err: any) {
      // Log completo do erro para debug
      console.error("OTP verification error:", err)
      console.error("Error structure:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2))

      let errorMessage = "Erro ao verificar código. Tente novamente."

      // Tentar múltiplas estruturas de erro possíveis
      if (err?.data?.error) {
        errorMessage = err.data.error
      } else if (err?.error?.details && Array.isArray(err.error.details) && err.error.details.length > 0) {
        errorMessage = err.error.details[0].message || errorMessage
      } else if (err?.error?.message) {
        errorMessage = err.error.message
      } else if (err?.message) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err?.response?.data?.error) {
        errorMessage = err.response.data.error
      }

      setError(errorMessage)
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (!canResend || !email) return

    setError("")
    setCanResend(false)
    setCountdown(60)

    try {
      // Use different endpoint based on signup vs login flow
      // Note: signup resend needs the name, which we don't have here
      // For now, only support resend for login flow
      if (!isSignup) {
        await api.auth.loginOTP.mutate({ body: { email } })
      } else {
        setError("Para reenviar o código de cadastro, volte à página anterior")
        setCanResend(true)
        setCountdown(0)
      }
    } catch (err: any) {
      console.error("Resend error:", err)
      setError("Erro ao reenviar código")
      setCanResend(true)
      setCountdown(0)
    }
  }

  if (success) {
    return (
      <Card className={cn("", className)} {...props}>
        <CardContent className="pt-6 pb-6 text-center space-y-4">
          <div className="flex justify-center">
            <CheckCircle2 className="h-12 w-12 text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Login realizado com sucesso!</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Redirecionando...
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("", className)} {...props}>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Verificação</CardTitle>
        <CardDescription>
          Enviamos um código de 6 dígitos para {email || "seu email"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field className="flex flex-col items-center space-y-2">
              <FieldLabel htmlFor="otp" className="sr-only">
                Código de verificação
              </FieldLabel>
              <div className="flex justify-center w-full">
                <InputOTP
                  id="otp"
                  value={otp}
                  onChange={(value) => {
                    setOtp(value)
                    setError("") // Limpar erro ao digitar
                  }}
                  maxLength={6}
                  disabled={isLoading || !email}
                  autoFocus
                  required
                  aria-invalid={!!error}
                  aria-describedby={error ? "otp-error" : "otp-description"}
                  className={error ? "error-shake" : ""}
                >
                  <InputOTPGroup className="gap-2.5 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border">
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              
              {/* ✅ CORREÇÃO BRUTAL: Feedback inline de erro abaixo do campo OTP */}
              {error && (
                <p id="otp-error" className="text-xs text-red-400 mt-1 error-message text-center">
                  ⚠️ {error}
                </p>
              )}
              
              <FieldDescription id="otp-description" className="text-center mt-2">
                Digite o código de 6 dígitos enviado para seu email.
              </FieldDescription>
            </Field>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || otp.length !== 6}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                "Fazer Login"
              )}
            </Button>

            <FieldDescription className="text-center">
              Não recebeu o código?{" "}
              {canResend ? (
                <button
                  type="button"
                  onClick={handleResend}
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  Reenviar
                </button>
              ) : (
                <span className="text-muted-foreground">
                  Aguarde {countdown}s
                </span>
              )}
            </FieldDescription>

            <FieldDescription className="text-center">
              <a href="/login" className="text-muted-foreground hover:text-foreground">
                ← Voltar
              </a>
            </FieldDescription>

            <FieldDescription className="text-center">
              Não tem uma conta?{" "}
              <a href="/signup" className="text-primary underline underline-offset-4 hover:text-primary/80">
                Cadastre-se
              </a>
            </FieldDescription>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
