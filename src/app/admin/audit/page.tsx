'use client'

import { useState } from 'react'
import {
  Shield,
  RefreshCcw,
  Filter,
  Download,
  FileJson,
  FileText,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/components/ui/table'
import { Badge } from '@/client/components/ui/badge'
import { api } from '@/igniter.client'
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

interface AuditLog {
  id: string
  action: string
  resource: string
  resourceId: string | null
  userId: string
  organizationId: string | null
  metadata: Record<string, unknown> | null
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

function cleanQuery<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== '')
  ) as Partial<T>
}

function formatDate(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getActionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action.startsWith('delete') || action.startsWith('remove')) return 'destructive'
  if (action.startsWith('create') || action.startsWith('add')) return 'default'
  if (action.startsWith('update') || action.startsWith('edit')) return 'secondary'
  return 'outline'
}

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState<string>('')
  const [resourceFilter, setResourceFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const limit = 25

  // Fetch paginated audit logs for table display
  const { data: tableData, isLoading: isTableLoading } = api.audit.list.useQuery({
    query: cleanQuery({
      page,
      limit,
      action: actionFilter && actionFilter !== 'all' ? actionFilter : undefined,
      resource: resourceFilter && resourceFilter !== 'all' ? resourceFilter : undefined,
    }),
  })

  // Fetch audit logs for export (all matching)
  const { data: logsData, isLoading, refetch } = api.audit.list.useQuery({
    query: cleanQuery({
      page: 1,
      limit: 1000,
      action: actionFilter && actionFilter !== 'all' ? actionFilter : undefined,
      resource: resourceFilter && resourceFilter !== 'all' ? resourceFilter : undefined,
    }),
  })

  // Fetch stats
  const { data: statsData } = api.audit.stats.useQuery({
    query: { days: 7 },
  })

  // Fetch filter options
  const { data: actionsData } = api.audit.actions.useQuery()
  const { data: resourcesData } = api.audit.resources.useQuery()

  const logs: AuditLog[] = (logsData as any)?.data || []
  const tableLogs: AuditLog[] = (tableData as any)?.data || []
  const total: number = (tableData as any)?.pagination?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const stats = statsData as any
  const actions: string[] = (actionsData as any)?.data || []
  const resources: string[] = (resourcesData as any)?.data || []

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCSV = () => {
    if (logs.length === 0) return

    const headers = ['ID', 'Data/Hora', 'Usuario', 'Email', 'Acao', 'Recurso', 'Resource ID', 'Organizacao', 'IP', 'Metadata']
    const rows = logs.map((log: AuditLog) => [
      log.id,
      new Date(log.createdAt).toISOString(),
      log.user?.name || '',
      log.user?.email || '',
      log.action,
      log.resource,
      log.resourceId || '',
      log.organization?.name || '',
      log.ipAddress || '',
      log.metadata ? JSON.stringify(log.metadata) : '',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
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
              <BreadcrumbPage>Auditoria</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className="flex-1 space-y-4 p-8 pt-6">
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
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1) }}>
              <SelectTrigger className="w-full md:w-[200px]">
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
            <Select value={resourceFilter} onValueChange={(v) => { setResourceFilter(v); setPage(1) }}>
              <SelectTrigger className="w-full md:w-[200px]">
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

      {/* Audit Logs Table */}
      <Card className="mb-6">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Registros de Auditoria</CardTitle>
          <CardDescription>
            {total} registro{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isTableLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Carregando...
            </div>
          ) : tableLogs.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Nenhum registro encontrado
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Acao</TableHead>
                      <TableHead>Recurso</TableHead>
                      <TableHead>Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{log.user?.name || '-'}</div>
                          <div className="text-xs text-muted-foreground">{log.user?.email || ''}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getActionVariant(log.action)}>
                            {log.action.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm capitalize">
                          {log.resource}
                          {log.resourceId && (
                            <span className="block text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                              {log.resourceId}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.organization?.name && (
                            <span className="block text-xs text-muted-foreground">
                              Org: {log.organization.name}
                            </span>
                          )}
                          {log.ipAddress && (
                            <span className="block text-xs text-muted-foreground">
                              IP: {log.ipAddress}
                            </span>
                          )}
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <span className="block text-xs text-muted-foreground truncate max-w-[200px]">
                              {JSON.stringify(log.metadata)}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Pagina {page} de {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Proximo
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" />
            Exportar Dados
          </CardTitle>
          <CardDescription>
            {logs.length} registros disponiveis para exportacao
            {(actionFilter && actionFilter !== 'all') || (resourceFilter && resourceFilter !== 'all')
              ? ' (com filtros aplicados)'
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleExportJSON}
              disabled={isLoading || logs.length === 0}
              variant="outline"
              className="gap-2"
            >
              <FileJson className="h-4 w-4" />
              Exportar JSON
            </Button>
            <Button
              onClick={handleExportCSV}
              disabled={isLoading || logs.length === 0}
              variant="outline"
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Para analise detalhada, use Claude Code ou acesse via API{' '}
              <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
                /api/v1/audit/logs
              </code>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
    </>
  )
}
