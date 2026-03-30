'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Badge } from '@/client/components/ui/badge'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Switch } from '@/client/components/ui/switch'
import { Label } from '@/client/components/ui/label'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/client/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/client/components/ui/tabs'
import {
  Shield,
  Monitor,
  Globe,
  Trash2,
  Plus,
  Search,
  Ban,
  Check,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getCsrfHeaders } from '@/client/hooks/use-csrf-token'

// ============================================
// Types
// ============================================

interface DeviceSession {
  id: string
  userId: string
  deviceName: string
  ipAddress: string
  userAgent: string
  location: string | null
  lastActiveAt: string
  createdAt: string
  isRevoked: boolean
  revokedAt: string | null
  user?: {
    id: string
    name: string | null
    email: string
  }
}

interface IpRule {
  id: string
  type: 'ALLOW' | 'BLOCK'
  ipAddress: string
  description: string | null
  organizationId: string | null
  organization: { id: string; name: string } | null
  createdById: string
  createdBy: { id: string; name: string | null; email: string } | null
  isActive: boolean
  expiresAt: string | null
  createdAt: string
}

interface Organization {
  id: string
  name: string
}

// ============================================
// Helpers
// ============================================

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getCsrfHeaders(), ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || body.error || `Erro ${res.status}`)
  }
  return res.json()
}

// ============================================
// Tab 1: Dispositivos
// ============================================

