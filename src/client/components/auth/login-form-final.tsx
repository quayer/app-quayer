"use client"

import { useState, useEffect, useMemo, useRef, memo } from "react"
import { useRouter } from "next/navigation"
import { startAuthentication } from '@simplewebauthn/browser'
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
import { Alert, AlertDescription } from "@/client/components/ui/alert"
import { Loader2, Mail, Smartphone, ChevronsUpDown, Check, ArrowRight } from "lucide-react"
import { GoogleIcon } from "@/client/components/ui/google-icon"
import Link from "next/link"
import { api } from "@/igniter.client"
import { TurnstileWidget } from "@/client/components/auth/turnstile-widget"
import { defaultCountries, parseCountry } from "react-international-phone"
import Flags from "country-flag-icons/react/3x2"
import { Popover, PopoverContent, PopoverTrigger } from "@/client/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/client/components/ui/command"

/** Bandeira SVG fora do componente — evita recriação a cada render */
const FlagIcon = memo(function FlagIcon({ iso2, className }: { iso2: string; className?: string }) {
  const code = iso2.toUpperCase() as keyof typeof Flags
  const Component = Flags[code]
  if (!Component) return <span className={className}>{iso2.toUpperCase()}</span>
  return <Component className={className} />
})

/** Lista de países pré-computada (singleton) */
const ALL_COUNTRIES = defaultCountries
  .map(c => { const p = parseCountry(c); return { iso2: p.iso2, dialCode: p.dialCode, name: p.name } })
  .sort((a, b) => a.name.localeCompare(b.name))

const BR_COUNTRY = ALL_COUNTRIES.find(c => c.iso2 === "br")!

function looksLikePhone(v: string): boolean {
  const clean = v.replace(/[^\d]/g, '')
  return clean.length >= 8
}

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

  // Sticky: uma vez em phone mode, só sai se campo ficar quase vazio
  const isPhone = phoneMode || looksLikePhone(email)

  // Entrar/sair do phone mode e transferir foco
  useEffect(() => {
    if (isPhone && !phoneMode) {
      // Ativar phone mode sticky
      setPhoneMode(true)
      // Strip dial code do STATE para evitar duplicação visual (+55 | 5511...)
      const digits = email.replace(/\D/g, '')
      const code = selectedCountry.dialCode
      if (digits.startsWith(code) && digits.length > code.length) {
        setEmail(digits.slice(code.length))
      }
      // Transferir foco
      requestAnimationFrame(() => phoneInputRef.current?.focus())
    }
    // Sair do phone mode quando campo quase vazio
    if (phoneMode && email.replace(/\D/g, '').length < 3) {
      setPhoneMode(false)
    }
  }, [email, isPhone, phoneMode, selectedCountry.dialCode])

  useEffect(() => {
    const runConditionalUI = async () => {
      try {
        const res = await fetch('/api/v1/auth/passkey/login/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        })
        if (!res.ok) return
        const { data: optionsWithId } = await res.json()
        const authResp = await startAuthentication({ optionsJSON: optionsWithId, useBrowserAutofill: true })
        const verifyRes = await fetch('/api/v1/auth/passkey/login/verify-conditional', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ response: authResp, challengeId: optionsWithId.challengeId })
        })
        if (!verifyRes.ok) return
        const { data: result } = await verifyRes.json()
        if (result.needsOnboarding) router.push('/onboarding')
        else if (result.user?.role === 'admin') router.push('/admin')
        else router.push('/integracoes')
      } catch (err) {
        console.debug('[Conditional UI]', err)
      }
    }
    runConditionalUI()
  }, [])

  /** Auto-detecta país quando usuário digita prefixo com '+' */
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

  /** Normaliza para E.164 usando país selecionado */
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
        headers: { 'Content-Type': 'application/json' },
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
        body: { email, 'cf-turnstile-response': turnstileToken } as Record<string, string>
      })

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

      setError(errorMessage)
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

      if (data?.authUrl) {
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

  return (
    <div className={cn("flex flex-col gap-8 max-w-sm mx-auto w-full", className)} {...props}>
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Faça login no Quayer</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Não tem conta?{" "}
          <Link href="/signup" className="inline-flex items-center gap-0.5 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500 focus-visible:ring-offset-2 rounded-sm">
            Comece agora
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </p>
      </div>

      <form onSubmit={handleOTPRequest}>
        <FieldGroup>
          {error && (
            <Alert variant="destructive" role="alert" aria-live="assertive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* EMAIL / PHONE INPUT — FIRST */}
          <Field>
            <FieldLabel htmlFor="email" className="text-sm font-medium text-gray-900 dark:text-gray-200">Email ou Telefone</FieldLabel>
            {/*
              Ambos inputs estão sempre no DOM — alternamos com hidden.
              Isso evita o flash de unmount/mount que causava delay.
            */}
            <div className={cn("flex w-full items-stretch", !isPhone && "hidden")}>
              <Popover open={openCountry} onOpenChange={setOpenCountry}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={isLoading || isGoogleLoading}
                    aria-label="Selecionar país"
                    className={cn(
                      "flex items-center justify-center gap-1 h-9 !min-h-9 w-24 shrink-0 leading-none overflow-hidden",
                      "border border-gray-200 dark:border-gray-700 border-r-0 rounded-l-md px-2",
                      "bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500 focus-visible:ring-offset-1",
                      "disabled:opacity-50 disabled:pointer-events-none"
                    )}
                  >
                    <FlagIcon iso2={selectedCountry.iso2} className="h-4 w-5 shrink-0 rounded-[2px]" />
                    <span className="text-gray-600 dark:text-gray-300 text-xs font-medium tabular-nums">+{selectedCountry.dialCode}</span>
                    <ChevronsUpDown className="h-3 w-3 opacity-40 shrink-0" aria-hidden="true" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="p-0 w-[min(320px,calc(100vw-2rem))]"
                  align="start"
                >
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
                            {c.iso2 === countryIso2 && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Input
                ref={phoneInputRef}
                id={isPhone ? "email" : undefined}
                name={isPhone ? "email" : undefined}
                type="text"
                inputMode="tel"
                tabIndex={isPhone ? 0 : -1}
                placeholder="(11) 99999-9999"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading || isGoogleLoading}
                className="flex-1 rounded-l-none border-l-0 shadow-none bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500"
              />
            </div>
            <Input
              id={!isPhone ? "email" : undefined}
              name={!isPhone ? "email" : undefined}
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
              className={cn("bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500", isPhone && "hidden")}
            />
          </Field>

          <TurnstileWidget
            onSuccess={setTurnstileToken}
            action="login"
          />

          {/* SEND CODE BUTTON — neutral when empty, dark when has input */}
          <Field>
            <Button
              type="submit"
              className={cn(
                "w-full min-h-[44px] transition-colors",
                email.trim()
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 border-transparent"
                  : "bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
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

          <FieldSeparator className="text-gray-400 dark:text-gray-500 [&>span]:text-gray-400 dark:[&>span]:text-gray-500 [&>div]:border-gray-200 dark:[&>div]:border-gray-800">OU</FieldSeparator>

          {/* GOOGLE OAUTH — BELOW */}
          <Field>
            <Button
              variant="outline"
              type="button"
              onClick={handleGoogleLogin}
              disabled={isGoogleLoading || isLoading}
              className="w-full min-h-[44px] bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
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
    </div>
  )
}
