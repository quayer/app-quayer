"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
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
} from "@/client/components/ui/input-otp"
import { Alert, AlertDescription } from "@/client/components/ui/alert"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import { api } from "@/igniter.client"
import { TwoFactorChallenge } from "@/client/components/auth/two-factor-challenge"

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
}

export function LoginOTPForm({ email, phone, className, ...props }: LoginOTPFormProps) {
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

  useEffect(() => {
    if (countdown > 0 && !canResend) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else if (countdown === 0) {
      setCanResend(true)
    }
  }, [countdown, canResend])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!identifier) {
      setError("Identificador não encontrado. Volte e tente novamente.")
      return
    }

    if (otp.length !== 6) {
      setError("Digite o código de 6 dígitos")
      return
    }

    if (phone) {
      setError('')
      setIsLoading(true)
      try {
        const res = await fetch('/api/v1/auth/verify-login-otp-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ phone, code: otp })
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
        else window.location.href = r.user?.role === 'admin' ? '/admin' : '/integracoes'
      } catch {
        setError('Erro ao verificar código')
        setIsLoading(false)
      }
      return
    }

    setError("")
    setIsLoading(true)

    try {
      // Call different endpoint based on signup vs login flow
      const { data, error: apiError } = isSignup
        ? await api.auth.verifySignupOTP.mutate({
            body: { email: email!, code: otp }
          })
        : await api.auth.verifyLoginOTP.mutate({
            body: { email: email!, code: otp }
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
          window.location.href = userRole === "admin" ? "/admin" : "/integracoes"
        }
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

      // Traduzir mensagens técnicas inglesas para português
      const errorTranslations: Record<string, string> = {
        'Invalid or expired code': 'Código inválido ou expirado. Solicite um novo código.',
        'Code expired': 'Código expirado. Clique em Reenviar para obter um novo.',
        'Invalid code': 'Código inválido. Verifique e tente novamente.',
        'Account disabled': 'Conta desativada. Entre em contato com o suporte.',
        'User not found': 'Usuário não encontrado. Verifique o email.',
      }
      for (const [en, pt] of Object.entries(errorTranslations)) {
        if (errorMessage.includes(en)) {
          errorMessage = pt
          break
        }
      }

      setError(errorMessage)
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (!canResend || !identifier) return

    setError("")
    setCanResend(false)
    setCountdown(60)

    try {
      if (phone) {
        const res = await fetch('/api/v1/auth/login-otp-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ phone })
        })
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10)
          setError(`Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} minuto(s).`)
          setCanResend(false)
          setCountdown(retryAfter)
          return
        }
        return
      }
      // Use different endpoint based on signup vs login flow
      // Note: signup resend needs the name, which we don't have here
      // For now, only support resend for login flow
      if (!isSignup) {
        await api.auth.loginOTP.mutate({ body: { email: email! } })
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

  // Auto-submit quando 6 dígitos preenchidos
  useEffect(() => {
    if (otp.length === 6 && !isLoading && !autoSubmitted && identifier) {
      setAutoSubmitted(true)
      handleSubmit({ preventDefault: () => {} } as React.FormEvent)
    }
    if (otp.length < 6) setAutoSubmitted(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp])

  const handle2FASuccess = (result: { user: { role: string; currentOrgId?: string }; needsOnboarding?: boolean }) => {
    if (result.needsOnboarding) {
      window.location.href = "/onboarding"
    } else {
      window.location.href = result.user.role === "admin" ? "/admin" : "/integracoes"
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
    <Card className={cn("", className)} {...props}>
      <CardHeader className="text-center">
        <CardTitle className="text-xl flex items-center justify-center gap-2">
          {phone ? (
            <>
              Código via
              <span className="inline-flex items-center gap-1 font-semibold">
                <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
                WhatsApp
              </span>
            </>
          ) : 'Verificação por Email'}
        </CardTitle>
        <CardDescription>
          {phone
            ? `Código enviado para ${formatPhoneDisplay(phone)}`
            : `Enviamos um código de 6 dígitos para ${email || "seu email"}.`
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            {error && (
              <Alert variant="destructive">
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
                  disabled={isLoading || !identifier}
                  autoFocus
                  required
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
              <FieldDescription className="text-center mt-2">
                {phone ? 'Verifique suas mensagens do WhatsApp' : 'Verifique sua caixa de entrada'}
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
                "Verificar código"
              )}
            </Button>

            <FieldDescription className="text-center">
              {phone ? 'Não recebeu no WhatsApp?' : 'Não recebeu o código?'}{" "}
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
              <Link href="/login" className="text-muted-foreground hover:text-foreground">
                ← Voltar
              </Link>
            </FieldDescription>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
