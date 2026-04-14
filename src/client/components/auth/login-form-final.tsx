"use client"

import { useState, useEffect, useMemo, useRef, memo } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/client/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/client/components/ui/field"
import { Input } from "@/client/components/ui/input"
import { Loader2, Mail, Smartphone, ChevronsUpDown, Check, ArrowRight } from "lucide-react"
import { GoogleIcon } from "@/client/components/ui/google-icon"
import Link from "next/link"
import { api } from "@/igniter.client"
import { translateAuthError } from "@/lib/utils/translate-auth-error"
import { TurnstileWidget } from "@/client/components/auth/turnstile-widget"
import { SIGNUP_ENABLED } from "@/lib/config"
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
import { startAuthentication } from '@simplewebauthn/browser'
import { getCsrfHeaders, ensureCsrfHeaders } from "@/client/hooks/use-csrf-token"
import { looksLikePhone } from "@/lib/utils/phone"

const FlagIcon = memo(function FlagIcon({ iso2, className }: { iso2: string; className?: string }) {
  const code = iso2.toUpperCase() as keyof typeof Flags
  const Component = Flags[code]
  if (!Component) return <span className={className}>{iso2.toUpperCase()}</span>
  return <Component className={className} />
})

const ALL_COUNTRIES = defaultCountries
  .map(c => { const p = parseCountry(c); return { iso2: p.iso2, dialCode: p.dialCode, name: p.name } })
  .sort((a, b) => a.name.localeCompare(b.name))

const BR_COUNTRY = ALL_COUNTRIES.find(c => c.iso2 === "br")!

