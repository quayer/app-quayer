'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Building2, Users, Plug, Webhook, MessageSquare, Settings, ChevronRight } from 'lucide-react'
import { Skeleton } from '@/client/components/ui/skeleton'
import { SidebarTrigger } from '@/client/components/ui/sidebar'
import { Separator } from '@/client/components/ui/separator'
import Link from 'next/link'
import { getDashboardStatsAction } from './actions'
import { toast } from 'sonner'

interface DashboardStats {
  totalOrganizations: number
  totalUsers: number
  totalInstances: number
  totalWebhooks: number
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      setIsLoading(true)

      // ✅ CORREÇÃO BRUTAL: Usar Server Action
      const result = await getDashboardStatsAction()

      if (result.success && result.data) {
        setStats(result.data)
      } else {
        toast.error('Erro ao carregar estatísticas do painel')
        setStats({
          totalOrganizations: 0,
          totalUsers: 0,
          totalInstances: 0,
          totalWebhooks: 0,
        })
      }
    } catch {
      toast.error('Erro ao carregar estatísticas do painel')
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
      <>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 text-sm">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <a href="/admin" className="text-muted-foreground hover:text-foreground transition-colors">Administração</a>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-foreground font-normal">Dashboard</span>
        </header>
        <div className="flex-1 space-y-4 p-8 pt-6">
          <div className="flex items-center justify-between space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 text-sm">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <a href="/admin" className="text-muted-foreground hover:text-foreground transition-colors">Administração</a>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-foreground font-normal">Dashboard</span>
      </header>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Organizações
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalOrganizations ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              Total de organizações cadastradas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Usuários
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              Total de usuários ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Instâncias
            </CardTitle>
            <Plug className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalInstances ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              Instâncias WhatsApp ativas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Webhooks
            </CardTitle>
            <Webhook className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalWebhooks ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              Webhooks configurados
            </p>
          </CardContent>
        </Card>
      </div>

        <div className="grid gap-4 md:grid-cols-3 mt-6">
          <Link href="/admin/organizations">
            <Card className="hover:bg-accent transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Nova Organização</CardTitle>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/admin/sessions">
            <Card className="hover:bg-accent transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Ver Sessões Ativas</CardTitle>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/admin/settings">
            <Card className="hover:bg-accent transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3">
                <Settings className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Configurações</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        </div>

      </div>
    </>
  )
}
