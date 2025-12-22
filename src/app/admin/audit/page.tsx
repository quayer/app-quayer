'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  FileText,
  Search,
  RefreshCcw,
  User,
  Building2,
  Clock,
  Filter,
  ArrowUpDown,
  Eye,
  Shield,
  Activity,
  LogIn,
  LogOut,
  Edit,
  Trash2,
  Plus,
  Link2,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/igniter.client'
import { PageContainer } from '@/components/layout/page-layout'

// Action icon mapping
const actionIcons: Record<string, any> = {
  create: Plus,
  update: Edit,
  delete: Trash2,
  login: LogIn,
  logout: LogOut,
  passkey_login: Shield,
  register: Plus,
  connect: Link2,
  disconnect: Link2,
  view: Eye,
  context_switch: ArrowUpDown,
  permission_denied: AlertCircle,
  api_error: AlertCircle,
  webhook_received: Activity,
  webhook_error: AlertCircle,
}

// Action badge colors
const actionColors: Record<string, string> = {
  create: 'bg-green-500/15 text-green-600 border-green-200',
  update: 'bg-blue-500/15 text-blue-600 border-blue-200',
  delete: 'bg-red-500/15 text-red-600 border-red-200',
  login: 'bg-emerald-500/15 text-emerald-600 border-emerald-200',
  logout: 'bg-gray-500/15 text-gray-600 border-gray-200',
  passkey_login: 'bg-purple-500/15 text-purple-600 border-purple-200',
  context_switch: 'bg-amber-500/15 text-amber-600 border-amber-200',
  permission_denied: 'bg-red-500/15 text-red-600 border-red-200',
  api_error: 'bg-red-500/15 text-red-600 border-red-200',
  view: 'bg-sky-500/15 text-sky-600 border-sky-200',
}

interface AuditLog {
  id: string
  action: string
  resource: string
  resourceId: string | null
  userId: string
  organizationId: string | null
  metadata: any
  ipAddress: string | null
  createdAt: string | Date
  user: {
    id: string
    name: string
    email: string
  }
  organization: {
    id: string
    name: string
  } | null
}

export default function AuditPage() {
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState<string>('')
  const [resourceFilter, setResourceFilter] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  // Fetch audit logs
  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', page, actionFilter, resourceFilter],
    queryFn: async () => {
      const queryParams = {
        page,
        limit: 20,
        ...(actionFilter && actionFilter !== 'all' && { action: actionFilter }),
        ...(resourceFilter && resourceFilter !== 'all' && { resource: resourceFilter }),
      }
      const response = await (api.audit.list.query as any)({ query: queryParams })
      if (response.error) throw new Error('Failed to fetch audit logs')
      return response.data
    },
  })

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: async () => {
      const response = await (api.audit.stats.query as any)({ query: { days: 7 } })
      if (response.error) throw new Error('Failed to fetch stats')
      return response.data
    },
  })

  // Fetch filter options
  const { data: actionsData } = useQuery({
    queryKey: ['audit-actions'],
    queryFn: async () => {
      const response = await api.audit.actions.query()
      if (response.error) throw new Error('Failed to fetch actions')
      return response.data
    },
  })

  const { data: resourcesData } = useQuery({
    queryKey: ['audit-resources'],
    queryFn: async () => {
      const response = await api.audit.resources.query()
      if (response.error) throw new Error('Failed to fetch resources')
      return response.data
    },
  })

  const logs = logsData?.data || []
  const pagination = logsData?.pagination
  const stats = statsData
  const actions = actionsData?.data || []
  const resources = resourcesData?.data || []

  // Filter logs by search term
  const filteredLogs = logs.filter((log: AuditLog) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      log.user?.name?.toLowerCase().includes(term) ||
      log.user?.email?.toLowerCase().includes(term) ||
      log.action?.toLowerCase().includes(term) ||
      log.resource?.toLowerCase().includes(term) ||
      log.organization?.name?.toLowerCase().includes(term)
    )
  })

  const ActionIcon = ({ action }: { action: string }) => {
    const Icon = actionIcons[action] || Activity
    return <Icon className="h-4 w-4" />
  }

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Audit Log
          </h1>
          <p className="text-muted-foreground">
            Registro de todas as acoes administrativas para compliance e seguranca
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCcw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total (7 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.total?.toLocaleString() || '0'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Top Acao
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">
              {stats?.byAction?.[0]?.action || '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.byAction?.[0]?.count || 0} ocorrencias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Top Recurso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">
              {stats?.byResource?.[0]?.resource || '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.byResource?.[0]?.count || 0} ocorrencias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Usuario Mais Ativo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">
              {stats?.topUsers?.[0]?.user?.name || '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.topUsers?.[0]?.count || 0} acoes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por usuario, email ou organizacao..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Todas as acoes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as acoes</SelectItem>
                {actions.map((action: string) => (
                  <SelectItem key={action} value={action} className="capitalize">
                    {action.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Todos os recursos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os recursos</SelectItem>
                {resources.map((resource: string) => (
                  <SelectItem key={resource} value={resource} className="capitalize">
                    {resource}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registros de Auditoria</CardTitle>
          <CardDescription>
            {pagination?.total || 0} registros encontrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-4 opacity-20" />
              <p>Nenhum registro de auditoria encontrado</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Acao</TableHead>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Organizacao</TableHead>
                    <TableHead className="text-right">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log: AuditLog) => (
                    <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium text-sm">{log.user?.name || 'Sistema'}</div>
                            <div className="text-xs text-muted-foreground">{log.user?.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`gap-1 ${actionColors[log.action] || 'bg-gray-500/15'}`}
                        >
                          <ActionIcon action={log.action} />
                          <span className="capitalize">{log.action.replace('_', ' ')}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {log.resource}
                        </Badge>
                        {log.resourceId && (
                          <span className="text-xs text-muted-foreground ml-1">
                            #{log.resourceId.slice(0, 8)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.organization ? (
                          <div className="flex items-center gap-1.5 text-sm">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            {log.organization.name}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Pagina {pagination.page} de {pagination.totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(pagination.page ?? 1) <= 1}
                      onClick={() => setPage(p => p - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(pagination.page ?? 1) >= pagination.totalPages}
                      onClick={() => setPage(p => p + 1)}
                    >
                      Proximo
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Detalhes do Registro
            </DialogTitle>
            <DialogDescription>
              ID: {selectedLog?.id}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Data/Hora</label>
                  <p className="text-sm">
                    {format(new Date(selectedLog.createdAt), "dd 'de' MMMM 'de' yyyy 'as' HH:mm:ss", { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">IP</label>
                  <p className="text-sm font-mono">{selectedLog.ipAddress || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Usuario</label>
                  <p className="text-sm">{selectedLog.user?.name} ({selectedLog.user?.email})</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Organizacao</label>
                  <p className="text-sm">{selectedLog.organization?.name || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Acao</label>
                  <Badge
                    variant="outline"
                    className={`gap-1 mt-1 ${actionColors[selectedLog.action] || 'bg-gray-500/15'}`}
                  >
                    <ActionIcon action={selectedLog.action} />
                    <span className="capitalize">{selectedLog.action.replace('_', ' ')}</span>
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Recurso</label>
                  <p className="text-sm capitalize">{selectedLog.resource}</p>
                  {selectedLog.resourceId && (
                    <p className="text-xs text-muted-foreground font-mono">{selectedLog.resourceId}</p>
                  )}
                </div>
              </div>

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Metadata</label>
                  <pre className="mt-1 p-3 rounded-lg bg-muted text-xs overflow-auto max-h-48">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
