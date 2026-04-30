'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  Plus, Search, MoreVertical, Plug, Building2, ChevronLeft, ChevronRight,
  RefreshCw, Trash2, CloudOff, Cloud, Wifi, WifiOff, AlertTriangle,
  Download, Signal, ArrowUpRight,
} from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Card, CardContent, CardHeader } from '@/client/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/client/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/client/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/client/components/ui/alert-dialog'
import { Badge } from '@/client/components/ui/badge'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Alert, AlertDescription } from '@/client/components/ui/alert'
import { SidebarTrigger } from '@/client/components/ui/sidebar'
import { Separator } from '@/client/components/ui/separator'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/client/components/ui/breadcrumb'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/client/components/ui/tooltip'
import { ConnectionModal } from '@/client/components/whatsapp/connection-modal'
import { CreateInstanceModal } from '@/client/components/whatsapp/create-instance-modal'
import { EditInstanceModal } from '@/client/components/whatsapp/edit-instance-modal'
import { DetailsModal } from '@/client/components/whatsapp/details-modal'
import {
  listAllInstancesAdminAction,
  discoverUazapiInstancesAction,
  importUazapiInstanceAction,
  deleteInstanceAdminAction,
  syncUazapiStatusAction,
  listAllOrgNamesAction,
  changeInstanceOrgAction,
  type AdminInstance,
  type UazapiDiscoveryInstance,
} from '../actions'
import type { ModalInstance } from '@/types/instance'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

// ─── Constants ──────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  WHATSAPP_WEB: 'UAZapi',
  WHATSAPP_CLOUD_API: 'Cloud API',
  WHATSAPP_BUSINESS_API: 'Business',
  INSTAGRAM_META: 'Instagram',
  TELEGRAM_BOT: 'Telegram',
  EMAIL_SMTP: 'Email',
}

const PAGE_SIZE = 50

function getBrokerLabel(provider: string | undefined | null): string {
  if (!provider) return 'UAZapi'
  return PROVIDER_LABELS[provider] ?? provider
}

// ─── Status Indicator (dot + text) ──────────────────────────────────────────