function DevicesTab() {
  const [sessions, setSessions] = useState<DeviceSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [revokeTarget, setRevokeTarget] = useState<DeviceSession | null>(null)
  const [revokeAllUserId, setRevokeAllUserId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const limit = 20

  const loadSessions = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const data = await apiFetch<{
        data: DeviceSession[]
        pagination: { page: number; limit: number; total: number; totalPages: number }
      }>(`/api/v1/device-sessions/all?${params.toString()}`)
      setSessions(Array.isArray(data?.data) ? data.data : [])
      setTotalPages(data.pagination?.totalPages || 1)
      setTotalCount(data.pagination?.total || 0)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar dispositivos'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  const stats = useMemo(() => ({
    total: totalCount,
    active: sessions.filter((s) => !s.isRevoked).length,
    revoked: sessions.filter((s) => s.isRevoked).length,
  }), [sessions, totalCount])

  const handleRevoke = async (session: DeviceSession) => {
    try {
      await apiFetch('/api/v1/device-sessions/revoke', {
        method: 'POST',
        body: JSON.stringify({ deviceSessionId: session.id }),
      })
      toast.success('Sessão revogada com sucesso')
      setRevokeTarget(null)
      loadSessions()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao revogar sessão'
      toast.error(message)
    }
  }

  const handleRevokeByUser = async (userId: string) => {
    try {
      await apiFetch('/api/v1/device-sessions/revoke-by-user', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      })
      toast.success('Todas as sessões do usuário foram revogadas')
      setRevokeAllUserId(null)
      loadSessions()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao revogar sessões'
      toast.error(message)
    }
  }

  // Group active sessions by user for per-user revoke
  const usersWithActiveSessions = useMemo(() => {
    const map = new Map<string, { id: string; name: string | null; email: string; count: number }>()
    sessions.filter((s) => !s.isRevoked && s.user).forEach((s) => {
      const existing = map.get(s.userId)
      if (existing) {
        existing.count++
      } else {
        map.set(s.userId, {
          id: s.userId,
          name: s.user?.name || null,
          email: s.user?.email || '',
          count: 1,
        })
      }
    })
    return Array.from(map.values())
  }, [sessions])

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Dispositivos</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Check className="h-4 w-4 text-green-500" />Ativos
            </CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Ban className="h-4 w-4 text-red-500" />Revogados
            </CardDescription>
            <CardTitle className="text-3xl text-red-600">{stats.revoked}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por usuário, dispositivo ou IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="revoked">Revogados</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => loadSessions()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-user revoke */}
      {usersWithActiveSessions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Revogar por Usuário</CardTitle>
            <CardDescription>Revogue todas as sessões ativas de um usuário específico</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {usersWithActiveSessions.map((u) => (
                <Button
                  key={u.id}
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => setRevokeAllUserId(u.id)}
                >
                  <Ban className="h-3 w-3 mr-1" />
                  {u.name || u.email} ({u.count})
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Dispositivos</CardTitle>
          <CardDescription>{totalCount} dispositivo(s) no total — mostrando página {page} de {totalPages}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum dispositivo encontrado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Último Acesso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{session.user?.name || 'Sem nome'}</p>
                        <p className="text-sm text-muted-foreground">{session.user?.email || '—'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm max-w-[200px] truncate">{session.deviceName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{session.ipAddress}</code>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {session.location || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(session.lastActiveAt), { addSuffix: true, locale: ptBR })}
                      </span>
                    </TableCell>
                    <TableCell>
                      {session.isRevoked ? (
                        <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
                          Revogado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                          Ativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!session.isRevoked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRevokeTarget(session)}
                        >
                          <Ban className="h-4 w-4 mr-1" />
                          Revogar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
              Próximo<ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Revoke single confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar sessão de dispositivo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja revogar a sessão do dispositivo{' '}
              <strong>{revokeTarget?.deviceName}</strong>?
              O usuário será desconectado deste dispositivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => revokeTarget && handleRevoke(revokeTarget)}
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke all by user confirmation */}
      <AlertDialog open={!!revokeAllUserId} onOpenChange={() => setRevokeAllUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar sessões do usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja revogar todas as sessões ativas deste usuário?
              Todos os dispositivos dele serão desconectados.
              {(() => {
                const u = usersWithActiveSessions.find((u) => u.id === revokeAllUserId)
                return u ? (
                  <span className="block mt-2 font-medium text-foreground">
                    {u.name || u.email} — {u.count} sessão(ões) ativa(s)
                  </span>
                ) : null
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => revokeAllUserId && handleRevokeByUser(revokeAllUserId)}
            >
              Revogar Todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================
// Tab 2: Regras de IP
// ============================================

type ExpirationPreset = '1h' | '24h' | '7d' | '30d' | 'permanent'

function isValidIpv4(ip: string): boolean {
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    const num = Number(part)
    return /^\d+$/.test(part) && num >= 0 && num <= 255
  })
}

const EXPIRATION_PRESETS: Record<ExpirationPreset, { label: string; ms: number | null }> = {
  '1h': { label: '1 hora', ms: 60 * 60 * 1000 },
  '24h': { label: '24 horas', ms: 24 * 60 * 60 * 1000 },
  '7d': { label: '7 dias', ms: 7 * 24 * 60 * 60 * 1000 },
  '30d': { label: '30 dias', ms: 30 * 24 * 60 * 60 * 1000 },
  permanent: { label: 'Permanente', ms: null },
}

function IpRulesTab() {
  const [rules, setRules] = useState<IpRule[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 50

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<IpRule | null>(null)

  // Form state
  const [formIp, setFormIp] = useState('')
  const [formType, setFormType] = useState<'ALLOW' | 'BLOCK'>('BLOCK')
  const [formOrgId, setFormOrgId] = useState<string>('')
  const [formDescription, setFormDescription] = useState('')
  const [formExpiration, setFormExpiration] = useState<ExpirationPreset>('permanent')
  const [ipError, setIpError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadRules = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await apiFetch<{
        data: IpRule[]
        pagination: { total: number; totalPages: number; page: number }
      }>(`/api/v1/ip-rules?page=${page}&limit=${limit}`)
      setRules(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? (data as unknown as IpRule[]) : [])
      setTotalPages(data.pagination?.totalPages || 1)
      setTotal(data.pagination?.total || 0)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar regras de IP'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }, [page])

  const loadOrgs = useCallback(async () => {
    try {
      const data = await apiFetch<{ data: Organization[] }>('/api/v1/organizations?limit=100')
      const orgs = Array.isArray(data.data) ? data.data : Array.isArray(data) ? (data as unknown as Organization[]) : []
      setOrganizations(orgs)
    } catch {
      // Fail silently, orgs are optional in form
    }
  }, [])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  useEffect(() => {
    loadOrgs()
  }, [loadOrgs])

  const blockedRules = useMemo(() => rules.filter((r) => r.type === 'BLOCK'), [rules])
  const allowedRules = useMemo(() => rules.filter((r) => r.type === 'ALLOW'), [rules])

  const stats = useMemo(() => ({
    total: total,
    blocked: rules.filter((r) => r.type === 'BLOCK').length,
    allowed: rules.filter((r) => r.type === 'ALLOW').length,
    active: rules.filter((r) => r.isActive).length,
  }), [rules, total])

  const resetForm = () => {
    setFormIp('')
    setIpError(null)
    setFormType('BLOCK')
    setFormOrgId('')
    setFormDescription('')
    setFormExpiration('permanent')
  }

  const handleIpChange = (value: string) => {
    setFormIp(value)
    if (!value.trim()) {
      setIpError(null)
    } else if (!isValidIpv4(value)) {
      setIpError('IP inválido. Ex: 192.168.1.100')
    } else {
      setIpError(null)
    }
  }

  const handleCreate = async () => {
    if (!formIp.trim()) {
      setIpError('Informe o endereço IP')
      return
    }
    if (!isValidIpv4(formIp)) {
      setIpError('IP inválido. Ex: 192.168.1.100')
      return
    }

    setIsSubmitting(true)
    try {
      const preset = EXPIRATION_PRESETS[formExpiration]
      const expiresAt = preset.ms ? new Date(Date.now() + preset.ms).toISOString() : undefined

      await apiFetch('/api/v1/ip-rules', {
        method: 'POST',
        body: JSON.stringify({
          ipAddress: formIp.trim(),
          type: formType,
          description: formDescription.trim() || undefined,
          organizationId: formOrgId || undefined,
          expiresAt,
        }),
      })
      toast.success('Regra de IP criada com sucesso')
      setIsCreateOpen(false)
      resetForm()
      loadRules()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao criar regra de IP'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleActive = async (rule: IpRule) => {
    try {
      await apiFetch(`/api/v1/ip-rules/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !rule.isActive }),
      })
      toast.success(rule.isActive ? 'Regra desativada' : 'Regra ativada')
      loadRules()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar regra'
      toast.error(message)
    }
  }

  const handleDelete = async (rule: IpRule) => {
    try {
      await apiFetch(`/api/v1/ip-rules/${rule.id}`, { method: 'DELETE' })
      toast.success('Regra de IP removida')
      setDeleteTarget(null)
      loadRules()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao remover regra'
      toast.error(message)
    }
  }

  const renderRulesTable = (rulesList: IpRule[], emptyLabel: string) => {
    if (rulesList.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <Globe className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>{emptyLabel}</p>
        </div>
      )
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>IP</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Organização</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Expira em</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rulesList.map((rule) => {
            const isExpired = rule.expiresAt && new Date(rule.expiresAt) < new Date()
            return (
              <TableRow key={rule.id}>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{rule.ipAddress}</code>
                </TableCell>
                <TableCell>
                  {rule.type === 'BLOCK' ? (
                    <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
                      <Ban className="h-3 w-3 mr-1" />Bloquear
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                      <Check className="h-3 w-3 mr-1" />Permitir
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {rule.organization?.name || 'Global'}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground max-w-[200px] truncate block">
                    {rule.description || '—'}
                  </span>
                </TableCell>
                <TableCell>
                  {rule.expiresAt ? (
                    <span className={`text-sm ${isExpired ? 'text-red-500 line-through' : 'text-muted-foreground'}`}>
                      {format(new Date(rule.expiresAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Permanente</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={() => handleToggleActive(rule)}
                    />
                    <span className="text-sm">
                      {rule.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(rule)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Regras</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Ban className="h-4 w-4 text-red-500" />Bloqueados
            </CardDescription>
            <CardTitle className="text-3xl text-red-600">{stats.blocked}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Check className="h-4 w-4 text-green-500" />Permitidos
            </CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats.allowed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Shield className="h-4 w-4 text-blue-500" />Ativos
            </CardDescription>
            <CardTitle className="text-3xl text-blue-600">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Add Rule button */}
      <div className="flex justify-end">
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Regra
        </Button>
      </div>

      {/* Blocked IPs Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-red-500" />
            IPs Bloqueados
          </CardTitle>
          <CardDescription>{blockedRules.length} regra(s) de bloqueio</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            renderRulesTable(blockedRules, 'Nenhum IP bloqueado')
          )}
        </CardContent>
      </Card>

      {/* Allowed IPs Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-500" />
            IPs Permitidos
          </CardTitle>
          <CardDescription>{allowedRules.length} regra(s) de permissão</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            renderRulesTable(allowedRules, 'Nenhum IP na lista de permissão')
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
              Próximo<ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Rule Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Regra de IP</DialogTitle>
            <DialogDescription>Crie uma regra para bloquear ou permitir um endereço IP.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ip-address">Endereço IP *</Label>
              <Input
                id="ip-address"
                placeholder="Ex: 192.168.1.100"
                value={formIp}
                onChange={(e) => handleIpChange(e.target.value)}
                className={ipError ? 'border-destructive' : ''}
              />
              {ipError && (
                <p className="text-xs text-destructive mt-1">{ipError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as 'ALLOW' | 'BLOCK')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BLOCK">Bloquear</SelectItem>
                  <SelectItem value="ALLOW">Permitir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Organização (opcional)</Label>
              <Select value={formOrgId || 'global'} onValueChange={(v) => setFormOrgId(v === 'global' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Global (todas)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (todas)</SelectItem>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Input
                id="description"
                placeholder="Motivo da regra..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Expiração</Label>
              <Select value={formExpiration} onValueChange={(v) => setFormExpiration(v as ExpirationPreset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPIRATION_PRESETS).map(([key, preset]) => (
                    <SelectItem key={key} value={key}>{preset.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateOpen(false); resetForm() }}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitting || !!ipError || !formIp.trim()}>
              {isSubmitting ? 'Criando...' : 'Criar Regra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover regra de IP</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover a regra para o IP{' '}
              <strong>{deleteTarget?.ipAddress}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================
// Main Page
// ============================================

export default function AdminSecurityPage() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <span>Admin</span>
            <ChevronRight className="h-3 w-3" />
            <span>Segurança</span>
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="h-8 w-8" />
            Central de Segurança
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie dispositivos conectados e regras de acesso por IP
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="devices" className="space-y-6">
        <TabsList>
          <TabsTrigger value="devices" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Dispositivos
          </TabsTrigger>
          <TabsTrigger value="ip-rules" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Regras de IP
          </TabsTrigger>
        </TabsList>

        <TabsContent value="devices">
          <DevicesTab />
        </TabsContent>

        <TabsContent value="ip-rules">
          <IpRulesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
