"use client"

import { useState, useEffect, useMemo, useRef, memo } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/client/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/client/components/ui/field"
import { Input } from "@/client/components/ui/input"
import { Loader2, ArrowRight, ArrowLeft, Mail, ChevronsUpDown, Check } from "lucide-react"
import { GoogleIcon } from "@/client/components/ui/google-icon"
import { WhatsAppIcon } from "@/client/components/auth/whatsapp-icon"
import Link from "next/link"
import { api } from "@/igniter.client"
import { translateAuthError } from "@/lib/utils/translate-auth-error"
import { TurnstileWidget } from "@/client/components/auth/turnstile-widget"
import { SIGNUP_ENABLED } from "@/lib/config"
import { startAuthentication } from '@simplewebauthn/browser'
import { getCsrfHeaders, ensureCsrfHeaders } from "@/client/hooks/use-csrf-token"
import { defaultCountries, parseCountry } from "react-international-phone"
import * as Flags from "country-flag-icons/react/3x2"
import { Popover, PopoverContent, PopoverTrigger } from "@/client/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/client/components/ui/command"

const FlagIcon = memo(function FlagIcon({ iso2, className }: { iso2: string; className?: string }) {
  const code = iso2.toUpperCase() as keyof typeof Flags
  const Component = Flags[code]
  if (!Component) return <span className={className}>{iso2.toUpperCase()}</span>
  return <Component className={className} />
})

