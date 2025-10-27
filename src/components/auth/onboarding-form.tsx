"use client"

import { useState } from "react"
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
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Building2, CheckCircle, ArrowRight } from "lucide-react"
import { createOrganizationAction } from "@/app/(auth)/onboarding/actions"

type OnboardingStep = "welcome" | "organization" | "complete"

export function OnboardingForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [step, setStep] = useState<OnboardingStep>("welcome")
  const [orgData, setOrgData] = useState({
    name: "",
    document: "",
    type: "pj" as "pf" | "pj"
  })
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      // ✅ CORREÇÃO BRUTAL: Usar Server Action para evitar problema de headers
      const formData = new FormData()
      formData.append('name', orgData.name)
      formData.append('document', orgData.document)
      formData.append('type', orgData.type)

      const result = await createOrganizationAction(formData)

      if (result.success) {
        console.log('✅ Organização criada:', result.organization)
        setStep("complete")
        // ✅ CORREÇÃO BRUTAL: Redirecionar após sucesso
        setTimeout(() => {
          window.location.href = "/admin"
        }, 2000)
      } else {
        setError(result.error || "Erro ao criar organização")
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Erro ao criar organização:', error)
      setError("Erro inesperado ao criar organização")
      setIsLoading(false)
    }
  }

  // ✅ CORREÇÃO BRUTAL: Formatação dinâmica baseada no tipo
  const formatDocument = (value: string, type: 'pf' | 'pj') => {
    const numbers = value.replace(/\D/g, '')
    
    if (type === 'pf') {
      // CPF: 000.000.000-00
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    } else {
      // CNPJ: 00.000.000/0000-00
      return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    }
  }

  const handleDocumentChange = (value: string) => {
    const formatted = formatDocument(value, orgData.type)
    setOrgData(prev => ({ ...prev, document: formatted }))
  }

  // ✅ CORREÇÃO BRUTAL: Limpar documento ao trocar tipo
  const handleTypeChange = (newType: 'pf' | 'pj') => {
    setOrgData(prev => ({ 
      ...prev, 
      type: newType,
      document: '' // Limpar documento ao trocar tipo
    }))
  }

  if (step === "welcome") {
    return (
      <Card className={cn("w-full", className)} {...props}>
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-semibold">Bem-vindo ao Quayer!</CardTitle>
          <CardDescription>
            Vamos configurar sua organização para começar a usar a plataforma
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => setStep("organization")}
            className="w-full"
            size="lg"
          >
            Começar Configuração
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (step === "organization") {
    return (
      <Card className={cn("w-full", className)} {...props}>
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl font-semibold">Criar Organização</CardTitle>
          <CardDescription>
            Configure os dados básicos da sua organização
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateOrganization} className="space-y-6">
            <FieldGroup>
              <Field>
                <FieldLabel>Nome da Organização</FieldLabel>
                <Input
                  type="text"
                  placeholder="Ex: Minha Empresa LTDA"
                  value={orgData.name}
                  onChange={(e) => setOrgData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
                <FieldDescription>
                  Nome oficial da sua organização
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>{orgData.type === 'pf' ? 'CPF' : 'CNPJ'}</FieldLabel>
                <Input
                  type="text"
                  placeholder={orgData.type === 'pf' ? '000.000.000-00' : '00.000.000/0000-00'}
                  value={orgData.document}
                  onChange={(e) => handleDocumentChange(e.target.value)}
                  maxLength={orgData.type === 'pf' ? 14 : 18}
                  required
                />
                <FieldDescription>
                  {orgData.type === 'pf' ? 'CPF do responsável' : 'CNPJ da organização'} (apenas números)
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Tipo de Organização</FieldLabel>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={orgData.type === "pj" ? "default" : "outline"}
                    onClick={() => handleTypeChange("pj")}
                    className="flex-1"
                  >
                    Pessoa Jurídica
                  </Button>
                  <Button
                    type="button"
                    variant={orgData.type === "pf" ? "default" : "outline"}
                    onClick={() => handleTypeChange("pf")}
                    className="flex-1"
                  >
                    Pessoa Física
                  </Button>
                </div>
              </Field>
            </FieldGroup>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {typeof error === 'string' ? error : JSON.stringify(error)}
                </AlertDescription>
              </Alert>
            )}

            <FieldSeparator />

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("welcome")}
                className="flex-1"
                disabled={isLoading}
              >
                Voltar
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isLoading || !orgData.name || !orgData.document}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Organização
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    )
  }

  if (step === "complete") {
    return (
      <Card className={cn("w-full", className)} {...props}>
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-semibold">Organização Criada!</CardTitle>
          <CardDescription>
            Sua organização foi configurada com sucesso. Redirecionando para o dashboard...
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return null
}
