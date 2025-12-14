'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, Plug, Webhook, Activity, Clock, ArrowRight, CheckCircle2, XCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { PageContainer, PageHeader } from '@/components/layout/page-layout'
import { getDashboardStatsAction, getRecentActivityAction, getRecentOrganizationsAction } from './actions'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface DashboardStats {
  totalOrganizations: number
  totalUsers: number
  totalInstances: number
  totalWebhooks: number
}

interface RecentActivity {
  id: string
  action: string
  resource: string
  resourceId: string | null
  userName: string
  createdAt: Date
  message: string
}

interface RecentOrganization {
  id: string
  name: string
  isActive: boolean
  createdAt: Date
  lastActivity: Date
  usersCount: number
  connectionsCount: number
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [recentOrgs, setRecentOrgs] = useState<RecentOrganization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [systemStatus, setSystemStatus] = useState<'online' | 'offline' | 'checking'>('checking')

  // Hydration fix
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Health check do sistema
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-store'
        })
        setSystemStatus(response.ok ? 'online' : 'offline')
      } catch {
        setSystemStatus('offline')
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 30000) // Check a cada 30s
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    try {
      setIsLoading(true)

      // Carregar tudo em paralelo
      const [statsResult, activityResult, orgsResult] = await Promise.all([
        getDashboardStatsAction(),
        getRecentActivityAction(5),
        getRecentOrganizationsAction(5),
      ])

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data)
      } else {
        console.error('Erro ao carregar estatisticas:', statsResult.error)
        setStats({
          totalOrganizations: 0,
          totalUsers: 0,
          totalInstances: 0,
          totalWebhooks: 0,
        })
      }

      if (activityResult.success && activityResult.data) {
        setRecentActivity(activityResult.data)
      }

      if (orgsResult.success && orgsResult.data) {
        setRecentOrgs(orgsResult.data)
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
      setStats({
        totalOrganizations: 0,
        totalUsers: 0,
        totalInstances: 0,
        totalWebhooks: 0,
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <PageContainer maxWidth="full">
        {/* Header skeleton */}
        <div className="space-y-4 mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="space-y-2">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-5 w-80" />
            </div>
          </div>
        </div>

        {/* Stats skeleton */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-16 mb-2" />
                <Skeleton className="h-3 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Activity skeleton */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
          <Card className="col-span-full lg:col-span-4">
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-60" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-4 border-b pb-3">
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="col-span-full lg:col-span-3">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between border-b pb-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer maxWidth="full">
      <PageHeader
        title="Dashboard Administrativo"
        description="Visão geral e métricas do sistema em tempo real."
        actions={
          <div className="flex items-center gap-2">
            {systemStatus === 'checking' ? (
              <Badge variant="outline" className="gap-1.5">
                <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                Verificando...
              </Badge>
            ) : systemStatus === 'online' ? (
              <Badge variant="outline" className="gap-1.5 bg-green-500/10 text-green-600 border-green-200">
                <CheckCircle2 className="h-3 w-3" />
                Sistema Online
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1.5">
                <XCircle className="h-3 w-3" />
                Sistema Offline
              </Badge>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Link href="/admin/organizations" className="group">
          <Card className="card-hover gradient-border stat-icon-bg overflow-hidden cursor-pointer transition-all group-hover:shadow-lg group-hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium">Organizações</CardTitle>
              <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-4xl font-bold gradient-text number-counter">
                    {stats?.totalOrganizations || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total de organizações cadastradas
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/permissions" className="group">
          <Card className="card-hover gradient-border stat-icon-bg overflow-hidden cursor-pointer transition-all group-hover:shadow-lg group-hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium">Usuários</CardTitle>
              <div className="p-2 rounded-lg bg-chart-2/10 group-hover:bg-chart-2/20 transition-colors">
                <Users className="h-4 w-4 text-chart-2" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-4xl font-bold gradient-text number-counter">
                    {stats?.totalUsers || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total de usuários ativos
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/integracoes" className="group">
          <Card className="card-hover gradient-border stat-icon-bg overflow-hidden cursor-pointer transition-all group-hover:shadow-lg group-hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium">Instâncias</CardTitle>
              <div className="p-2 rounded-lg bg-green-500/10 group-hover:bg-green-500/20 transition-colors">
                <Plug className="h-4 w-4 text-green-500" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-4xl font-bold gradient-text number-counter">
                    {stats?.totalInstances || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Instâncias WhatsApp ativas
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/webhooks" className="group">
          <Card className="card-hover gradient-border stat-icon-bg overflow-hidden cursor-pointer transition-all group-hover:shadow-lg group-hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium">Webhooks</CardTitle>
              <div className="p-2 rounded-lg bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
                <Webhook className="h-4 w-4 text-purple-500" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-4xl font-bold gradient-text number-counter">
                    {stats?.totalWebhooks || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Webhooks configurados
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
        <Card className="col-span-full lg:col-span-4 min-h-[320px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Atividade Recente
            </CardTitle>
            <CardDescription>
              Últimas ações realizadas no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma atividade recente para exibir
              </p>
            ) : (
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-4 border-b pb-3 last:border-0">
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {activity.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        por {activity.userName}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                      {isMounted ? formatDistanceToNow(new Date(activity.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      }) : '...'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-full lg:col-span-3 min-h-[320px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organizações com Atividade
            </CardTitle>
            <CardDescription>
              Organizações ordenadas por última atividade
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentOrgs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma organização recente
              </p>
            ) : (
              <div className="space-y-4">
                {recentOrgs.map((org) => (
                  <div key={org.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${org.isActive ? 'bg-green-500' : 'bg-red-500'
                          }`}
                        title={org.isActive ? 'Ativa' : 'Inativa'}
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {org.name}
                        </p>
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          <span>{org.usersCount} usuários</span>
                          <span>•</span>
                          <span>{org.connectionsCount} conexões</span>
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0" suppressHydrationWarning>
                      <Clock className="h-3 w-3 mr-1" />
                      {isMounted ? formatDistanceToNow(new Date(org.lastActivity), {
                        addSuffix: true,
                        locale: ptBR,
                      }) : '...'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
