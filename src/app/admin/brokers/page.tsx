'use client'

import { useState } from 'react'
import { RotateCw, Server, Activity, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'

// Real data - empty array until broker monitoring API is implemented
interface Broker {
  id: string;
  name: string;
  host: string;
  status: string;
  queues: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  memory: number;
  maxMemory: number;
  uptime: number;
}

export default function AdminBrokersPage() {
  const [brokers] = useState<Broker[]>([])
  const [isLoading] = useState(false)

  // Calculate global statistics
  const globalStats = {
    totalBrokers: brokers.length,
    connectedBrokers: brokers.filter(b => b.status === 'connected').length,
    totalQueues: brokers.reduce((sum, b) => sum + b.queues, 0),
    totalActiveJobs: brokers.reduce((sum, b) => sum + b.activeJobs, 0),
    totalCompleted: brokers.reduce((sum, b) => sum + b.completedJobs, 0),
    totalFailed: brokers.reduce((sum, b) => sum + b.failedJobs, 0),
  }

  const formatUptime = (ms: number) => {
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.floor((ms % 3600000) / 60000)
    return `${hours}h ${minutes}m`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'default'
      case 'disconnected':
        return 'destructive'
      case 'error':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  return (
    <div className="flex flex-col gap-6 pt-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gerenciar Brokers</h1>
          <p className="text-muted-foreground mt-1">
            Monitore e gerencie os brokers de mensageria (Redis/BullMQ)
          </p>
        </div>
        <Button>
          <RotateCw className="h-4 w-4 mr-2" />
          Atualizar Status
        </Button>
      </div>

      {/* Global Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              Brokers
            </CardDescription>
            <CardTitle className="text-3xl">{globalStats.totalBrokers}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {globalStats.connectedBrokers} conectados
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Filas</CardDescription>
            <CardTitle className="text-3xl">{globalStats.totalQueues}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Total ativas
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Jobs Ativos
            </CardDescription>
            <CardTitle className="text-3xl">{globalStats.totalActiveJobs}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Completados
            </CardDescription>
            <CardTitle className="text-3xl">{globalStats.totalCompleted.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Falhados
            </CardDescription>
            <CardTitle className="text-3xl">{globalStats.totalFailed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Taxa de Sucesso</CardDescription>
            <CardTitle className="text-3xl">
              {((globalStats.totalCompleted / (globalStats.totalCompleted + globalStats.totalFailed)) * 100).toFixed(1)}%
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Brokers List */}
      {brokers.map((broker) => (
        <Card key={broker.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  {broker.name}
                  <Badge variant={getStatusColor(broker.status)}>
                    {broker.status === 'connected' ? 'Conectado' : 'Desconectado'}
                  </Badge>
                </CardTitle>
                <CardDescription className="mt-1">
                  {broker.host} • Uptime: {formatUptime(broker.uptime)}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  Ver Filas
                </Button>
                <Button variant="outline" size="sm">
                  Configurar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Memory Usage */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Uso de Memória</span>
                <span className="text-sm text-muted-foreground">
                  {broker.memory.toFixed(1)} MB / {broker.maxMemory} MB
                </span>
              </div>
              <Progress value={(broker.memory / broker.maxMemory) * 100} className="h-2" />
            </div>

            {/* Jobs Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Filas Ativas</p>
                <p className="text-2xl font-bold">{broker.queues}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Jobs em Execução</p>
                <p className="text-2xl font-bold text-blue-500">{broker.activeJobs}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Completados</p>
                <p className="text-2xl font-bold text-green-500">{broker.completedJobs.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Falhados</p>
                <p className="text-2xl font-bold text-red-500">{broker.failedJobs}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Info Alert */}
      <Alert>
        <AlertDescription>
          <strong>Nota:</strong> Os brokers são responsáveis por processar jobs em segundo plano,
          como envio de mensagens, processamento de webhooks e tarefas agendadas.
          Mantenha os brokers monitorados para garantir a performance do sistema.
        </AlertDescription>
      </Alert>
    </div>
  )
}
