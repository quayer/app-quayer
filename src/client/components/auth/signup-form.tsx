"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/client/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/client/components/ui/field"
import { Input } from "@/client/components/ui/input"
import { Alert, AlertDescription } from "@/client/components/ui/alert"
import { Loader2, Mail, Smartphone, ArrowRight } from "lucide-react"
import { GoogleIcon } from "@/client/components/ui/google-icon"
import Link from "next/link"
import { api } from "@/igniter.client"
import { PhoneInput } from "@/client/components/ui/phone-input"
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
  const [isPhone, setIsPhone] = useState(false)
  const [nameError, setNameError] = useState("")
  const [emailError, setEmailError] = useState("")
  const [turnstileToken, setTurnstileToken] = useState("")
  const phoneInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isPhone && phoneInputRef.current) {
      phoneInputRef.current.focus()
    }
  }, [isPhone])

  function looksLikePhone(v: string): boolean {
    const clean = v.replace(/[^\d]/g, '')
    return clean.length >= 8
  }

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setNameError("")
    setEmailError("")
    setIsLoading(true)

    // Validate and trim inputs
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()

    // Phone flow: send OTP via WhatsApp and redirect to verify
    if (looksLikePhone(trimmedEmail)) {
      const res = await fetch('/api/v1/auth/login-otp-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: trimmedEmail, 'cf-turnstile-response': turnstileToken }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message || 'Erro ao enviar código')
        setIsLoading(false)
        return
      }
      router.push('/signup/verify?phone=' + encodeURIComponent(trimmedEmail))
      return
    }

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
      const { data, error: apiError } = await api.auth.signupOTP.mutate({
        body: { email: trimmedEmail, name: trimmedName, 'cf-turnstile-response': turnstileToken } as { name: string; email: string; 'cf-turnstile-response'?: string }
      })

      if (apiError) {
        throw apiError
      }

      setSuccess(`✉️ Código enviado para ${trimmedEmail}! Verifique sua caixa de entrada.`)

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
        // Check if it's an object with 'error' property
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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
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
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Crie sua conta</h1>
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

      {/* Email/Phone Signup Form — First */}
      <form onSubmit={handleEmailSignup}>
        <FieldGroup>
          {!isPhone && (
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
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
              {nameError && <FieldError id="name-error">{nameError}</FieldError>}
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="email" className="text-sm font-medium text-gray-900 dark:text-gray-200">Email ou Telefone</FieldLabel>
            {isPhone ? (
              <PhoneInput
                ref={phoneInputRef}
                id="email"
                name="email"
                value={email}
                onChange={(v) => { setEmail(v); setIsPhone(looksLikePhone(v)); if (emailError) setEmailError("") }}
                disabled={isLoading}
                placeholder="+55 11 99999-9999"
              />
            ) : (
              <Input
                id="email"
                type="text"
                inputMode="email"
                placeholder="email@exemplo.com ou +55 11 99999-9999"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setIsPhone(looksLikePhone(e.target.value)); if (emailError) setEmailError("") }}
                disabled={isLoading}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? "email-error" : "email-desc"}
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            )}
            {emailError && <FieldError id="email-error">{emailError}</FieldError>}
            <FieldDescription id="email-desc" className="text-gray-500 dark:text-gray-400">
              {isPhone ? 'Enviaremos um código via WhatsApp' : 'Enviaremos um código de login para seu email'}
            </FieldDescription>
          </Field>

          <TurnstileWidget
            onSuccess={setTurnstileToken}
            action="signup"
          />

          <Field>
            <Button
              type="submit"
              disabled={isLoading || isGoogleLoading}
              className={cn(
                "w-full min-h-[44px] transition-colors",
                email.trim()
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 border-transparent"
                  : "bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
              )}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Enviando código...
                </>
              ) : isPhone ? (
                <>
                  <Smartphone className="mr-2 h-4 w-4" aria-hidden="true" />
                  Cadastrar com WhatsApp
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                  Cadastrar com Email
                </>
              )}
            </Button>
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
