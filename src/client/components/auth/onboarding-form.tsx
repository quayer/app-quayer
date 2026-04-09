"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/client/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/client/components/ui/field"
import { Input } from "@/client/components/ui/input"
import { Loader2, Building2, ArrowRight } from "lucide-react"
import { createOrganizationAction } from "@/app/(auth)/onboarding/actions"
import { getCsrfHeaders } from "@/client/hooks/use-csrf-token"

type OnboardingStep = "loading" | "name" | "creating"

/** Extrai mensagem legivel de qualquer formato de erro */
function extractErrorMessage(err: unknown): string {
  if (!err) return "Erro desconhecido"
  if (typeof err === 'string') return err
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    if (Array.isArray(obj.details) && obj.details[0]?.message) return obj.details[0].message as string
    return JSON.stringify(err)
  }
  return String(err)
}

/** Divide um nome completo em firstName e lastName */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length <= 1) {
    return { firstName: parts[0] || '', lastName: '' }
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

export function OnboardingForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [step, setStep] = useState<OnboardingStep>("loading")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const autoCreatedRef = useRef(false)
  /** Whether user already had a name from Google login */
  const hadNameRef = useRef(false)

  /** Cria organizacao automaticamente com o companyName */
  const autoCreateOrg = useCallback(async (orgName: string) => {
    if (autoCreatedRef.current) return
    autoCreatedRef.current = true
    setStep("creating")

    try {
      const formData = new FormData()
      formData.append('name', orgName)
      formData.append('type', 'pj')

      const result = await createOrganizationAction(formData)

      if (result.success) {
        window.location.href = "/"
      } else {
        setError(extractErrorMessage(result.error) || "Erro ao criar organização")
        autoCreatedRef.current = false
        setStep("name")
        setIsLoading(false)
      }
    } catch {
      setError("Erro inesperado")
      autoCreatedRef.current = false
      setStep("name")
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch('/api/v1/auth/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const name: string = data?.data?.name || ''
        // Se ja tem nome real (Google login), pre-preenche firstName/lastName
        // mas SEMPRE mostra o form para pedir companyName
        if (name && name !== 'Usuário WhatsApp' && name.trim().length >= 2) {
          const { firstName: fn, lastName: ln } = splitName(name)
          setFirstName(fn)
          setLastName(ln)
          hadNameRef.current = true
        }
        setStep('name')
      })
      .catch(() => { setStep('name') })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()
    const trimmedCompany = companyName.trim()

    if (!trimmedFirst || trimmedFirst.length < 2) {
      setError('O nome deve ter pelo menos 2 caracteres')
      return
    }
    if (!trimmedCompany || trimmedCompany.length < 2) {
      setError('O nome da empresa deve ter pelo menos 2 caracteres')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // Salvar nome no perfil (firstName + lastName)
      const fullName = trimmedLast ? `${trimmedFirst} ${trimmedLast}` : trimmedFirst
      const res = await fetch('/api/v1/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
        credentials: 'include',
        body: JSON.stringify({ name: fullName }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(extractErrorMessage(d?.error) || 'Erro ao salvar nome')
        setIsLoading(false)
        return
      }
      // Criar org com companyName
      await autoCreateOrg(trimmedCompany)
    } catch {
      setError('Erro ao salvar dados')
      setIsLoading(false)
    }
  }

  // Loading — evita flash de tela
  if (step === "loading") {
    return (
      <div className={cn("flex items-center justify-center py-12", className)} {...props}>
        <Loader2 className="h-6 w-6 animate-spin text-white/40" aria-hidden="true" />
        <span className="sr-only">Carregando...</span>
      </div>
    )
  }

  // Criando org automaticamente
  if (step === "creating") {
    return (
      <div className={cn("w-full flex flex-col gap-10", className)} {...props}>
        <div className="space-y-3 animate-fade-in-up stagger-1">
          <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] text-white leading-tight">
            Preparando tudo...
          </h1>
          <p className="text-[0.875rem] text-white/40 leading-relaxed">
            Estamos configurando sua conta
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-white/30" aria-hidden="true" />
          <Loader2 className="h-5 w-5 animate-spin text-white/40" aria-hidden="true" />
          <span className="sr-only">Configurando sua conta...</span>
        </div>
      </div>
    )
  }

  if (step === "name") {
    return (
      <div className={cn("w-full flex flex-col gap-10", className)} {...props}>
        {/* Header */}
        <div className="space-y-3 animate-fade-in-up stagger-1">
          <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] text-white leading-tight">
            Configure sua conta
          </h1>
          <p className="text-[0.875rem] text-white/40 leading-relaxed">
            Informe seus dados para começar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="animate-fade-in-up stagger-2">
          <FieldGroup>
            {error && (
              <div className="flex items-start gap-2.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-3 animate-fade-in">
                <div className="h-1.5 w-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                <p className="text-sm text-red-300" role="alert" aria-live="assertive">{error}</p>
              </div>
            )}

            {/* firstName + lastName side by side */}
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="firstName" className="text-[0.8rem] font-medium text-white/50 uppercase tracking-wider">Nome</FieldLabel>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="João"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  aria-required="true"
                  minLength={2}
                  autoFocus
                  disabled={isLoading}
                  className="h-11 auth-input"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="lastName" className="text-[0.8rem] font-medium text-white/50 uppercase tracking-wider">Sobrenome</FieldLabel>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Silva"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  aria-required="true"
                  disabled={isLoading}
                  className="h-11 auth-input"
                />
              </Field>
            </div>

            {/* companyName full width */}
            <Field>
              <FieldLabel htmlFor="companyName" className="text-[0.8rem] font-medium text-white/50 uppercase tracking-wider">Nome da empresa</FieldLabel>
              <Input
                id="companyName"
                type="text"
                placeholder="Minha Empresa"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                aria-required="true"
                minLength={2}
                disabled={isLoading}
                className="h-11 auth-input"
              />
            </Field>

            <Button
              type="submit"
              variant="ghost"
              className={cn(
                "w-full h-11 min-h-[44px] rounded-lg font-semibold text-[0.875rem] transition-all duration-300",
                firstName.trim() && companyName.trim()
                  ? "bg-white text-[#0a0d14] hover:bg-white/90 active:bg-white/80 shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                  : "bg-white/[0.06] text-white/30 border border-white/[0.06] hover:bg-white/[0.08] hover:text-white/40"
              )}
              disabled={isLoading || !firstName.trim() || !companyName.trim()}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Criando conta...</>
              ) : (
                <>Continuar<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></>
              )}
            </Button>
          </FieldGroup>
        </form>

        <p className="text-center text-[0.75rem] text-white/25 leading-relaxed animate-fade-in-up stagger-3">
          Ao continuar, você concorda com os{" "}
          <a href="/termos" target="_blank" className="underline underline-offset-2 hover:text-white/40 transition-colors">
            Termos de Uso
          </a>{" "}
          e a{" "}
          <a href="/privacidade" target="_blank" className="underline underline-offset-2 hover:text-white/40 transition-colors">
            Política de Privacidade
          </a>.
        </p>
      </div>
    )
  }

  return null
}
