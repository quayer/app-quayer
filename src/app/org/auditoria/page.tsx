'use client'

import { useState, useMemo, Fragment } from 'react'
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
  ChevronDown,
  ChevronUp,
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
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLogUser {
  id: string
  name: string
  email: string
}

interface AuditLogOrganization {
  id: string
  name: string
}

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
  user: AuditLogUser
  organization: AuditLogOrganization | null
}

interface AuditListResponse {
  data: AuditLog[]
  pagination?: { total: number; page: number; limit: number }
}

interface AuditStats {
  total: number
  byAction: Array<{ action: string; count: number }>
  byResource: Array<{ resource: string; count: number }>
  topUsers: Array<{ user: AuditLogUser; count: number }>
}

interface StringListResponse {
  data: string[]
}

type ActionVariant = 'default' | 'secondary' | 'destructive' | 'outline'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function getActionVariant(action: string): ActionVariant {
  if (action.startsWith('delete') || action.startsWith('remove')) return 'destructive'
  if (action.startsWith('create') || action.startsWith('add')) return 'default'
  if (action.startsWith('update') || action.startsWith('edit')) return 'secondary'
  return 'outline'
}

function toIsoStart(date: string): string | undefined {
  if (!date) return undefined
  return new Date(`${date}T00:00:00`).toISOString()
}

