"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/client/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/client/components/ui/field"
import { Input } from "@/client/components/ui/input"
import { Alert, AlertDescription } from "@/client/components/ui/alert"
import { Loader2, ArrowRight } from "lucide-react"
import { GoogleIcon } from "@/client/components/ui/google-icon"
import { WhatsAppIcon } from "@/client/components/auth/whatsapp-icon"
import Link from "next/link"
import { api } from "@/igniter.client"
import { TurnstileWidget } from "@/client/components/auth/turnstile-widget"
import { SIGNUP_ENABLED, SIGNUP_DISABLED_MESSAGE } from "@/lib/config"

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [nameError, setNameError] = useState("")
  const [emailError, setEmailError] = useState("")
  const [turnstileToken, setTurnstileToken] = useState("")

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setNameError("")
    setEmailError("")
    setIsLoading(true)

    const trimmedName = name.trim()
    const trimmedEmail = email.trim()

    if (!trimmedName) {
      setNameError("Informe seu nome")
      setIsLoading(false)
      return
    }

    if (!trimmedEmail) {
      setEmailError("Digite seu email")
      setIsLoading(false)
      return
    }

    try {
      // Send OTP code to email (SIGNUP endpoint - creates TempUser)
      const { error: apiError } = await api.auth.signupOTP.mutate({
        body: { email: trimmedEmail, name: trimmedName, 'cf-turnstile-response': turnstileToken } as { name: string; email: string; 'cf-turnstile-response'?: string }
      })

      if (apiError) {
        throw apiError
      }

      setSuccess(`Código enviado para ${trimmedEmail}. Verifique sua caixa de entrada.`)

      // Save email and name to sessionStorage for resend functionality
      sessionStorage.setItem('signup-email', trimmedEmail)
      sessionStorage.setItem('signup-name', trimmedName)

      // Redirect to signup verification page with both email and name
      setTimeout(() => {
        router.push(`/signup/verify?email=${encodeURIComponent(trimmedEmail)}&name=${encodeURIComponent(trimmedName)}`)
      }, 1500)
    } catch (err: unknown) {
      let errorMessage = "Erro ao enviar código. Tente novamente."

      // Handle Igniter error structure
      const e = err as Record<string, unknown>
      const errObj = e?.error as Record<string, unknown> | undefined
      if (errObj?.message) {
        if (typeof errObj.message === 'object' && errObj.message !== null && (errObj.message as Record<string, unknown>).error) {
          errorMessage = String((errObj.message as Record<string, unknown>).error)
        } else if (typeof errObj.message === 'string') {
          errorMessage = errObj.message
        }
      } else if (errObj?.details && Array.isArray(errObj.details) && errObj.details.length > 0) {
        errorMessage = String(errObj.details[0]?.message) || errorMessage
      } else if (e?.message && typeof e.message === 'string') {
        errorMessage = e.message
      }

      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignup = async () => {
    setIsGoogleLoading(true)
    setError('')

    try {
      const { data, error: apiError } = await api.auth.googleAuth.query()

      if (apiError) {
        setError('Erro ao iniciar autenticação com Google')
        setIsGoogleLoading(false)
        return
      }

      if (data && 'authUrl' in data && data.authUrl) {
        window.location.href = data.authUrl
      } else {
        setError('Erro ao obter URL de autenticação do Google')
        setIsGoogleLoading(false)
      }
    } catch {
      setError('Erro ao conectar com Google. Tente novamente.')
      setIsGoogleLoading(false)
    }
  }

  if (!SIGNUP_ENABLED) {
    return (
      <div className={cn("flex flex-col gap-6 max-w-sm mx-auto w-full", className)} {...props}>
        <div className="space-y-2">
          <h1 id="signup-form-title" className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Cadastro indisponível
          </h1>
        </div>
        <Alert role="status" aria-live="polite">
          <AlertDescription>{SIGNUP_DISABLED_MESSAGE}</AlertDescription>
        </Alert>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Já tem conta?{" "}
          <Link
            href="/login"
            className="inline-flex items-center gap-0.5 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500 focus-visible:ring-offset-2 rounded-sm"
          >
            Faça login
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-8 max-w-sm mx-auto w-full", className)} {...props}>
      {/* Header */}
      <div className="space-y-2">
        <h1 id="signup-form-title" className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Crie sua conta</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Já tem conta?{" "}
          <Link href="/login" className="inline-flex items-center gap-0.5 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500 focus-visible:ring-offset-2 rounded-sm">
            Faça login
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive" role="alert" aria-live="assertive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert role="status" aria-live="polite" className="border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10">
          <AlertDescription className="text-emerald-700 dark:text-emerald-400">{success}</AlertDescription>
        </Alert>
      )}

      {/* Email Signup Form */}
      <form onSubmit={handleEmailSignup} aria-labelledby="signup-form-title">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name" className="text-sm font-medium text-gray-900 dark:text-gray-200">Nome completo</FieldLabel>
            <Input
              id="name"
              type="text"
              placeholder="João Silva"
              value={name}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError("") }}
              disabled={isLoading}
              autoFocus
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "name-error" : undefined}
              autoComplete="name"
              className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            {nameError && <FieldError id="name-error">{nameError}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="email" className="text-sm font-medium text-gray-900 dark:text-gray-200">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              placeholder="voce@empresa.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError("") }}
              disabled={isLoading}
              autoComplete="email"
              aria-required="true"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "email-error" : undefined}
              className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            {emailError && <FieldError id="email-error">{emailError}</FieldError>}
          </Field>

          <TurnstileWidget
            onSuccess={setTurnstileToken}
            action="signup"
          />

          <Field>
            <Button
              type="submit"
              disabled={isLoading || isGoogleLoading}
              aria-busy={isLoading}
              aria-label="Continuar com WhatsApp"
              className={cn(
                "w-full min-h-[44px] rounded-lg font-semibold text-[0.875rem] transition-colors",
                "bg-[#075E54] text-white hover:bg-[#054C44] active:bg-[#043A34]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:opacity-60"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Enviando código...
                </>
              ) : (
                <>
                  <WhatsAppIcon className="mr-2 h-[18px] w-[18px] text-white" />
                  Continuar com WhatsApp
                </>
              )}
            </Button>
            <p className="mt-2 text-center text-[0.75rem] text-gray-500 dark:text-gray-400 leading-relaxed">
              Enviaremos um código de verificação para você.
            </p>
          </Field>
        </FieldGroup>
      </form>

      <FieldSeparator className="text-gray-400 dark:text-gray-500 [&>span]:text-gray-400 dark:[&>span]:text-gray-500 [&>div]:border-gray-200 dark:[&>div]:border-gray-800">OU</FieldSeparator>

      {/* Google OAuth — Below */}
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleSignup}
        disabled={isLoading || isGoogleLoading}
        className="w-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white min-h-[44px]"
        aria-busy={isGoogleLoading}
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
    </div>
  )
}