export function LoginFormFinal({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [countryIso2, setCountryIso2] = useState("br")
  const [openCountry, setOpenCountry] = useState(false)
  const [phoneMode, setPhoneMode] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState("")
  const phoneInputRef = useRef<HTMLInputElement>(null)

  const selectedCountry = useMemo(
    () => ALL_COUNTRIES.find(c => c.iso2 === countryIso2) ?? BR_COUNTRY,
    [countryIso2]
  )

  const isPhone = phoneMode || looksLikePhone(email)

  useEffect(() => {
    if (isPhone && !phoneMode) {
      setPhoneMode(true)
      const digits = email.replace(/\D/g, '')
      const code = selectedCountry.dialCode
      if (digits.startsWith(code) && digits.length > code.length) {
        setEmail(digits.slice(code.length))
      }
      requestAnimationFrame(() => phoneInputRef.current?.focus())
    }
    if (phoneMode && email.replace(/\D/g, '').length < 3) {
      setPhoneMode(false)
    }
  }, [email, isPhone, phoneMode, selectedCountry.dialCode])

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
        if (result.needsOnboarding) router.push('/onboarding')
        else if (result.user?.role === 'admin') router.push('/admin')
        else router.push('/')
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.debug('[Conditional UI]', err)
      }
    }

    runConditionalUI()
    return () => controller.abort()
  }, [router])

  useEffect(() => {
    const trimmed = email.trim()
    if (!trimmed.startsWith('+')) return
    const digits = trimmed.replace(/\D/g, '')
    for (const len of [3, 2, 1]) {
      const prefix = digits.slice(0, len)
      const match = ALL_COUNTRIES.find(c => c.dialCode === prefix)
      if (match && match.iso2 !== countryIso2) { setCountryIso2(match.iso2); break }
    }
  }, [email, countryIso2])

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

  const handleOTPRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    if (looksLikePhone(email.trim())) {
      const phone = normalizePhone(email.trim())
      const res = await fetch('/api/v1/auth/login-otp-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
        credentials: 'include',
        body: JSON.stringify({ phone, 'cf-turnstile-response': turnstileToken })
      })
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10)
        setError(`Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} minuto(s).`)
        setIsLoading(false)
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message || data?.error || 'Erro ao enviar código')
        setIsLoading(false)
        return
      }
      router.push('/login/verify?phone=' + encodeURIComponent(phone))
      return
    }

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

      if (data && 'authUrl' in data && data.authUrl) {
        window.location.href = data.authUrl
      } else {
        setError("Erro ao obter URL de autenticação do Google")
        setIsGoogleLoading(false)
      }
    } catch {
      setError("Erro ao conectar com Google. Tente novamente.")
      setIsGoogleLoading(false)
    }
  }

  const hasInput = email.trim().length > 0

  return (
    <div className={cn("flex flex-col gap-10 w-full", className)} {...props}>
      {/* Header with staggered animation */}
      <div className="space-y-3 animate-fade-in-up stagger-1">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] text-white leading-tight">
          Faça login no Quayer
        </h1>
        {SIGNUP_ENABLED && (
          <p className="text-[0.875rem] text-white/40 leading-relaxed">
            Não tem conta?{" "}
            <Link
              href="/signup"
              className="inline-flex items-center gap-0.5 text-white hover:text-white/80 font-medium underline underline-offset-2 transition-colors"
            >
              Comece agora
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </p>
        )}
      </div>

      <form onSubmit={handleOTPRequest} className="animate-fade-in-up stagger-2">
        <FieldGroup>
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-3 animate-fade-in">
              <div className="h-1.5 w-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
              <p className="text-sm text-red-300" role="alert" aria-live="assertive">{error}</p>
            </div>
          )}

          {/* Email / Phone input */}
          <Field>
            <FieldLabel htmlFor={isPhone ? "phone-input" : "email-input"} className="text-[0.8rem] font-medium text-white/50 uppercase tracking-wider">
              Email ou Telefone
            </FieldLabel>

            {/* Phone mode */}
            <div className={cn("flex w-full items-stretch", !isPhone && "hidden")}>
              <Popover open={openCountry} onOpenChange={setOpenCountry}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={isLoading || isGoogleLoading}
                    aria-label="Selecionar país"
                    className={cn(
                      "flex items-center justify-center gap-1 h-11 !min-h-11 w-24 shrink-0 leading-none overflow-hidden",
                      "border border-white/[0.08] border-r-0 rounded-l-lg px-2",
                      "bg-white/[0.04] hover:bg-white/[0.08] text-white transition-all duration-200",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1",
                      "disabled:opacity-50 disabled:pointer-events-none"
                    )}
                  >
                    <FlagIcon iso2={selectedCountry.iso2} className="h-4 w-5 shrink-0 rounded-[2px]" />
                    <span className="text-white/50 text-xs font-medium tabular-nums">+{selectedCountry.dialCode}</span>
                    <ChevronsUpDown className="h-3 w-3 opacity-30 shrink-0" aria-hidden="true" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[min(320px,calc(100vw-2rem))]" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar país..." />
                    <CommandList className="max-h-56">
                      <CommandEmpty>País não encontrado.</CommandEmpty>
                      <CommandGroup>
                        {ALL_COUNTRIES.map(c => (
                          <CommandItem
                            key={c.iso2}
                            value={`${c.name} ${c.dialCode}`}
                            onSelect={() => { setCountryIso2(c.iso2); setOpenCountry(false) }}
                            className="gap-2"
                          >
                            <FlagIcon iso2={c.iso2} className="h-4 w-5 shrink-0 rounded-[2px]" />
                            <span className="flex-1 truncate text-sm">{c.name}</span>
                            <span className="text-muted-foreground text-xs ml-auto">+{c.dialCode}</span>
                            {c.iso2 === countryIso2 && <Check className="h-3.5 w-3.5 shrink-0 text-white/60" />}
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
                type="text"
                inputMode="tel"
                tabIndex={isPhone ? 0 : -1}
                placeholder="(11) 99999-9999"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading || isGoogleLoading}
                className="flex-1 h-11 rounded-l-none border-l-0 shadow-none auth-input"
              />
            </div>

            {/* Email mode */}
            <Input
              id="email-input"
              name="email"
              type="text"
              inputMode="email"
              tabIndex={!isPhone ? 0 : -1}
              placeholder="email@exemplo.com ou (11) 99999-9999"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading || isGoogleLoading}
              autoFocus
              autoComplete="username webauthn"
              aria-required="true"
              className={cn("h-11 auth-input", isPhone && "hidden")}
            />
          </Field>

          <TurnstileWidget
            onSuccess={setTurnstileToken}
            action="login"
          />

          {/* Submit */}
          <Field>
            <Button
              type="submit"
              variant="ghost"
              className={cn(
                "w-full h-11 min-h-[44px] rounded-lg font-semibold text-[0.875rem] transition-all duration-300",
                hasInput
                  ? "bg-white text-[#0a0d14] hover:bg-white/90 active:bg-white/80 shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                  : "bg-white/[0.06] text-white/30 border border-white/[0.06] hover:bg-white/[0.08] hover:text-white/40"
              )}
              disabled={isLoading || isGoogleLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Enviando...
                </>
              ) : isPhone ? (
                <>
                  <Smartphone className="mr-2 h-4 w-4" aria-hidden="true" />
                  Continuar com WhatsApp
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                  Continuar com Email
                </>
              )}
            </Button>
          </Field>

          <FieldSeparator className="text-white/20 [&>span]:text-white/20 [&>div]:border-white/[0.06]">ou</FieldSeparator>

          {/* Google OAuth */}
          <Field>
            <Button
              variant="ghost"
              type="button"
              onClick={handleGoogleLogin}
              disabled={isGoogleLoading || isLoading}
              aria-busy={isGoogleLoading}
              className="w-full h-11 min-h-[44px] rounded-lg bg-white/[0.04] text-white/70 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white hover:border-white/[0.15] transition-all duration-200"
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
          </Field>
        </FieldGroup>
      </form>

      <p className="text-center text-[0.75rem] text-white/25 leading-relaxed animate-fade-in-up stagger-3">
        Ao entrar, você concorda com os{" "}
        <Link href="/termos" className="underline underline-offset-2 hover:text-white/40 transition-colors">Termos de Serviço</Link>
        {" "}e a{" "}
        <Link href="/privacidade" className="underline underline-offset-2 hover:text-white/40 transition-colors">Política de Privacidade</Link>.
      </p>
    </div>
  )
}
