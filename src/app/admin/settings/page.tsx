'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useHydration } from '@/client/hooks/useHydration'
import {
  Plug,
  Mail,
  Bot,
  MessageSquare,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Settings,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/client/components/ui/tabs'
import { Skeleton } from '@/client/components/ui/skeleton'
import { ScrollArea, ScrollBar } from '@/client/components/ui/scroll-area'
import { PageHeader } from '@/client/components/layout/page-layout'
import { Card, CardContent, CardHeader } from '@/client/components/ui/card'
import { SidebarTrigger } from '@/client/components/ui/sidebar'
import { Separator } from '@/client/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/client/components/ui/breadcrumb'

// Loading skeleton for tab content
function TabSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  )
}

// Lazy load — import direto do arquivo individual para code splitting real (um chunk por aba)
const ProvedoresSettings = dynamic(
  () => import('@/client/components/admin-settings/ProvedoresSettings').then((mod) => mod.ProvedoresSettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const EmailSettings = dynamic(
  () => import('@/client/components/admin-settings/EmailSettings').then((mod) => mod.EmailSettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const AISettings = dynamic(
  () => import('@/client/components/admin-settings/AISettings').then((mod) => mod.AISettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const ConcatenationSettings = dynamic(
  () => import('@/client/components/admin-settings/ConcatenationSettings').then((mod) => mod.ConcatenationSettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const AutenticacaoSettings = dynamic(
  () => import('@/client/components/admin-settings/AutenticacaoSettings').then((mod) => mod.AutenticacaoSettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const ApiKeysSettings = dynamic(
  () => import('@/client/components/admin-settings/ApiKeysSettings').then((mod) => mod.ApiKeysSettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const SecuritySettings = dynamic(
  () => import('@/client/components/admin-settings/SecuritySettings').then((mod) => mod.SecuritySettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const SystemInfo = dynamic(
  () => import('@/client/components/admin-settings/SystemInfo').then((mod) => mod.SystemInfo),
  { loading: () => <TabSkeleton />, ssr: false }
)

const TAB_TRIGGER_CLASS =
  'flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'

function AdminSettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab') || 'provedores'
  const [activeTab, setActiveTab] = useState(currentTab)
  const isHydrated = useHydration()

  useEffect(() => {
    setActiveTab(currentTab)
  }, [currentTab])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    router.push(`/admin/settings?tab=${value}`)
  }

  const breadcrumbHeader = (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin">Administração</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Configurações</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )

  if (!isHydrated) {
    return (
      <>
        {breadcrumbHeader}
        <div className="flex-1 space-y-4 p-8 pt-6" role="status" aria-busy="true" aria-label="Carregando configurações">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
          <span className="sr-only">Carregando configurações do sistema...</span>
        </div>
      </>
    )
  }

  return (
    <>
      {breadcrumbHeader}
      <div className="flex-1 space-y-4 p-8 pt-6">
        <PageHeader
          title="Configurações do Sistema"
          description="Gerencie as configurações globais da plataforma Quayer"
          actions={
            <Button variant="outline" onClick={() => router.refresh()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          }
        />

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="space-y-6"
          aria-label="Configurações do sistema"
        >
          <ScrollArea className="w-full whitespace-nowrap pb-2">
            <TabsList
              className="inline-flex h-12 p-1.5 gap-1 bg-muted/60 rounded-lg"
              aria-label="Abas de configuração"
            >
              <TabsTrigger value="provedores" className={TAB_TRIGGER_CLASS} aria-label="Provedores UAZapi e Webhook">
                <Plug className="h-4 w-4" aria-hidden="true" />
                <span>Provedores</span>
              </TabsTrigger>
              <TabsTrigger value="email" className={TAB_TRIGGER_CLASS} aria-label="Configurações de Email e SMTP">
                <Mail className="h-4 w-4" aria-hidden="true" />
                <span>Email</span>
              </TabsTrigger>
              <TabsTrigger value="ai" className={TAB_TRIGGER_CLASS} aria-label="Configurações de Inteligência Artificial">
                <Bot className="h-4 w-4" aria-hidden="true" />
                <span>IA</span>
              </TabsTrigger>
              <TabsTrigger value="concatenation" className={TAB_TRIGGER_CLASS} aria-label="Configurações de Concatenação de Mensagens">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                <span>Concatenação</span>
              </TabsTrigger>
              <TabsTrigger value="autenticacao" className={TAB_TRIGGER_CLASS} aria-label="OAuth e Segurança de Autenticação">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>Autenticação</span>
              </TabsTrigger>
              <TabsTrigger value="api-keys" className={TAB_TRIGGER_CLASS} aria-label="Gerenciamento de API Keys">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <span>API Keys</span>
              </TabsTrigger>
              <TabsTrigger value="security" className={TAB_TRIGGER_CLASS} aria-label="Políticas de Segurança do Sistema">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                <span>Segurança</span>
              </TabsTrigger>
              <TabsTrigger value="system" className={TAB_TRIGGER_CLASS} aria-label="Informações do Sistema">
                <Settings className="h-4 w-4" aria-hidden="true" />
                <span>Sistema</span>
              </TabsTrigger>
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <TabsContent value="provedores" className="space-y-6">
            <ProvedoresSettings />
          </TabsContent>

          <TabsContent value="email" className="space-y-6">
            <EmailSettings />
          </TabsContent>

          <TabsContent value="ai" className="space-y-6">
            <AISettings />
          </TabsContent>

          <TabsContent value="concatenation" className="space-y-6">
            <ConcatenationSettings />
          </TabsContent>

          <TabsContent value="autenticacao" className="space-y-6">
            <AutenticacaoSettings />
          </TabsContent>

          <TabsContent value="api-keys" className="space-y-6">
            <ApiKeysSettings />
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <SecuritySettings />
          </TabsContent>

          <TabsContent value="system" className="space-y-6">
            <SystemInfo />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

export default function AdminSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 space-y-4 p-8 pt-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <AdminSettingsContent />
    </Suspense>
  )
}
