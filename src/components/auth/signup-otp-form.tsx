"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
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
  InputOTPSeparator,
} from "@/components/ui/input-otp"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, CheckCircle2, Mail } from "lucide-react"
import { api } from "@/igniter.client"

interface SignupOTPFormProps extends React.ComponentProps<"div"> {
  email: string
  name: string
}

export function SignupOTPForm({ email, name, className, ...props }: SignupOTPFormProps) {
  const router = useRouter()
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

      const loginData = data as any
      if (loginData?.accessToken) {
        localStorage.setItem("accessToken", loginData.accessToken)
        if (loginData.refreshToken) {
          localStorage.setItem("refreshToken", loginData.refreshToken)
        }

        const cookieValue = encodeURIComponent(loginData.accessToken)
        document.cookie = 'accessToken=' + cookieValue + '; path=/; max-age=86400; SameSite=Lax'

        setSuccess(true)

        // Limpar sessionStorage
        sessionStorage.removeItem('signup-email')
        sessionStorage.removeItem('signup-name')

        setTimeout(() => {
          const redirectPath = loginData.user?.role === "admin" ? "/admin" : "/integracoes"
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
      await api.auth.signupOTP.mutate({ body: { email, name } })
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
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle className="text-xl">Conta criada!</CardTitle>
          <CardDescription>
            Sua conta foi criada com sucesso. Redirecionando...
          </CardDescription>
        </CardHeader>
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
                  maxLength={6}
                  value={otp}
                  onChange={(value) => {
                    setOtp(value)
                    setError("") // Limpar erro ao digitar
                  }}
                  disabled={isLoading}
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
              
              {/* ✅ CORREÇÃO BRUTAL: Feedback inline de erro */}
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
                "Verificar"
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
              Já tem uma conta?{" "}
              <a href="/login" className="text-primary underline underline-offset-4 hover:text-primary/80">
                Fazer Login
              </a>
            </FieldDescription>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
