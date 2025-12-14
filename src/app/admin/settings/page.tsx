'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useHydration } from '@/hooks/useHydration'
import {
  Server,
  Webhook,
  Mail,
  Bot,
  MessageSquare,
  KeyRound,
  Shield,
  Settings,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { PageContainer, PageHeader } from '@/components/layout/page-layout'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

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

// Lazy load heavy components - code splitting per tab
const UAZapiSettings = dynamic(
  () => import('@/components/admin-settings').then((mod) => mod.UAZapiSettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const WebhookSettings = dynamic(
  () => import('@/components/admin-settings').then((mod) => mod.WebhookSettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const EmailSettings = dynamic(
  () => import('@/components/admin-settings').then((mod) => mod.EmailSettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const AISettings = dynamic(
  () => import('@/components/admin-settings').then((mod) => mod.AISettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const ConcatenationSettings = dynamic(
  () => import('@/components/admin-settings').then((mod) => mod.ConcatenationSettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const OAuthSettings = dynamic(
  () => import('@/components/admin-settings').then((mod) => mod.OAuthSettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const SecuritySettings = dynamic(
  () => import('@/components/admin-settings').then((mod) => mod.SecuritySettings),
  { loading: () => <TabSkeleton />, ssr: false }
)

const SystemInfo = dynamic(
  () => import('@/components/admin-settings').then((mod) => mod.SystemInfo),
  { loading: () => <TabSkeleton />, ssr: false }
)

function AdminSettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab') || 'uazapi'
  const [activeTab, setActiveTab] = useState(currentTab)
  const isHydrated = useHydration()

  useEffect(() => {
    setActiveTab(currentTab)
  }, [currentTab])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    router.push(`/admin/settings?tab=${value}`)
  }

  if (!isHydrated) {
    return (
      <PageContainer maxWidth="full">
        <div className="space-y-6" role="status" aria-busy="true" aria-label="Carregando configurações">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
          <span className="sr-only">Carregando configurações do sistema...</span>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer maxWidth="full">
      <PageHeader
        title="Configurações do Sistema"
        description="Gerencie as configurações globais da plataforma Quayer"
        actions={
          <Button variant="outline" onClick={() => window.location.reload()}>
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
            <TabsTrigger
              value="uazapi"
              className="flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Configurações da API UAZapi"
            >
              <Server className="h-4 w-4" aria-hidden="true" />
              <span>UAZapi</span>
            </TabsTrigger>
            <TabsTrigger
              value="webhook"
              className="flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Configurações de Webhooks"
            >
              <Webhook className="h-4 w-4" aria-hidden="true" />
              <span>Webhook</span>
            </TabsTrigger>
            <TabsTrigger
              value="email"
              className="flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Configurações de Email e SMTP"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              <span>Email</span>
            </TabsTrigger>
            <TabsTrigger
              value="ai"
              className="flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Configurações de Inteligência Artificial"
            >
              <Bot className="h-4 w-4" aria-hidden="true" />
              <span>IA</span>
            </TabsTrigger>
            <TabsTrigger
              value="concatenation"
              className="flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Configurações de Concatenação de Mensagens"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span>Concatenação</span>
            </TabsTrigger>
            <TabsTrigger
              value="oauth"
              className="flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Configurações de OAuth e Autenticação"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span>OAuth</span>
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Configurações de Segurança e API Keys"
            >
              <Shield className="h-4 w-4" aria-hidden="true" />
              <span>Segurança</span>
            </TabsTrigger>
            <TabsTrigger
              value="system"
              className="flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Informações do Sistema"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span>Sistema</span>
            </TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="uazapi" className="space-y-6">
          <UAZapiSettings />
        </TabsContent>

        <TabsContent value="webhook" className="space-y-6">
          <WebhookSettings />
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

        <TabsContent value="oauth" className="space-y-6">
          <OAuthSettings />
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <SecuritySettings />
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <SystemInfo />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

export default function AdminSettingsPage() {
  return (
    <Suspense
      fallback={
        <PageContainer maxWidth="full">
          <div className="space-y-6">
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-96 w-full" />
          </div>
        </PageContainer>
      }
    >
      <AdminSettingsContent />
    </Suspense>
  )
}
