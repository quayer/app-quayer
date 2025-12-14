'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Plug,
  MessagesSquare,
  MessageSquare,
  Bot,
  CheckCircle2,
  XCircle,
  TrendingUp,
  BarChart3,
  PieChart,
} from 'lucide-react'
import { api } from '@/igniter.client'
import { useAuth } from '@/lib/auth/auth-provider'
import { motion } from 'framer-motion'
import CountUp from 'react-countup'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart as RechartsPieChart,
  Pie,
  Legend,
} from 'recharts'

export default function DashboardPage() {
  const { user } = useAuth()
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Fetch instances
  const { data: instancesData, isLoading: instancesLoading, error: instancesError } = api.instances.list.useQuery()

  // ✅ Fetch dashboard metrics (DADOS REAIS)
  const { data: metricsData, isLoading: metricsLoading, error: metricsError } = api.dashboard.getMetrics.useQuery()

  const isInitialLoading = !isHydrated || instancesLoading || metricsLoading

  const instances = useMemo(() => instancesData?.data ?? [], [instancesData])

  // Calculate instance statistics
  const stats = useMemo(() => ({
    instances: {
      total: instances.length,
      connected: instances.filter((i: any) => i.status === 'CONNECTED').length,
      disconnected: instances.filter((i: any) => i.status === 'DISCONNECTED').length,
    },
  }), [instances])

  // ✅ Real metrics from UAZapi
  const metrics = useMemo(() => {
    if (!metricsData?.data) {
      return {
        conversations: {
          total: 0,
          unread: 0,
          inProgress: 0,
          aiControlled: 0,
          humanControlled: 0,
          avgResponseTime: 0,
          resolutionRate: 0,
        },
        messages: {
          sent: 0,
          delivered: 0,
          deliveryRate: 0,
          read: 0,
          readRate: 0,
          failed: 0,
          failureRate: 0,
        },
        charts: {
          conversationsPerHour: [],
          messagesByStatus: [],
          aiVsHuman: [],
        }
      }
    }
    return metricsData.data
  }, [metricsData])

  // Chart data with proper fills
  const messagesByStatusChart = useMemo(() => {
    const fills = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))']
    return metrics.charts.messagesByStatus.map((item, index) => ({
      ...item,
      fill: fills[index] || 'hsl(var(--chart-1))'
    }))
  }, [metrics.charts.messagesByStatus])

  const aiVsHumanChart = useMemo(() => [
    { type: 'IA', value: metrics.conversations.aiControlled, fill: 'hsl(var(--chart-1))' },
    { type: 'Humano', value: metrics.conversations.humanControlled, fill: 'hsl(var(--chart-2))' },
  ], [metrics.conversations.aiControlled, metrics.conversations.humanControlled])

  const hasConnectedInstances = stats.instances.connected > 0

  if (instancesError || metricsError) {
    return (
      <div className="pt-6">
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar dados: {(instancesError as any)?.message || (metricsError as any)?.message || 'Erro desconhecido'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6" role="main" aria-label="Dashboard de métricas">
        {/* Header - consistente com design pattern */}
        <header className="space-y-4 mb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-muted-foreground mt-1 text-base sm:text-lg">
                  Bem-vindo(a), {user?.name}! Acompanhe métricas em tempo real.
                </p>
              </div>
            </div>
          </div>
        </header>

      {/* Alert when no instances connected */}
      {!isInitialLoading && !hasConnectedInstances && (
        <Alert>
          <AlertDescription>
            Nenhuma instância conectada. Conecte pelo menos uma instância para visualizar as métricas do dashboard.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Stats Cards */}
      <section aria-label="Estatísticas principais" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Integrations */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0 }}
        >
          <Card className="transition-all duration-300 hover:shadow-lg hover:scale-[1.02]" role="article" aria-label="Integrações ativas">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardDescription>Integrações Ativas</CardDescription>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Plug className="h-4 w-4 text-muted-foreground cursor-help" aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Número de instâncias WhatsApp conectadas e funcionais</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {isInitialLoading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                <>
                  <CardTitle className="text-4xl" aria-label={`${stats.instances.connected} integrações ativas de ${stats.instances.total} total`}>
                    <CountUp end={stats.instances.connected} duration={1} aria-hidden="true" />
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-2" aria-hidden="true">
                    de {stats.instances.total} total
                  </p>
                </>
              )}
            </CardHeader>
          </Card>
        </motion.div>

        {/* Active Conversations */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="transition-all duration-300 hover:shadow-lg hover:scale-[1.02]" role="article" aria-label="Conversas abertas">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardDescription>Conversas Abertas</CardDescription>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <MessagesSquare className="h-4 w-4 text-muted-foreground cursor-help" aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Conversas em andamento que aguardam resposta ou interação</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {isInitialLoading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                <>
                  <CardTitle className="text-4xl" aria-label={`${metrics.conversations.inProgress} conversas abertas de ${metrics.conversations.total} total`}>
                    <CountUp end={metrics.conversations.inProgress} duration={1} aria-hidden="true" />
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-2" aria-hidden="true">
                    de {metrics.conversations.total} total
                  </p>
                </>
              )}
            </CardHeader>
          </Card>
        </motion.div>

        {/* Messages Today */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card className="transition-all duration-300 hover:shadow-lg hover:scale-[1.02]" role="article" aria-label="Mensagens hoje">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardDescription>Mensagens Hoje</CardDescription>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <MessageSquare className="h-4 w-4 text-muted-foreground cursor-help" aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Total de mensagens enviadas nas últimas 24 horas</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {isInitialLoading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                <>
                  <CardTitle className="text-4xl" aria-label={`${metrics.messages.sent} mensagens enviadas hoje, ${metrics.messages.deliveryRate.toFixed(1)}% entregues`}>
                    <CountUp end={metrics.messages.sent} duration={1} separator="." aria-hidden="true" />
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-2" aria-hidden="true">
                    {metrics.messages.deliveryRate.toFixed(1)}% entregues
                  </p>
                </>
              )}
            </CardHeader>
          </Card>
        </motion.div>

        {/* AI Controlled */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card className="transition-all duration-300 hover:shadow-lg hover:scale-[1.02]" role="article" aria-label="Conversas controladas por IA">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardDescription>Controladas por IA</CardDescription>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Bot className="h-4 w-4 text-muted-foreground cursor-help" aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Conversas sendo gerenciadas automaticamente pela Inteligência Artificial</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {isInitialLoading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                <>
                  <CardTitle className="text-4xl" aria-label={`${metrics.conversations.aiControlled} conversas controladas por IA, ${metrics.conversations.total > 0 ? Math.round((metrics.conversations.aiControlled / metrics.conversations.total) * 100) : 0}% do total`}>
                    <CountUp end={metrics.conversations.aiControlled} duration={1} aria-hidden="true" />
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-2" aria-hidden="true">
                    {metrics.conversations.total > 0
                      ? Math.round((metrics.conversations.aiControlled / metrics.conversations.total) * 100)
                      : 0}% do total
                  </p>
                </>
              )}
            </CardHeader>
          </Card>
        </motion.div>
      </section>

      {/* Conversation Metrics */}
      <Card role="region" aria-label="Métricas de conversas">
        <CardHeader>
          <CardTitle>Métricas de Conversas</CardTitle>
          <CardDescription>Acompanhe o desempenho das suas conversas e campanhas</CardDescription>
        </CardHeader>
        <CardContent>
          {isInitialLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-2xl font-bold">{metrics.conversations.total}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Em Andamento</span>
                <span className="text-2xl font-bold">{metrics.conversations.inProgress}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">IA</span>
                <span className="text-2xl font-bold text-blue-500">{metrics.conversations.aiControlled}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Humano</span>
                <span className="text-2xl font-bold text-green-500">{metrics.conversations.humanControlled}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Tempo Médio</span>
                <span className="text-2xl font-bold">{metrics.conversations.avgResponseTime.toFixed(1)}min</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Taxa Resolução</span>
                <span className="text-2xl font-bold text-green-500">{metrics.conversations.resolutionRate.toFixed(0)}%</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Performance */}
      <Card role="region" aria-label="Performance de mensagens">
        <CardHeader>
          <CardTitle>Performance de Mensagens</CardTitle>
          <CardDescription>Disparos e entregas de mensagens</CardDescription>
        </CardHeader>
        <CardContent>
          {isInitialLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div className="flex items-center justify-between p-4 border rounded-lg" role="article" aria-label={`${metrics.messages.sent.toLocaleString()} mensagens enviadas`}>
                <div>
                  <p className="text-sm text-muted-foreground">Enviadas</p>
                  <p className="text-2xl font-bold" aria-hidden="true">{metrics.messages.sent.toLocaleString()}</p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <MessageSquare className="h-8 w-8 text-blue-500 cursor-help" aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Total de mensagens enviadas através da plataforma</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg" role="article" aria-label={`${metrics.messages.delivered.toLocaleString()} mensagens entregues, ${metrics.messages.deliveryRate.toFixed(1)}% de taxa de entrega`}>
                <div>
                  <p className="text-sm text-muted-foreground">Entregues</p>
                  <p className="text-2xl font-bold" aria-hidden="true">{metrics.messages.delivered.toLocaleString()}</p>
                  <p className="text-xs text-green-500" aria-hidden="true">{metrics.messages.deliveryRate.toFixed(1)}%</p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CheckCircle2 className="h-8 w-8 text-green-500 cursor-help" aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Mensagens confirmadas como entregues ao destinatário (1 check)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg" role="article" aria-label={`${metrics.messages.read.toLocaleString()} mensagens lidas, ${metrics.messages.readRate.toFixed(1)}% de taxa de leitura`}>
                <div>
                  <p className="text-sm text-muted-foreground">Lidas</p>
                  <p className="text-2xl font-bold" aria-hidden="true">{metrics.messages.read.toLocaleString()}</p>
                  <p className="text-xs text-blue-500" aria-hidden="true">{metrics.messages.readRate.toFixed(1)}%</p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CheckCircle2 className="h-8 w-8 text-blue-500 cursor-help" aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Mensagens confirmadas como lidas pelo destinatário (2 checks azuis)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg" role="article" aria-label={`${metrics.messages.failed.toLocaleString()} mensagens falhadas, ${metrics.messages.failureRate.toFixed(1)}% de taxa de falha`}>
                <div>
                  <p className="text-sm text-muted-foreground">Falhadas</p>
                  <p className="text-2xl font-bold" aria-hidden="true">{metrics.messages.failed.toLocaleString()}</p>
                  <p className="text-xs text-red-500" aria-hidden="true">{metrics.messages.failureRate.toFixed(1)}%</p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <XCircle className="h-8 w-8 text-red-500 cursor-help" aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Mensagens que falharam no envio ou entrega</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Area Chart - Conversations per Hour */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Conversas por Hora
            </CardTitle>
            <CardDescription>Últimas 24 horas</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                count: {
                  label: "Conversas",
                  color: "hsl(var(--chart-1))",
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.charts.conversationsPerHour}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="hour"
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--chart-1))"
                    fillOpacity={1}
                    fill="url(#colorCount)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Pie Chart - AI vs Human */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              IA vs Humano
            </CardTitle>
            <CardDescription>Distribuição de atendimentos</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                value: {
                  label: "Percentual",
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={aiVsHumanChart}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ type, value }) => `${type}: ${value}`}
                    outerRadius={100}
                    dataKey="value"
                  >
                    {aiVsHumanChart.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bar Chart - Messages by Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Mensagens por Status
          </CardTitle>
          <CardDescription>Distribuição de mensagens enviadas</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              count: {
                label: "Quantidade",
                color: "hsl(var(--chart-1))",
              },
            }}
            className="h-[300px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={messagesByStatusChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="status"
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {messagesByStatusChart.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      </div>
    </TooltipProvider>
  )
}