function toIsoEnd(date: string): string | undefined {
  if (!date) return undefined
  return new Date(`${date}T23:59:59.999`).toISOString()
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrgAuditoriaPage() {
  const [actionFilter, setActionFilter] = useState<string>('')
  const [resourceFilter, setResourceFilter] = useState<string>('')
  const [userFilter, setUserFilter] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const limit = 25

  const baseQuery = useMemo(
    () =>
      cleanQuery({
        action: actionFilter && actionFilter !== 'all' ? actionFilter : undefined,
        resource: resourceFilter && resourceFilter !== 'all' ? resourceFilter : undefined,
        userId: userFilter || undefined,
        startDate: toIsoStart(startDate),
        endDate: toIsoEnd(endDate),
      }),
    [actionFilter, resourceFilter, userFilter, startDate, endDate]
  )

  // Paginated table data (org-scoped)
  const { data: tableData, isLoading: isTableLoading } = api.audit.listForOrg.useQuery({
    query: cleanQuery({ page, limit, ...baseQuery }),
  })

  // Full export dataset (capped, org-scoped)
  const {
    data: exportData,
    isLoading: isExportLoading,
    refetch,
  } = api.audit.listForOrg.useQuery({
    query: cleanQuery({ page: 1, limit: 1000, ...baseQuery }),
  })

  const { data: statsData } = api.audit.statsForOrg.useQuery({ query: { days: 7 } })
  const { data: actionsData } = api.audit.actionsForOrg.useQuery()
  const { data: resourcesData } = api.audit.resourcesForOrg.useQuery()

  const tableLogs: AuditLog[] = (tableData as AuditListResponse | undefined)?.data ?? []
  const exportLogs: AuditLog[] = (exportData as AuditListResponse | undefined)?.data ?? []
  const total: number = (tableData as AuditListResponse | undefined)?.pagination?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const stats = (statsData as AuditStats | undefined) ?? null
  const actions: string[] = (actionsData as StringListResponse | undefined)?.data ?? []
  const resources: string[] = (resourcesData as StringListResponse | undefined)?.data ?? []

  // -------- Exports --------
  function triggerDownload(url: string, filename: string) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(exportLogs, null, 2)], { type: 'application/json' })
    triggerDownload(URL.createObjectURL(blob), `audit-log-${new Date().toISOString().split('T')[0]}.json`)
  }

  const handleExportCSV = () => {
    if (exportLogs.length === 0) return

    const headers = [
      'ID',
      'Data/Hora',
      'Usuario',
      'Email',
      'Acao',
      'Recurso',
      'Resource ID',
      'Organizacao',
      'IP',
      'Metadata',
    ]
    const rows = exportLogs.map((log) => [
      log.id,
      new Date(log.createdAt).toISOString(),
      log.user?.name ?? '',
      log.user?.email ?? '',
      log.action,
      log.resource,
      log.resourceId ?? '',
      log.organization?.name ?? '',
      log.ipAddress ?? '',
      log.metadata ? JSON.stringify(log.metadata) : '',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    triggerDownload(URL.createObjectURL(blob), `audit-log-${new Date().toISOString().split('T')[0]}.csv`)
  }

  const hasFilter =
    (actionFilter && actionFilter !== 'all') ||
    (resourceFilter && resourceFilter !== 'all') ||
    userFilter ||
    startDate ||
    endDate

  const resetFilters = () => {
    setActionFilter('')
    setResourceFilter('')
    setUserFilter('')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/org">Organizacao</BreadcrumbLink>
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
              Auditoria
            </h1>
            <p className="text-muted-foreground">
              Registro de acoes realizadas na organizacao para compliance e seguranca
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
                {stats?.total?.toLocaleString() ?? '0'}
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
                {stats?.byAction?.[0]?.action ?? '-'}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats?.byAction?.[0]?.count ?? 0} ocorrencias
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
                {stats?.byResource?.[0]?.resource ?? '-'}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats?.byResource?.[0]?.count ?? 0} ocorrencias
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
                {stats?.topUsers?.[0]?.user?.name ?? '-'}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats?.topUsers?.[0]?.count ?? 0} acoes
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Acao</Label>
                <Select
                  value={actionFilter}
                  onValueChange={(v) => {
                    setActionFilter(v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as acoes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as acoes</SelectItem>
                    {actions.map((action) => (
                      <SelectItem key={action} value={action} className="capitalize">
                        {action.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Recurso</Label>
                <Select
                  value={resourceFilter}
                  onValueChange={(v) => {
                    setResourceFilter(v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os recursos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os recursos</SelectItem>
                    {resources.map((resource) => (
                      <SelectItem key={resource} value={resource} className="capitalize">
                        {resource}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="user-filter" className="text-xs">
                  Usuario (ID)
                </Label>
                <Input
                  id="user-filter"
                  placeholder="UUID do usuario"
                  value={userFilter}
                  onChange={(e) => {
                    setUserFilter(e.target.value.trim())
                    setPage(1)
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="start-date" className="text-xs">
                  De
                </Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    setPage(1)
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="end-date" className="text-xs">
                  Ate
                </Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value)
                    setPage(1)
                  }}
                />
              </div>
            </div>

            {hasFilter ? (
              <div className="mt-4">
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Limpar filtros
                </Button>
              </div>
            ) : null}
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
                        <TableHead className="w-8" />
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Usuario</TableHead>
                        <TableHead>Acao</TableHead>
                        <TableHead>Recurso</TableHead>
                        <TableHead>IP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableLogs.map((log) => {
                        const isExpanded = expandedRow === log.id
                        const hasDetails =
                          !!log.metadata && Object.keys(log.metadata).length > 0
                        return (
                          <Fragment key={log.id}>
                            <TableRow
                              className="cursor-pointer"
                              onClick={() =>
                                setExpandedRow(isExpanded ? null : log.id)
                              }
                            >
                              <TableCell>
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-sm">
                                {formatDate(log.createdAt)}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm font-medium">
                                  {log.user?.name || '-'}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {log.user?.email || ''}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={getActionVariant(log.action)}>
                                  {log.action.replace(/_/g, ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm capitalize">
                                {log.resource}
                                {log.resourceId && (
                                  <span className="block text-xs text-muted-foreground font-mono truncate max-w-[160px]">
                                    {log.resourceId}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground font-mono">
                                {log.ipAddress ?? '-'}
                              </TableCell>
                            </TableRow>
                            {isExpanded ? (
                              <TableRow key={`${log.id}-details`}>
                                <TableCell colSpan={6} className="bg-muted/30">
                                  <div className="space-y-2 py-2 text-xs">
                                    {log.organization?.name && (
                                      <div>
                                        <span className="font-semibold">Organizacao:</span>{' '}
                                        {log.organization.name}
                                      </div>
                                    )}
                                    <div>
                                      <span className="font-semibold">Log ID:</span>{' '}
                                      <code className="font-mono">{log.id}</code>
                                    </div>
                                    {hasDetails ? (
                                      <div>
                                        <span className="font-semibold">Metadata:</span>
                                        <pre className="mt-1 max-h-48 overflow-auto rounded bg-background p-2 font-mono text-xs">
                                          {JSON.stringify(log.metadata, null, 2)}
                                        </pre>
                                      </div>
                                    ) : (
                                      <div className="text-muted-foreground">
                                        Sem metadados adicionais.
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

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
              {exportLogs.length} registros disponiveis para exportacao
              {hasFilter ? ' (com filtros aplicados)' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleExportJSON}
                disabled={isExportLoading || exportLogs.length === 0}
                variant="outline"
                className="gap-2"
              >
                <FileJson className="h-4 w-4" />
                Exportar JSON
              </Button>
              <Button
                onClick={handleExportCSV}
                disabled={isExportLoading || exportLogs.length === 0}
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
                Para analise detalhada, acesse via API{' '}
                <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
                  /api/v1/audit/logs
                </code>
                . TODO: endpoint de export server-side sem cap de 1000 registros.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
