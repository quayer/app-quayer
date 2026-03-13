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
import { Alert, AlertDescription } from "@/client/components/ui/alert"
import { Loader2, Building2, CheckCircle, ArrowRight } from "lucide-react"
import { createOrganizationAction } from "@/app/(auth)/onboarding/actions"
import { getCsrfHeaders } from "@/client/hooks/use-csrf-token"

type OnboardingStep = "loading" | "name" | "creating" | "complete"

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
        setStep("complete")
        setTimeout(() => { window.location.href = "/integracoes" }, 1500)
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
        <Loader2 className="h-6 w-6 animate-spin text-purple-400" aria-hidden="true" />
        <span className="sr-only">Carregando...</span>
      </div>
    )
  }

  // Criando org automaticamente
  if (step === "creating") {
    return (
      <div className={cn("w-full max-w-sm mx-auto", className)} {...props}>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20">
            <Building2 className="h-6 w-6 text-purple-300" />
          </div>
          <h1 className="text-2xl font-bold text-white">Preparando tudo...</h1>
          <p className="text-gray-400">
            Estamos configurando sua conta
          </p>
          <div className="flex justify-center pt-4">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" aria-hidden="true" />
            <span className="sr-only">Configurando sua conta...</span>
          </div>
        </div>
      </div>
    )
  }

  if (step === "name") {
    return (
      <div className={cn("w-full max-w-sm mx-auto", className)} {...props}>
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-white">Configure sua conta</h1>
            <p className="text-gray-400">
              Informe seus dados para começar
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FieldGroup>
              {/* firstName + lastName side by side */}
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel className="text-gray-300">Nome</FieldLabel>
                  <Input
                    type="text"
                    placeholder="João"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    minLength={2}
                    autoFocus
                    disabled={isLoading}
                    className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus-visible:border-purple-500 focus-visible:ring-purple-500/30"
                  />
                </Field>
                <Field>
                  <FieldLabel className="text-gray-300">Sobrenome</FieldLabel>
                  <Input
                    type="text"
                    placeholder="Silva"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isLoading}
                    className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus-visible:border-purple-500 focus-visible:ring-purple-500/30"
                  />
                </Field>
              </div>

              {/* companyName full width */}
              <Field>
                <FieldLabel className="text-gray-300">Nome da empresa</FieldLabel>
                <Input
                  type="text"
                  placeholder="Minha Empresa"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  minLength={2}
                  disabled={isLoading}
                  className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus-visible:border-purple-500 focus-visible:ring-purple-500/30"
                />
              </Field>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 border-0"
                disabled={isLoading || !firstName.trim() || !companyName.trim()}
              >
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando conta...</>
                ) : (
                  <>Continuar<ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>

              <p className="text-xs text-gray-400 text-center leading-relaxed">
                Ao continuar, você concorda com os{" "}
                <a href="/termos" target="_blank" className="text-purple-400 underline underline-offset-2 hover:text-purple-300">
                  Termos de Uso
                </a>{" "}
                e a{" "}
                <a href="/privacidade" target="_blank" className="text-purple-400 underline underline-offset-2 hover:text-purple-300">
                  Política de Privacidade
                </a>.
              </p>
            </FieldGroup>
          </form>
        </div>
      </div>
    )
  }

  if (step === "complete") {
    return (
      <div className={cn("w-full max-w-sm mx-auto", className)} {...props}>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle className="h-6 w-6 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Tudo pronto!</h1>
          <p className="text-gray-400">
            Sua conta foi configurada. Redirecionando...
          </p>
          <div className="flex justify-center pt-2">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" aria-hidden="true" />
            <span className="sr-only">Redirecionando...</span>
          </div>
        </div>
      </div>
    )
  }

  return null
}
