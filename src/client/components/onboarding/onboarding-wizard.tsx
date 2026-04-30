'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Separator } from '@/client/components/ui/separator'
import { Progress } from '@/client/components/ui/progress'
import { Alert, AlertDescription } from '@/client/components/ui/alert'
import { api } from '@/igniter.client'
import { toast } from 'sonner'
import {
  Building2,
  Rocket,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Users,
  Sparkles,
  Clock,
  Bot,
} from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '@/client/components/ui/radio-group'
import { Switch } from '@/client/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/client/components/ui/select'
import { validateDocument, formatDocument } from '@/lib/validators/document-validator'

type OnboardingStep = 'welcome' | 'organization' | 'complete'

interface OrganizationFormData {
  name: string
  document: string
  type: 'pf' | 'pj'
  businessHoursEnabled: boolean
  businessHoursStart: string
  businessHoursEnd: string
  businessDays: string
  timezone: string
}

export function OnboardingWizard() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const [isLoading, setIsLoading] = useState(false)

  const [orgData, setOrgData] = useState<OrganizationFormData>({
    name: '',
    document: '',
    type: 'pj',
    businessHoursEnabled: false,
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
    businessDays: '1,2,3,4,5', // Segunda a Sexta
    timezone: 'America/Sao_Paulo',
  })

  // Mutation para criar organização
  const createOrgMutation = api.organizations.create.useMutation({
    onSuccess: async (data) => {
      toast.success('Organização criada com sucesso!')

      // Marcar onboarding como completo
      await markOnboardingComplete()

      setCurrentStep('complete')
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      toast.error(`Erro ao criar organização: ${message}`)
    },
  })

  // Mutation para marcar onboarding como completo
  const completeOnboardingMutation = api.auth.completeOnboarding.useMutation({
    onSuccess: () => {
      // Redirecionar após 2 segundos
      setTimeout(() => {
        // Pivot: Builder-only. Usuário conecta WhatsApp dentro do chat em /projetos/[id].
        router.push('/projetos')
        router.refresh()
      }, 2000)
    },
  })

  const markOnboardingComplete = async () => {
    try {
      completeOnboardingMutation.mutate()
    } catch (error) {
      console.error('Erro ao marcar onboarding como completo:', error)
    }
  }

  const handleNext = () => {
    if (currentStep === 'welcome') {
      setCurrentStep('organization')
    } else if (currentStep === 'organization') {
      handleCreateOrganization()
    }
  }

  const handleBack = () => {
    if (currentStep === 'organization') {
      setCurrentStep('welcome')
    }
  }

  const handleCreateOrganization = async () => {
    // Validações
    if (!orgData.name.trim()) {
      toast.error('Digite o nome da organização')
      return
    }

    if (!orgData.document.trim()) {
      toast.error('Digite o CPF ou CNPJ')
      return
    }

    // Validar documento (CPF ou CNPJ) com algoritmo real
    const validation = validateDocument(orgData.document)

    if (!validation.valid) {
      toast.error(validation.error || 'Documento inválido')
      return
    }

    // Verificar se o tipo corresponde ao documento
    const expectedType = validation.type === 'cpf' ? 'pf' : 'pj'
    if (orgData.type !== expectedType) {
      toast.error(
        `O documento digitado é um ${validation.type.toUpperCase()}, mas você selecionou ${orgData.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}`
      )
      return
    }

    setIsLoading(true)
    try {
      createOrgMutation.mutate({
        body: {
          name: orgData.name,
          document: orgData.document.replace(/\D/g, ''),
          type: orgData.type,
          // Configurações básicas da organização
          maxInstances: 5, // Limite padrão
          maxUsers: 10, // Limite padrão
          billingType: 'free', // Tipo gratuito para começar
        },
      })
    } finally {
      setIsLoading(false)
    }
  }

  const progress = currentStep === 'welcome' ? 0 : currentStep === 'organization' ? 50 : 100

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-2xl shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">Bem-vindo ao Quayer</CardTitle>
            </div>
            <div className="text-sm text-muted-foreground">
              {currentStep === 'welcome' && 'Passo 1 de 2'}
              {currentStep === 'organization' && 'Passo 2 de 2'}
              {currentStep === 'complete' && 'Concluído!'}
            </div>
          </div>
          <Progress value={progress} className="h-2" />
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Step 1: Welcome */}
          {currentStep === 'welcome' && (
            <div className="space-y-6 py-4">
              <div className="text-center space-y-4">
                <div className="mx-auto w-fit">
                  <div className="rounded-full bg-primary/10 p-6">
                    <Rocket className="h-16 w-16 text-primary" />
                  </div>
                </div>
                <div>
                  <h2 className="text-3xl font-bold">Vamos começar!</h2>
                  <p className="text-muted-foreground mt-2">
                    Configure sua conta em apenas 2 passos simples
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4">
                <div className="flex items-start gap-4 p-4 rounded-lg border bg-card">
                  <div className="rounded-full bg-primary/10 p-2">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Crie sua Organização</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Configure sua empresa ou perfil pessoal
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-lg border bg-card">
                  <div className="rounded-full bg-primary/10 p-2">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Convide sua Equipe</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Adicione membros e gerencie permissões (você poderá fazer isso depois)
                    </p>
                  </div>
                </div>
              </div>

              <Alert>
                <AlertDescription>
                  💡 <strong>Dica:</strong> Você poderá personalizar tudo depois. Vamos apenas configurar o essencial agora.
                </AlertDescription>
              </Alert>

              <div className="flex justify-end">
                <Button onClick={handleNext} size="lg">
                  Começar
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Organization Setup */}
          {currentStep === 'organization' && (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Configure sua Organização</h2>
                <p className="text-muted-foreground">
                  Toda conta precisa estar vinculada a uma organização
                </p>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Nome da Organização *</Label>
                  <Input
                    id="org-name"
                    placeholder="Ex: Minha Empresa LTDA"
                    value={orgData.name}
                    onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Cadastro *</Label>
                  <RadioGroup
                    value={orgData.type}
                    onValueChange={(value: 'pf' | 'pj') => setOrgData({ ...orgData, type: value })}
                    disabled={isLoading}
                  >
                    <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent cursor-pointer">
                      <RadioGroupItem value="pj" id="pj" />
                      <Label htmlFor="pj" className="cursor-pointer flex-1">
                        <div className="font-semibold">Pessoa Jurídica (PJ)</div>
                        <div className="text-sm text-muted-foreground">Para empresas - CNPJ</div>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent cursor-pointer">
                      <RadioGroupItem value="pf" id="pf" />
                      <Label htmlFor="pf" className="cursor-pointer flex-1">
                        <div className="font-semibold">Pessoa Física (PF)</div>
                        <div className="text-sm text-muted-foreground">Para uso pessoal - CPF</div>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="document">
                    {orgData.type === 'pj' ? 'CNPJ' : 'CPF'} *
                  </Label>
                  <Input
                    id="document"
                    placeholder={orgData.type === 'pj' ? '00.000.000/0000-00' : '000.000.000-00'}
                    value={orgData.document}
                    onChange={(e) => {
                      const formatted = formatDocument(e.target.value, orgData.type)
                      setOrgData({ ...orgData, document: formatted })
                    }}
                    disabled={isLoading}
                    maxLength={orgData.type === 'pj' ? 18 : 14}
                  />
                  <p className="text-xs text-muted-foreground">
                    {orgData.type === 'pj' ? '14 dígitos' : '11 dígitos'} - será validado automaticamente
                  </p>
                </div>

                <Separator className="my-6" />

                {/* Horário de Funcionamento - Opcional */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        <Label className="text-base font-semibold">Horário de Funcionamento (Opcional)</Label>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Configure o horário de atendimento da sua empresa
                      </p>
                    </div>
                    <Switch
                      checked={orgData.businessHoursEnabled}
                      onCheckedChange={(checked) =>
                        setOrgData({ ...orgData, businessHoursEnabled: checked })
                      }
                      disabled={isLoading}
                    />
                  </div>

                  {orgData.businessHoursEnabled && (
                    <div className="space-y-4 pl-7 animate-in fade-in-50 duration-200">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="start-time">Horário de Início</Label>
                          <Input
                            id="start-time"
                            type="time"
                            value={orgData.businessHoursStart}
                            onChange={(e) =>
                              setOrgData({ ...orgData, businessHoursStart: e.target.value })
                            }
                            disabled={isLoading}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="end-time">Horário de Término</Label>
                          <Input
                            id="end-time"
                            type="time"
                            value={orgData.businessHoursEnd}
                            onChange={(e) =>
                              setOrgData({ ...orgData, businessHoursEnd: e.target.value })
                            }
                            disabled={isLoading}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Dias de Funcionamento</Label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: '1', label: 'Seg' },
                            { value: '2', label: 'Ter' },
                            { value: '3', label: 'Qua' },
                            { value: '4', label: 'Qui' },
                            { value: '5', label: 'Sex' },
                            { value: '6', label: 'Sáb' },
                            { value: '0', label: 'Dom' },
                          ].map((day) => {
                            const days = orgData.businessDays.split(',')
                            const isSelected = days.includes(day.value)
                            return (
                              <Button
                                key={day.value}
                                type="button"
                                variant={isSelected ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => {
                                  const currentDays = orgData.businessDays.split(',').filter(d => d)
                                  const newDays = isSelected
                                    ? currentDays.filter(d => d !== day.value)
                                    : [...currentDays, day.value].sort()
                                  setOrgData({ ...orgData, businessDays: newDays.join(',') })
                                }}
                                disabled={isLoading}
                              >
                                {day.label}
                              </Button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="timezone">Fuso Horário</Label>
                        <Select
                          value={orgData.timezone}
                          onValueChange={(value) => setOrgData({ ...orgData, timezone: value })}
                          disabled={isLoading}
                        >
                          <SelectTrigger id="timezone">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
                            <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
                            <SelectItem value="America/Rio_Branco">Rio Branco (GMT-5)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Alert>
                        <Bot className="h-4 w-4" />
                        <AlertDescription>
                          <strong>💡 Dica:</strong> Essas informações serão utilizadas pelo seu agente de IA quando ativado, para responder automaticamente fora do horário comercial.
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                </div>

                <Alert>
                  <AlertDescription>
                    📋 Os dados de identificação (nome e documento) não podem ser alterados depois.
                  </AlertDescription>
                </Alert>
              </div>

              <div className="flex justify-between gap-4">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={isLoading}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Organização
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Complete */}
          {currentStep === 'complete' && (
            <div className="space-y-6 py-8">
              <div className="text-center space-y-4">
                <div className="mx-auto w-fit">
                  <div className="rounded-full bg-green-500/10 p-6">
                    <CheckCircle2 className="h-16 w-16 text-green-500" />
                  </div>
                </div>
                <div>
                  <h2 className="text-3xl font-bold">Tudo pronto!</h2>
                  <p className="text-muted-foreground mt-2">
                    Sua conta foi configurada com sucesso
                  </p>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-6 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Organização criada</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Você foi definido como Master</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Redirecionando para o painel...</span>
                </div>
              </div>

              <Alert>
                <AlertDescription>
                  💡 <strong>Próximos passos:</strong> Crie sua primeira instância WhatsApp e convide membros para sua equipe!
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
