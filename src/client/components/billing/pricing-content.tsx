'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft,
  Check,
  X,
  Zap,
  Crown,
  MessageSquare,
  Users,
  HardDrive,
  Bot,
  Webhook,
  KeyRound,
  Shield,
  Headphones,
  Plug,
  Users2,
} from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/client/components/ui/card'
import { Badge } from '@/client/components/ui/badge'
import { Switch } from '@/client/components/ui/switch'
import { Separator } from '@/client/components/ui/separator'
import { Skeleton } from '@/client/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils/format-currency'
import { api } from '@/igniter.client'

interface PlanData {
  id: string
  name: string
  slug: string
  description: string | null
  priceMonthly: number
  priceYearly: number | null
  maxUsers: number
  maxInstances: number
  maxMessages: number
  maxContacts: number
  maxStorage: number
  maxAiCredits: number
  hasWebhooks: boolean
  hasApi: boolean
  hasCustomRoles: boolean
  hasSso: boolean
  hasAiAgents: boolean
  hasPrioritySupport: boolean
  isFree: boolean
}

function formatStorage(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`
  return `${mb} MB`
}

function getFeatureComparison(plans: PlanData[]) {
  const free = plans.find((p) => p.isFree) || plans[0]
  const pro = plans.find((p) => !p.isFree) || plans[1]

  if (!free || !pro) return []

  return [
    { label: 'Usuarios', icon: Users, free: String(free.maxUsers), pro: String(pro.maxUsers) },
    { label: 'Instancias WhatsApp', icon: Plug, free: String(free.maxInstances), pro: String(pro.maxInstances) },
    { label: 'Mensagens/mes', icon: MessageSquare, free: free.maxMessages.toLocaleString('pt-BR'), pro: pro.maxMessages.toLocaleString('pt-BR') },
    { label: 'Contatos', icon: Users2, free: free.maxContacts.toLocaleString('pt-BR'), pro: pro.maxContacts.toLocaleString('pt-BR') },
    { label: 'Armazenamento', icon: HardDrive, free: formatStorage(free.maxStorage), pro: formatStorage(pro.maxStorage) },
    { label: 'Creditos IA/mes', icon: Bot, free: String(free.maxAiCredits), pro: String(pro.maxAiCredits) },
    { label: 'Webhooks', icon: Webhook, free: free.hasWebhooks, pro: pro.hasWebhooks },
    { label: 'Acesso API', icon: KeyRound, free: free.hasApi, pro: pro.hasApi },
    { label: 'Roles personalizados', icon: Shield, free: free.hasCustomRoles, pro: pro.hasCustomRoles },
    { label: 'Agentes IA', icon: Bot, free: free.hasAiAgents, pro: pro.hasAiAgents },
    { label: 'Suporte prioritario', icon: Headphones, free: free.hasPrioritySupport, pro: pro.hasPrioritySupport },
  ]
}

// Fallback plans used when API is unavailable (e.g. during build)
const FALLBACK_PLANS: PlanData[] = [
  {
    id: 'fallback-free',
    name: 'Free',
    slug: 'free',
    description: 'Para quem esta comecando e quer testar a plataforma.',
    priceMonthly: 0,
    priceYearly: 0,
    maxUsers: 1,
    maxInstances: 1,
    maxMessages: 500,
    maxContacts: 100,
    maxStorage: 256,
    maxAiCredits: 0,
    hasWebhooks: false,
    hasApi: false,
    hasCustomRoles: false,
    hasSso: false,
    hasAiAgents: false,
    hasPrioritySupport: false,
    isFree: true,
  },
  {
    id: 'fallback-pro',
    name: 'Pro',
    slug: 'pro',
    description: 'Para equipes que precisam escalar o atendimento.',
    priceMonthly: 19700,
    priceYearly: 197000,
    maxUsers: 10,
    maxInstances: 5,
    maxMessages: 25000,
    maxContacts: 10000,
    maxStorage: 10240,
    maxAiCredits: 500,
    hasWebhooks: true,
    hasApi: true,
    hasCustomRoles: true,
    hasSso: false,
    hasAiAgents: true,
    hasPrioritySupport: true,
    isFree: false,
  },
]

export function PricingContent() {
  const [isYearly, setIsYearly] = useState(false)
  const [plans, setPlans] = useState<PlanData[]>(FALLBACK_PLANS)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadPlans()
  }, [])

  const loadPlans = async () => {
    try {
      setIsLoading(true)
      const result = await api.plans.list.query()
      const plansData = (result as any)?.data?.plans ?? (result as any)?.plans
      if (plansData && plansData.length > 0) {
        setPlans(plansData)
      }
    } catch {
      // Keep fallback plans on error
    } finally {
      setIsLoading(false)
    }
  }

  const freePlan = plans.find((p) => p.isFree) || plans[0]
  const proPlan = plans.find((p) => !p.isFree) || plans[1]
  const featureComparison = getFeatureComparison(plans)

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2" aria-label="Ir para pagina inicial">
            <Image src="/logo.svg" alt="Quayer" width={100} height={24} />
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login" className="gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Entrar
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="container mx-auto max-w-5xl py-12 px-4">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">Planos e Precos</Badge>
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            Escolha o plano ideal para sua equipe
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Comece gratuitamente e escale conforme sua operacao cresce. Sem surpresas, sem taxas ocultas.
          </p>
        </div>

        {/* Toggle */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <span className={`text-sm font-medium ${!isYearly ? 'text-foreground' : 'text-muted-foreground'}`}>
            Mensal
          </span>
          <Switch checked={isYearly} onCheckedChange={setIsYearly} />
          <span className={`text-sm font-medium ${isYearly ? 'text-foreground' : 'text-muted-foreground'}`}>
            Anual
          </span>
          {isYearly && (
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10">
              2 meses gratis
            </Badge>
          )}
        </div>

        {/* Plan Cards */}
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-4">
                  <Skeleton className="h-6 w-24 mb-2" />
                  <Skeleton className="h-4 w-64 mb-4" />
                  <Skeleton className="h-10 w-32" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                      <Skeleton key={j} className="h-4 w-full" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            {/* Free */}
            {freePlan && (
              <Card className="relative">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 rounded-lg bg-muted">
                      <Zap className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-xl">{freePlan.name}</CardTitle>
                  </div>
                  <CardDescription>{freePlan.description || 'Para quem esta comecando e quer testar a plataforma.'}</CardDescription>
                  <div className="pt-4">
                    <span className="text-4xl font-bold">R$ 0</span>
                    <span className="text-muted-foreground ml-1">/mes</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/signup">Comecar gratis</Link>
                  </Button>
                  <Separator />
                  <ul className="space-y-3">
                    <FeatureItem included>{freePlan.maxUsers} usuario{freePlan.maxUsers > 1 ? 's' : ''}</FeatureItem>
                    <FeatureItem included>{freePlan.maxInstances} instancia{freePlan.maxInstances > 1 ? 's' : ''}</FeatureItem>
                    <FeatureItem included>{freePlan.maxMessages.toLocaleString('pt-BR')} msgs/mes</FeatureItem>
                    <FeatureItem included>{freePlan.maxContacts.toLocaleString('pt-BR')} contatos</FeatureItem>
                    <FeatureItem included>{formatStorage(freePlan.maxStorage)} armazenamento</FeatureItem>
                    <FeatureItem included={freePlan.maxAiCredits > 0}>
                      {freePlan.maxAiCredits > 0 ? `${freePlan.maxAiCredits} creditos IA` : 'Creditos IA'}
                    </FeatureItem>
                    <FeatureItem included={freePlan.hasWebhooks}>Webhooks</FeatureItem>
                    <FeatureItem included={freePlan.hasApi}>Acesso API</FeatureItem>
                    <FeatureItem included={freePlan.hasCustomRoles}>Roles personalizados</FeatureItem>
                    <FeatureItem included={freePlan.hasSso}>SSO</FeatureItem>
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Pro */}
            {proPlan && (
              <Card className="relative border-primary shadow-lg">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">Mais popular</Badge>
                </div>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Crown className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{proPlan.name}</CardTitle>
                  </div>
                  <CardDescription>{proPlan.description || 'Para equipes que precisam escalar o atendimento.'}</CardDescription>
                  <div className="pt-4">
                    <span className="text-4xl font-bold">
                      {isYearly
                        ? formatCurrency(proPlan.priceYearly || proPlan.priceMonthly * 10)
                        : formatCurrency(proPlan.priceMonthly)}
                    </span>
                    <span className="text-muted-foreground ml-1">
                      {isYearly ? '/ano' : '/mes'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button className="w-full" asChild>
                    <Link href={`/signup?plan=${proPlan.slug}`}>Assinar {proPlan.name}</Link>
                  </Button>
                  <Separator />
                  <ul className="space-y-3">
                    <FeatureItem included>{proPlan.maxUsers} usuarios</FeatureItem>
                    <FeatureItem included>{proPlan.maxInstances} instancias</FeatureItem>
                    <FeatureItem included>{proPlan.maxMessages.toLocaleString('pt-BR')} msgs/mes</FeatureItem>
                    <FeatureItem included>{proPlan.maxContacts.toLocaleString('pt-BR')} contatos</FeatureItem>
                    <FeatureItem included>{formatStorage(proPlan.maxStorage)} armazenamento</FeatureItem>
                    <FeatureItem included>{proPlan.maxAiCredits} creditos IA/mes</FeatureItem>
                    <FeatureItem included={proPlan.hasWebhooks}>Webhooks</FeatureItem>
                    <FeatureItem included={proPlan.hasApi}>Acesso API</FeatureItem>
                    <FeatureItem included={proPlan.hasCustomRoles}>Roles personalizados</FeatureItem>
                    <FeatureItem included={proPlan.hasAiAgents}>Agentes IA</FeatureItem>
                    <FeatureItem included={proPlan.hasPrioritySupport}>Suporte prioritario</FeatureItem>
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Feature Comparison Table */}
        {featureComparison.length > 0 && (
          <div className="mb-16">
            <h2 className="text-2xl font-bold tracking-tight text-center mb-8">
              Comparacao detalhada
            </h2>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                          Recurso
                        </th>
                        <th className="text-center py-4 px-6 text-sm font-medium">
                          {freePlan?.name || 'Free'}
                        </th>
                        <th className="text-center py-4 px-6 text-sm font-medium text-primary">
                          {proPlan?.name || 'Pro'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {featureComparison.map((feature) => (
                        <tr key={feature.label} className="border-b last:border-0">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2 text-sm">
                              <feature.icon className="h-4 w-4 text-muted-foreground" />
                              {feature.label}
                            </div>
                          </td>
                          <td className="text-center py-4 px-6">
                            <ComparisonValue value={feature.free} />
                          </td>
                          <td className="text-center py-4 px-6">
                            <ComparisonValue value={feature.pro} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight mb-4">
            Pronto para comecar?
          </h2>
          <p className="text-muted-foreground mb-6">
            Crie sua conta gratuita em menos de 2 minutos. Sem cartao de credito.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="lg" asChild>
              <Link href="/signup">Comecar gratis</Link>
            </Button>
            <Button size="lg" asChild>
              <Link href={`/signup?plan=${proPlan?.slug || 'pro'}`}>Assinar {proPlan?.name || 'Pro'}</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}

function FeatureItem({ included, children }: { included: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {included ? (
        <Check className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground/50 shrink-0" />
      )}
      <span className={included ? '' : 'text-muted-foreground/50'}>{children}</span>
    </li>
  )
}

function ComparisonValue({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="h-4 w-4 text-emerald-500 mx-auto" />
    ) : (
      <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
    )
  }
  return <span className="text-sm font-medium">{value}</span>
}