function StatusIndicator({ status }: { status: string }) {
  const isConnected = status === 'connected' || status === 'open'
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`h-2 w-2 rounded-full ${
          isConnected
            ? 'bg-emerald-500 animate-pulse-dot'
            : 'bg-red-400'
        }`}
      />
      <span className={`text-sm font-medium ${
        isConnected ? 'text-emerald-400' : 'text-red-400'
      }`}>
        {isConnected ? 'Online' : 'Offline'}
      </span>
    </span>
  )
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  stagger,
  loading,
}: {
  label: string
  value: number | string
  icon: React.ElementType
  accent: 'default' | 'emerald' | 'amber' | 'red' | 'blue'
  stagger: number
  loading?: boolean
}) {
  const accentStyles = {
    default: 'border-border/50 bg-card',
    emerald: 'border-emerald-500/20 bg-emerald-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
    red: 'border-red-500/20 bg-red-500/5',
    blue: 'border-blue-500/20 bg-blue-500/5',
  }

  const iconStyles = {
    default: 'text-muted-foreground bg-muted/50',
    emerald: 'text-emerald-400 bg-emerald-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    red: 'text-red-400 bg-red-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
  }

  const valueStyles = {
    default: 'text-foreground',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
  }

  return (
    <div
      className={`animate-fade-in-up stagger-${stagger} rounded-xl border p-4 transition-all duration-200 hover:shadow-md hover:scale-[1.02] ${accentStyles[accent]}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
          {label}
        </p>
        <div className={`rounded-lg p-1.5 ${iconStyles[accent]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-2">
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className={`text-3xl font-black tracking-tight font-mono ${valueStyles[accent]}`}>
            {value}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Unified Type ───────────────────────────────────────────────────────────

type UnifiedInstance = {
  name: string
  phoneNumber: string | null
  status: string
  inDb: true
  id: string
  brokerType: string
  createdAt: string
  organization: { id: string; name: string } | null
} | {
  name: string
  phoneNumber: string | null
  status: string
  inDb: false
  token: string
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function IntegracoesAdminPage() {
  // DB instances
  const [instances, setInstances] = useState<AdminInstance[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 })
  const [stats, setStats] = useState({ total: 0, connected: 0, disconnected: 0, noOrg: 0 })

  // UAZapi orphans (auto-loaded)
  const [orphans, setOrphans] = useState<UazapiDiscoveryInstance[]>([])
  const [uazapiTotal, setUazapiTotal] = useState(0)
  const [isLoadingUazapi, setIsLoadingUazapi] = useState(true)

  // Sync state
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  // Orgs for import selector
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([])
  // selectedOrgs removed — org assignment moved to DetailsModal
  const [importingTokens, setImportingTokens] = useState<Set<string>>(new Set())

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState<AdminInstance | null>(null)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<AdminInstance | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'connected' | 'disconnected'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'imported' | 'uazapi-only'>('all')

  // Auto-sync ref (run once)
  const syncedRef = useRef(false)

  // Instance lookup map (eliminates O(n) per row)
  const instanceMap = useMemo(() => {
    const map = new Map<string, AdminInstance>()
    for (const i of instances) map.set(i.id, i)
    return map
  }, [instances])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Load DB instances
  const loadInstances = useCallback(async (page = 1) => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const result = await listAllInstancesAdminAction({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: statusFilter,
      })
      if (result.success) {
        setInstances(result.data)
        setPagination(result.pagination)
        setStats(result.stats)
      } else {
        setLoadError(result.error || 'Erro ao carregar integracoes')
      }
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setIsLoading(false)
    }
  }, [debouncedSearch, statusFilter])

  // Load UAZapi discovery + orgs (once on mount)
  const loadUazapi = useCallback(async () => {
    setIsLoadingUazapi(true)
    try {
      const [discovery, orgResult] = await Promise.all([
        discoverUazapiInstancesAction(),
        listAllOrgNamesAction(),
      ])
      if (discovery.success) {
        setOrphans(discovery.data.instances.filter((i) => !i.existsInDb))
        setUazapiTotal(discovery.data.stats.totalUazapi)
      }
      if (orgResult.success) {
        setOrgs(orgResult.data)
      }
    } catch {
      // Silent — UAZapi offline nao bloqueia a pagina
    } finally {
      setIsLoadingUazapi(false)
    }
  }, [])

  // Auto-sync status on mount (background, once)
  useEffect(() => {
    if (syncedRef.current) return
    syncedRef.current = true
    setIsSyncing(true)
    syncUazapiStatusAction()
      .then((r) => {
        setLastSyncTime(new Date())
        if (r.success && r.updated > 0) {
          loadInstances(1)
        }
      })
      .catch(() => {})
      .finally(() => setIsSyncing(false))
  }, [loadInstances])

  useEffect(() => { loadInstances(1) }, [loadInstances])
  useEffect(() => { loadUazapi() }, [loadUazapi])

  // ---- Manual re-sync ----
  const handleManualSync = async () => {
    setIsSyncing(true)
    try {
      const r = await syncUazapiStatusAction()
      setLastSyncTime(new Date())
      if (r.success) {
        toast.success(`Sync completo${r.updated > 0 ? ` — ${r.updated} atualizado(s)` : ''}`)
        if (r.updated > 0) loadInstances(pagination.page)
      }
    } catch {
      toast.error('Erro ao sincronizar')
    } finally {
      setIsSyncing(false)
    }
  }

  // ---- Import ----
  const handleImport = async (inst: UazapiDiscoveryInstance) => {
    setImportingTokens((prev) => new Set(prev).add(inst.token))
    try {
      const result = await importUazapiInstanceAction({
        name: inst.name,
        token: inst.token,
        phoneNumber: inst.phoneNumber || undefined,
      })
      if (result.success) {
        toast.success(`"${inst.name}" importada com sucesso`)
        setOrphans((prev) => prev.filter((o) => o.token !== inst.token))
        loadInstances(pagination.page)
      } else {
        toast.error(result.error || 'Erro ao importar')
      }
    } catch {
      toast.error('Erro ao importar instancia')
    } finally {
      setImportingTokens((prev) => {
        const next = new Set(prev)
        next.delete(inst.token)
        return next
      })
    }
  }

  // ---- Delete ----
  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const result = await deleteInstanceAdminAction(deleteTarget.id)
      if (result.success) {
        toast.success(`"${deleteTarget.name}" removida`)
        loadInstances(pagination.page)
        loadUazapi()
      } else {
        toast.error(result.error || 'Erro ao remover')
      }
    } catch {
      toast.error('Erro ao remover instancia')
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }

  // ---- Change org ----
  const handleChangeOrg = async (instanceId: string, orgId: string) => {
    const result = await changeInstanceOrgAction(instanceId, orgId)
    if (result.success) {
      loadInstances(pagination.page)
    } else {
      throw new Error(result.error || 'Erro ao alterar organizacao')
    }
  }

  // ---- Modal handlers ----
  const handleConnect = (instance: AdminInstance) => { setSelectedInstance(instance); setIsConnectModalOpen(true) }
  const handleEditFromModal = (instance: ModalInstance) => { setSelectedInstance(instance as AdminInstance); setIsEditModalOpen(true) }
  const handleEdit = (instance: AdminInstance) => { setSelectedInstance(instance); setIsEditModalOpen(true) }
  const handleDetails = (instance: AdminInstance) => { setSelectedInstance(instance); setIsDetailModalOpen(true) }
  const handlePageChange = (newPage: number) => loadInstances(newPage)

  // ---- Build unified list ----
  const dbRows: UnifiedInstance[] = instances.map((i) => ({
    inDb: true as const,
    id: i.id,
    name: i.name,
    phoneNumber: i.phoneNumber,
    status: i.status,
    brokerType: i.brokerType,
    createdAt: i.createdAt,
    organization: i.organization,
  }))

  const orphanRows: UnifiedInstance[] = orphans
    .filter((o) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        if (!o.name.toLowerCase().includes(q) && !(o.phoneNumber || '').toLowerCase().includes(q)) return false
      }
      if (statusFilter === 'connected' && o.status !== 'open' && o.status !== 'connected') return false
      if (statusFilter === 'disconnected' && (o.status === 'open' || o.status === 'connected')) return false
      return true
    })
    .map((o) => ({
      inDb: false as const,
      name: o.name,
      phoneNumber: o.phoneNumber,
      status: o.status,
      token: o.token,
    }))

  let unifiedRows: UnifiedInstance[]
  if (sourceFilter === 'imported') {
    unifiedRows = dbRows
  } else if (sourceFilter === 'uazapi-only') {
    unifiedRows = orphanRows
  } else {
    unifiedRows = [...dbRows, ...orphanRows]
  }

  if (loadError) {
    return (
      <div className="pt-6 px-8">
        <Alert variant="destructive">
          <AlertDescription>Erro ao carregar integracoes: {loadError}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <TooltipProvider>
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/admin">Admin</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Integracoes</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Sync indicator — right side of header */}
        <div className="ml-auto flex items-center gap-3">
          {isSyncing && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-fade-in">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Sincronizando...
            </span>
          )}
          {lastSyncTime && !isSyncing && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleManualSync}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
                  Sync {formatDistanceToNow(lastSyncTime, { locale: ptBR, addSuffix: true })}
                </button>
              </TooltipTrigger>
              <TooltipContent>Clique para re-sincronizar</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-6 p-6 md:p-8 overflow-x-hidden">
        {/* ─── Page Title ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-fade-in-up rounded-xl border border-border/30 bg-gradient-to-r from-muted/40 via-transparent to-muted/20 p-5">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="rounded-lg bg-primary/10 p-1.5">
                <Plug className="h-4 w-4 text-primary" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight">
                Integracoes
              </h1>
            </div>
            <p className="text-xs text-muted-foreground ml-[38px]">
              Visao unificada — UAZapi + banco local, sempre sincronizado
            </p>
          </div>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            size="sm"
            className="shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nova Integracao
          </Button>
        </div>

        {/* ─── Stats Grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard
            label="Total UAZapi"
            value={isLoadingUazapi ? '...' : uazapiTotal}
            icon={Signal}
            accent="blue"
            stagger={1}
            loading={isLoadingUazapi}
          />
          <StatCard
            label="Importadas"
            value={stats.total}
            icon={Download}
            accent="default"
            stagger={2}
            loading={isLoading}
          />
          <StatCard
            label="Conectadas"
            value={stats.connected}
            icon={Wifi}
            accent="emerald"
            stagger={3}
            loading={isLoading}
          />
          <StatCard
            label="Somente UAZapi"
            value={isLoadingUazapi ? '...' : orphans.length}
            icon={CloudOff}
            accent="amber"
            stagger={4}
            loading={isLoadingUazapi}
          />
          <StatCard
            label="Sem organizacao"
            value={stats.noOrg}
            icon={AlertTriangle}
            accent="red"
            stagger={5}
            loading={isLoading}
          />
        </div>

        {/* ─── Filters + Table ───────────────────────────────────────── */}
        <Card className="animate-fade-in-up stagger-3 border-border/40 shadow-sm">
          <CardHeader className="pb-4">
            {/* Row count */}
            {!isLoading && !isLoadingUazapi && unifiedRows.length > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0">
                  {unifiedRows.length} resultado{unifiedRows.length !== 1 ? 's' : ''}
                </Badge>
                {(searchTerm || statusFilter !== 'all' || sourceFilter !== 'all') && (
                  <button
                    onClick={() => { setSearchTerm(''); setStatusFilter('all'); setSourceFilter('all') }}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Buscar por nome, telefone ou organizacao..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-muted/30 border-transparent focus:border-border focus:bg-background transition-colors"
                />
              </div>

              {/* Filter pills */}
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                  <SelectTrigger className="w-[150px] bg-muted/30 border-transparent">
                    <Wifi className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos status</SelectItem>
                    <SelectItem value="connected">Conectadas</SelectItem>
                    <SelectItem value="disconnected">Desconectadas</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}>
                  <SelectTrigger className="w-[150px] bg-muted/30 border-transparent">
                    <Cloud className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas fontes</SelectItem>
                    <SelectItem value="imported">Importadas</SelectItem>
                    <SelectItem value="uazapi-only">Somente UAZapi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {(isLoading || isLoadingUazapi) ? (
              <div className="space-y-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-3">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-8 w-8 ml-auto rounded-md" />
                  </div>
                ))}
              </div>
            ) : unifiedRows.length === 0 ? (
              /* ─── Empty State ───────────────────────────────────────── */
              <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                <div className="rounded-2xl bg-muted/50 p-6 mb-6">
                  <Plug className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold tracking-tight mb-1">
                  Nenhuma integracao encontrada
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm text-center">
                  {searchTerm || statusFilter !== 'all' || sourceFilter !== 'all'
                    ? 'Tente ajustar os filtros de busca'
                    : 'Crie sua primeira integracao ou aguarde o sync com UAZapi'}
                </p>
                {!searchTerm && statusFilter === 'all' && sourceFilter === 'all' && (
                  <Button
                    onClick={() => setIsCreateModalOpen(true)}
                    variant="outline"
                    className="mt-4"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Criar primeira integracao
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border/40 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-[120px]">Fonte</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Telefone</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organizacao</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right w-[80px]">Acoes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unifiedRows.map((row, idx) => row.inDb ? (
                        // ─── ROW: Imported instance ─────────────────────
                        <TableRow
                          key={`db-${row.id}`}
                          className="group transition-colors hover:bg-muted/20 animate-fade-in cursor-pointer"
                          style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
                          onClick={() => { const inst = instanceMap.get(row.id); if (inst) handleDetails(inst) }}
                        >
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-[10px] gap-1 font-medium border-border/50"
                            >
                              <Cloud className="h-3 w-3 text-blue-400" />
                              Importada
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{row.name}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal hidden sm:inline-flex">
                                {getBrokerLabel(row.brokerType)}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm font-mono">
                            {row.phoneNumber || (
                              <span className="text-muted-foreground/40">---</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.organization ? (
                              <span className="inline-flex items-center gap-1.5 text-sm">
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground/70" />
                                <span className="truncate max-w-[140px]">{row.organization.name}</span>
                              </span>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-amber-500 border-amber-500/30"
                              >
                                Sem org
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusIndicator status={row.status} />
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => { const inst = instanceMap.get(row.id); if (inst) handleDetails(inst) }}>
                                  <ArrowUpRight className="h-4 w-4 mr-2" />
                                  Ver Detalhes
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { const inst = instanceMap.get(row.id); if (inst) handleEdit(inst) }}>
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { const inst = instanceMap.get(row.id); if (inst) handleConnect(inst) }}>
                                  {row.status === 'connected' ? 'Reconectar' : 'Conectar'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => { const inst = instanceMap.get(row.id); if (inst) setDeleteTarget(inst) }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Remover
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ) : (
                        // ─── ROW: UAZapi-only orphan ────────────────────
                        <TableRow
                          key={`uaz-${row.token}`}
                          className="group transition-colors hover:bg-amber-500/5 border-l-2 border-l-amber-500/60 animate-fade-in"
                          style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
                        >
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className="text-[10px] gap-1 font-medium text-amber-500 bg-amber-500/10 border-amber-500/20"
                            >
                              <CloudOff className="h-3 w-3" />
                              UAZapi
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium text-sm">{row.name}</span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm font-mono">
                            {row.phoneNumber || (
                              <span className="text-muted-foreground/40">---</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-[10px] text-amber-500 border-amber-500/30"
                            >
                              Nao importada
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <StatusIndicator status={row.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 transition-colors border-amber-500/30 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                              onClick={() => {
                                const orphan = orphans.find((o) => o.token === row.token)
                                if (orphan) handleImport(orphan)
                              }}
                              disabled={importingTokens.has(row.token)}
                            >
                              {importingTokens.has(row.token) ? (
                                <RefreshCw className="h-3 w-3 animate-spin mr-1.5" />
                              ) : (
                                <Download className="h-3 w-3 mr-1.5" />
                              )}
                              Importar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* ─── Pagination ─────────────────────────────────────── */}
                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-xs text-muted-foreground">
                      {((pagination.page - 1) * pagination.limit) + 1}
                      &ndash;
                      {Math.min(pagination.page * pagination.limit, pagination.total)}
                      {' '}de {pagination.total} importadas
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs text-muted-foreground px-2 tabular-nums">
                        {pagination.page} / {pagination.totalPages}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ─── Summary footer ────────────────────────────────────────── */}
        {!isLoading && !isLoadingUazapi && unifiedRows.length > 0 && (
          <p className="text-xs text-muted-foreground/60 text-center animate-fade-in">
            {stats.total} importada{stats.total !== 1 ? 's' : ''} + {orphans.length} somente UAZapi = {stats.total + orphans.length} total
          </p>
        )}
      </div>

      {/* ═══════════ DELETE CONFIRMATION ═══════════════════════════════ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover integracao</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.name}</strong>?
              A instancia sera desconectada da UAZapi e removida do banco.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin mr-2" />
                  Removendo...
                </>
              ) : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════ MODALS ═══════════════════════════════════════════ */}
      <CreateInstanceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          loadInstances()
          setIsCreateModalOpen(false)
          toast.success('Integracao criada com sucesso')
        }}
      />

      <ConnectionModal
        instance={selectedInstance}
        isOpen={isConnectModalOpen}
        onClose={() => {
          setIsConnectModalOpen(false)
          loadInstances(pagination.page)
        }}
      />

      <EditInstanceModal
        instance={selectedInstance}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedInstance(null)
        }}
        onSuccess={() => {
          loadInstances()
          setIsEditModalOpen(false)
          setSelectedInstance(null)
          toast.success('Integracao atualizada')
        }}
      />

      <DetailsModal
        instance={selectedInstance}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false)
          setSelectedInstance(null)
        }}
        onEdit={handleEditFromModal}
        orgs={orgs}
        onChangeOrg={handleChangeOrg}
      />
    </TooltipProvider>
  )
}