const ALL_COUNTRIES = defaultCountries
  .map((c) => {
    const p = parseCountry(c)
    return { iso2: p.iso2, dialCode: p.dialCode, name: p.name }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

const BR_COUNTRY = ALL_COUNTRIES.find((c) => c.iso2 === "br")!

export function LoginFormFinal({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [phoneError, setPhoneError] = useState("")
  const [countryIso2, setCountryIso2] = useState("br")
  const [openCountry, setOpenCountry] = useState(false)
  const [mode, setMode] = useState<"email" | "whatsapp">("email")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState("")
  const phoneInputRef = useRef<HTMLInputElement>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)

  const selectedCountry = useMemo(
    () => ALL_COUNTRIES.find((c) => c.iso2 === countryIso2) ?? BR_COUNTRY,
    [countryIso2]
  )

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const runConditionalUI = async () => {
      try {
        const res = await fetch('/api/v1/auth/passkey/login/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
          credentials: 'include',
          signal,
        })
        if (!res.ok) return
        const { data: optionsWithId } = await res.json()
        const authResp = await startAuthentication({ optionsJSON: optionsWithId, useBrowserAutofill: true })
        // verify-conditional exige csrfProcedure — garante cookie + header
        const csrfHeaders = await ensureCsrfHeaders()
        const verifyRes = await fetch('/api/v1/auth/passkey/login/verify-conditional', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...csrfHeaders },
          credentials: 'include',
          signal,
          body: JSON.stringify({ response: authResp, challengeId: optionsWithId.challengeId })
        })
        if (!verifyRes.ok) return
        const { data: result } = await verifyRes.json()
        router.push(result.needsOnboarding ? '/onboarding' : '/')
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.debug('[Conditional UI]', err)
      }
    }

    runConditionalUI()
    return () => controller.abort()
  }, [router])

  // Focus management on mode toggle
  useEffect(() => {
    if (mode === "whatsapp") {
      requestAnimationFrame(() => phoneInputRef.current?.focus())
    } else {
      requestAnimationFrame(() => emailInputRef.current?.focus())
    }
  }, [mode])

  function normalizePhone(v: string): string {
    const trimmed = v.trim()
    const digits = trimmed.replace(/\D/g, '')
    if (trimmed.startsWith('+')) return '+' + digits
    const code = selectedCountry.dialCode
    const local = digits.startsWith(code) && digits.length > code.length
      ? digits.slice(code.length)
      : digits
    return '+' + code + local
  }

  const switchToWhatsApp = () => {
    setError("")
    setPhoneError("")
    setMode("whatsapp")
  }

  const switchToEmail = () => {
    setError("")
    setPhoneError("")
    setMode("email")
  }

  const handleOTPRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const { data, error: apiError } = await api.auth.loginOTP.mutate({
        body: { email, 'cf-turnstile-response': turnstileToken }
      } as Parameters<typeof api.auth.loginOTP.mutate>[0])

      if (apiError) {
        throw apiError
      }

      const isNewUser = (data as { isNewUser?: boolean; magicLinkSessionId?: string } | null)?.isNewUser
      const magicLinkSessionId = (data as { isNewUser?: boolean; magicLinkSessionId?: string } | null)?.magicLinkSessionId
      const params = new URLSearchParams({ email })
      if (isNewUser) params.set('signup', 'true')
      if (magicLinkSessionId) params.set('mlsid', magicLinkSessionId)
      router.push(`/login/verify?${params.toString()}`)
    } catch (err: unknown) {
      let errorMessage = "Erro ao enviar código. Tente novamente."

      const e = err as Record<string, unknown> | undefined
      const errObj = e?.error as Record<string, unknown> | undefined
      if (errObj?.details && Array.isArray(errObj.details) && errObj.details.length > 0) {
        errorMessage = String(errObj.details[0]?.message) || errorMessage
      } else if (typeof errObj?.message === 'string') {
        errorMessage = errObj.message
      } else if (typeof e?.message === 'string') {
        errorMessage = e.message
      }

      setError(translateAuthError(errorMessage))
    } finally {
      setIsLoading(false)
    }
  }

  const handlePhoneOTPRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setPhoneError("")

    const digits = phone.replace(/\D/g, '')
    if (digits.length < 8) {
      setPhoneError("Digite um número de telefone válido")
      return
    }

    setIsLoading(true)
    const normalized = normalizePhone(phone)

    try {
      const { error: apiError } = await api.auth.loginOTPPhone.mutate({
        body: { phone: normalized, 'cf-turnstile-response': turnstileToken }
      } as Parameters<typeof api.auth.loginOTPPhone.mutate>[0])

      if (apiError) {
        throw apiError
      }

      router.push('/login/verify?phone=' + encodeURIComponent(normalized))
    } catch (err: unknown) {
      let errorMessage = "Erro ao enviar código. Tente novamente."

      const e = err as Record<string, unknown> | undefined
      const errObj = e?.error as Record<string, unknown> | undefined
      if (errObj?.details && Array.isArray(errObj.details) && errObj.details.length > 0) {
        errorMessage = String(errObj.details[0]?.message) || errorMessage
      } else if (typeof errObj?.message === 'string') {
        errorMessage = errObj.message
      } else if (typeof e?.message === 'string') {
        errorMessage = e.message
      }

      setError(translateAuthError(errorMessage))
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true)
    setError("")

    try {
      const { data, error: apiError } = await api.auth.googleAuth.query()

      if (apiError) {
        setError("Erro ao iniciar autenticação com Google")
        setIsGoogleLoading(false)
        return
      }

      const authUrl = (data as { authUrl?: string } | null)?.authUrl
      if (authUrl) {
        window.location.href = authUrl
      } else {
        setError("Erro ao obter URL de autenticação do Google")
        setIsGoogleLoading(false)
      }
    } catch {
      setError("Erro ao conectar com Google. Tente novamente.")
      setIsGoogleLoading(false)
    }
  }

  const isWhatsAppMode = mode === "whatsapp"

  return (
    <div className={cn("flex flex-col gap-10 w-full", className)} {...props}>
      {/* aria-live announcer for mode changes (visually hidden) */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isWhatsAppMode ? "Modo WhatsApp ativado" : "Modo email ativado"}
      </div>

      {/* Header with staggered animation */}
      <div className="space-y-3 animate-fade-in-up stagger-1">
        <h1 id="login-form-title" className="text-[1.75rem] font-bold tracking-[-0.03em] text-foreground leading-tight">
          Faça login no Quayer
        </h1>
        {SIGNUP_ENABLED && (
          <p className="text-[0.875rem] text-foreground/70 leading-relaxed">
            Não tem conta?{" "}
            <Link
              href="/signup"
              className="inline-flex items-center gap-0.5 text-foreground hover:text-foreground/80 font-medium underline underline-offset-2 transition-colors"
            >
              Comece agora
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </p>
        )}
      </div>

      <form
        onSubmit={isWhatsAppMode ? handlePhoneOTPRequest : handleOTPRequest}
        aria-labelledby="login-form-title"
        className="animate-fade-in-up stagger-2"
      >
        <FieldGroup className="space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-3 animate-fade-in">
              <div aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-300" role="alert" aria-live="assertive">{error}</p>
            </div>
          )}

          {!isWhatsAppMode && (
            <>
              {/* Email input */}
              <Field>
                <FieldLabel
                  htmlFor="email-input"
                  className="text-[0.8rem] font-medium text-foreground/70 uppercase tracking-wider"
                >
                  Email
                </FieldLabel>
                <Input
                  ref={emailInputRef}
                  id="email-input"
                  name="email"
                  type="email"
                  inputMode="email"
                  placeholder="voce@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading || isGoogleLoading}
                  autoFocus
                  autoComplete="username webauthn"
                  aria-required="true"
                  className="h-11 auth-input"
                />
              </Field>

              <TurnstileWidget
                onSuccess={setTurnstileToken}
                action="login"
              />

              {/* PRIMARY: Continuar com Email — preto/foreground */}
              <Field>
                <Button
                  type="submit"
                  variant="ghost"
                  aria-label="Continuar com Email"
                  className={cn(
                    "w-full h-11 min-h-[44px] rounded-lg font-semibold text-[0.875rem] transition-all duration-300",
                    "bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "disabled:opacity-60"
                  )}
                  disabled={isLoading || isGoogleLoading}
                  aria-busy={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-[18px] w-[18px]" aria-hidden="true" />
                      Continuar com Email
                    </>
                  )}
                </Button>
                <p className="mt-3 text-center text-xs text-foreground/60 leading-relaxed">
                  Enviaremos um código por email.
                </p>
              </Field>

              <FieldSeparator className="text-foreground/60">ou</FieldSeparator>

              {/* SECONDARY: Google + TERTIARY: WhatsApp */}
              <div className="flex flex-col gap-2">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isGoogleLoading || isLoading}
                  aria-busy={isGoogleLoading}
                  aria-label="Continuar com Google"
                  className={cn(
                    "w-full h-11 min-h-[44px] rounded-lg font-medium text-[0.875rem]",
                    "bg-muted text-foreground border border-border hover:bg-muted/80 hover:border-border/80",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "transition-all duration-200"
                  )}
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

                <Button
                  variant="ghost"
                  type="button"
                  onClick={switchToWhatsApp}
                  disabled={isGoogleLoading || isLoading}
                  aria-label="Continuar com WhatsApp"
                  className={cn(
                    "w-full h-11 min-h-[44px] rounded-lg font-medium text-[0.875rem]",
                    "bg-[#075E54] text-white hover:bg-[#054C44] active:bg-[#043A34]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "transition-all duration-200"
                  )}
                >
                  <WhatsAppIcon className="mr-2 h-[18px] w-[18px] text-white" />
                  Continuar com WhatsApp
                </Button>
              </div>
            </>
          )}

          {isWhatsAppMode && (
            <>
              {/* Phone input with country selector */}
              <Field>
                <FieldLabel
                  htmlFor="phone-input"
                  className="text-[0.8rem] font-medium text-foreground/70 uppercase tracking-wider"
                >
                  Telefone (WhatsApp)
                </FieldLabel>
                <div className="flex gap-2">
                  <Popover open={openCountry} onOpenChange={setOpenCountry}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCountry}
                        aria-label={`País: ${selectedCountry.name}, código +${selectedCountry.dialCode}`}
                        className="h-11 min-h-[44px] gap-1.5 px-3 rounded-lg border-input bg-background hover:bg-muted/40 shrink-0"
                      >
                        <FlagIcon iso2={selectedCountry.iso2} className="h-3.5 w-5 rounded-sm" />
                        <span className="text-sm tabular-nums text-foreground">+{selectedCountry.dialCode}</span>
                        <ChevronsUpDown className="h-3.5 w-3.5 text-foreground/50" aria-hidden="true" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar país..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>Nenhum país encontrado.</CommandEmpty>
                          <CommandGroup>
                            {ALL_COUNTRIES.map((country) => (
                              <CommandItem
                                key={country.iso2}
                                value={`${country.name} ${country.dialCode}`}
                                onSelect={() => {
                                  setCountryIso2(country.iso2)
                                  setOpenCountry(false)
                                }}
                                className="gap-2"
                              >
                                <FlagIcon iso2={country.iso2} className="h-3.5 w-5 rounded-sm" />
                                <span className="flex-1 text-sm">{country.name}</span>
                                <span className="text-xs text-foreground/60 tabular-nums">+{country.dialCode}</span>
                                {country.iso2 === countryIso2 && (
                                  <Check className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  <Input
                    ref={phoneInputRef}
                    id="phone-input"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value)
                      if (phoneError) setPhoneError("")
                    }}
                    disabled={isLoading}
                    autoComplete="tel"
                    aria-required="true"
                    aria-invalid={!!phoneError}
                    aria-describedby={phoneError ? "phone-error" : undefined}
                    className="h-11 auth-input flex-1"
                  />
                </div>
                {phoneError && (
                  <p
                    id="phone-error"
                    role="alert"
                    aria-live="assertive"
                    className="mt-2 text-sm text-red-600 dark:text-red-300"
                  >
                    {phoneError}
                  </p>
                )}
              </Field>

              <TurnstileWidget
                onSuccess={setTurnstileToken}
                action="login"
              />

              {/* PRIMARY (WhatsApp mode): verde */}
              <Field>
                <Button
                  type="submit"
                  variant="ghost"
                  aria-label="Enviar código pelo WhatsApp"
                  className={cn(
                    "w-full h-11 min-h-[44px] rounded-lg font-semibold text-[0.875rem] transition-all duration-300",
                    "bg-[#075E54] text-white hover:bg-[#054C44] active:bg-[#043A34]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "disabled:opacity-60"
                  )}
                  disabled={isLoading}
                  aria-busy={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <WhatsAppIcon className="mr-2 h-[18px] w-[18px] text-white" />
                      Enviar código pelo WhatsApp
                    </>
                  )}
                </Button>
                <p className="mt-3 text-center text-xs text-foreground/60 leading-relaxed">
                  Você receberá um código via WhatsApp.
                </p>
              </Field>

              <button
                type="button"
                onClick={switchToEmail}
                aria-label="Voltar para login com email"
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 self-center min-h-[44px] px-3 text-sm font-medium",
                  "text-foreground/70 hover:text-foreground transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
                )}
                disabled={isLoading}
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Voltar para email
              </button>
            </>
          )}
        </FieldGroup>
      </form>

      <p className="text-center text-[0.75rem] text-foreground/70 leading-relaxed animate-fade-in-up stagger-3 mt-8">
        Ao entrar, você concorda com os{" "}
        <Link href="/termos" className="underline underline-offset-2 hover:text-foreground transition-colors">Termos de Serviço</Link>
        {" "}e a{" "}
        <Link href="/privacidade" className="underline underline-offset-2 hover:text-foreground transition-colors">Política de Privacidade</Link>.
      </p>
    </div>
  )
}
