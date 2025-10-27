'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/auth-provider'
import { api } from '@/igniter.client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Plug, MessageSquare, Clock, CheckCircle2 } from 'lucide-react'
import { ActivityTimeline } from '@/components/ui/activity-timeline'
import { Badge } from '@/components/ui/badge'

export default function UserDashboardPage() {
  const { user } = useAuth()
  const [isMounted, setIsMounted] = useState(false)

  // Fetch user's instances
  const { data: instancesData, isLoading, error } = api.instances.list.useQuery()

  const instances = instancesData?.data || []

  // Calculate stats
  const stats = {
    total: instances.length,
    connected: instances.filter((i: any) => i.status === 'connected').length,
    disconnected: instances.filter((i: any) => i.status === 'disconnected').length,
  }

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Real activity events - empty for now until audit log system is implemented
  const activityEvents: any[] = []

  if (error) {
    return (
      <div className="flex-1 space-y-4 p-4 pt-6">
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar dashboard: {(error as any)?.message || 'Erro desconhecido'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Meu Dashboard</h2>
        <p className="text-muted-foreground">
          Bem-vindo, {user?.name}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Minhas Integrações</CardDescription>
              <Plug className="h-4 w-4 text-muted-foreground" />
            </div>
            {!isMounted || isLoading ? (
              <Skeleton className="h-10 w-20" />
            ) : (
              <>
                <CardTitle className="text-4xl">{stats.total}</CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Total de integrações
                </p>
              </>
            )}
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Conectadas</CardDescription>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            {!isMounted || isLoading ? (
              <Skeleton className="h-10 w-20" />
            ) : (
              <>
                <CardTitle className="text-4xl text-green-600">{stats.connected}</CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Ativas agora
                </p>
              </>
            )}
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Desconectadas</CardDescription>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </div>
            {!isMounted || isLoading ? (
              <Skeleton className="h-10 w-20" />
            ) : (
              <>
                <CardTitle className="text-4xl">{stats.disconnected}</CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Necessitam atenção
                </p>
              </>
            )}
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Instances */}
        <Card>
          <CardHeader>
            <CardTitle>Minhas Integrações</CardTitle>
            <CardDescription>
              Visualize suas integrações ativas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isMounted || isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : instances.length === 0 ? (
              <div className="text-center py-8">
                <Plug className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Você ainda não possui integrações
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {instances.slice(0, 5).map((instance: any) => (
                  <div
                    key={instance.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div>
                      <p className="font-medium">{instance.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {instance.phoneNumber || 'Sem telefone'}
                      </p>
                    </div>
                    <Badge
                      variant={instance.status === 'connected' ? 'default' : 'secondary'}
                    >
                      {instance.status === 'connected' ? 'Conectada' : 'Desconectada'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Timeline */}
        <ActivityTimeline
          title="Atividade Recente"
          description="Últimas atualizações das suas integrações"
          events={activityEvents}
        />
      </div>
    </div>
  )
}
