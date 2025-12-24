'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/igniter.client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  MessageSquare,
  Search,
  MoreVertical,
  Bot,
  BotOff,
  User,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  RefreshCw,
  Filter,
  Building2,
  MessageCircle,
  AlertTriangle,
  Inbox,
  Archive,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'

type SessionStatus = 'QUEUED' | 'ACTIVE' | 'PAUSED' | 'CLOSED'
type AIStatus = 'enabled' | 'disabled' | 'blocked'

interface Session {
  id: string
  status: SessionStatus
  aiEnabled: boolean
  aiBlockedUntil: string | null
  aiBlockReason: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  organizationId: string
  contact: {
    id: string
    name: string | null
    phoneNumber: string
    profilePicUrl: string | null
    bypassBots: boolean
  }
  connection: {
    id: string
    name: string
    provider: string
  }
  organization?: {
    id: string
    name: string
    slug: string
  }
  _count?: {
    messages: number
  }
  lastMessage?: {
    content: string
    createdAt: string
    author: string
  }
}

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string; icon: any }> = {
  QUEUED: { label: 'Na Fila', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30', icon: Inbox },
  ACTIVE: { label: 'Ativo', color: 'bg-green-500/10 text-green-600 border-green-500/30', icon: MessageCircle },
  PAUSED: { label: 'Pausado', color: 'bg-orange-500/10 text-orange-600 border-orange-500/30', icon: Pause },
  CLOSED: { label: 'Encerrado', color: 'bg-gray-500/10 text-gray-600 border-gray-500/30', icon: Archive },
}

export default function AdminSessionsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [aiStatusFilter, setAiStatusFilter] = useState<string>('all')
  const [orgFilter, setOrgFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const limit = 20

  // Fetch sessions
  const { data: sessionsData, isLoading, refetch } = useQuery({
    queryKey: ['admin-sessions', statusFilter, aiStatusFilter, orgFilter, search, page],
    queryFn: async () => {
      const response = await (api.sessions as any).list.query({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        aiStatus: aiStatusFilter !== 'all' ? aiStatusFilter : undefined,
        organizationId: orgFilter !== 'all' ? orgFilter : undefined,
        search: search || undefined,
        page,
        limit,
        sortBy: 'lastMessage',
        sortOrder: 'desc',
      })
      return response.data as {
        sessions: Session[]
        pagination: { total: number; totalPages: number; page: number }
      }
    },
  })

  // Fetch organizations for filter
  // API returns { data: { data: [...], pagination: {...} } }
  const { data: orgsData } = useQuery({
    queryKey: ['admin-organizations-list'],
    queryFn: async () => {
      const response = await (api.organizations as any).list.query({ limit: 100 })
      const data = response?.data
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
  })

  // Block AI mutation
  const blockAIMutation = useMutation({
    mutationFn: async ({ sessionId, duration }: { sessionId: string; duration: number }) => {
      return await (api.sessions as any).blockAI.mutate({
        id: sessionId,
        body: { durationMinutes: duration, reason: 'admin_block' },
      })
    },
    onSuccess: () => {
      toast.success('IA bloqueada com sucesso')
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] })
    },
    onError: () => toast.error('Erro ao bloquear IA'),
  })

  // Unblock AI mutation
  const unblockAIMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return await (api.sessions as any).unblockAI.mutate({ id: sessionId })
    },
    onSuccess: () => {
      toast.success('IA desbloqueada com sucesso')
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] })
    },
    onError: () => toast.error('Erro ao desbloquear IA'),
  })

  // Close session mutation
  const closeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return await (api.sessions as any).close.mutate({ id: sessionId })
    },
    onSuccess: () => {
      toast.success('Sessao encerrada com sucesso')
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] })
    },
    onError: () => toast.error('Erro ao encerrar sessao'),
  })

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ sessionId, status }: { sessionId: string; status: SessionStatus }) => {
      return await (api.sessions as any).updateStatus.mutate({
        id: sessionId,
        body: { status },
      })
    },
    onSuccess: () => {
      toast.success('Status atualizado')
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] })
    },
    onError: () => toast.error('Erro ao atualizar status'),
  })

  const sessions = sessionsData?.sessions || []
  const pagination = sessionsData?.pagination
  const organizations = orgsData || []

  // Stats
  const stats = useMemo(() => {
    return {
      total: pagination?.total || 0,
      queued: sessions.filter(s => s.status === 'QUEUED').length,
      active: sessions.filter(s => s.status === 'ACTIVE').length,
      paused: sessions.filter(s => s.status === 'PAUSED').length,
      aiBlocked: sessions.filter(s => s.aiBlockedUntil && new Date(s.aiBlockedUntil) > new Date()).length,
    }
  }, [sessions, pagination])

  const getAIStatus = (session: Session): AIStatus => {
    if (!session.aiEnabled) return 'disabled'
    if (session.aiBlockedUntil && new Date(session.aiBlockedUntil) > new Date()) return 'blocked'
    return 'enabled'
  }

  const getAIBadge = (session: Session) => {
    const status = getAIStatus(session)
    if (status === 'enabled') {
      return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30"><Bot className="h-3 w-3 mr-1" />IA Ativa</Badge>
    }
    if (status === 'blocked') {
      return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30"><BotOff className="h-3 w-3 mr-1" />IA Bloqueada</Badge>
    }
    return <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/30"><BotOff className="h-3 w-3 mr-1" />IA Desativada</Badge>
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sessoes de Atendimento</h1>
          <p className="text-muted-foreground">
            Gerencie todas as sessoes de atendimento WhatsApp
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Inbox className="h-4 w-4 text-yellow-500" />
              Na Fila
            </CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{stats.queued}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <MessageCircle className="h-4 w-4 text-green-500" />
              Ativos
            </CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Pause className="h-4 w-4 text-orange-500" />
              Pausados
            </CardDescription>
            <CardTitle className="text-3xl text-orange-600">{stats.paused}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <BotOff className="h-4 w-4 text-red-500" />
              IA Bloqueada
            </CardDescription>
            <CardTitle className="text-3xl text-red-600">{stats.aiBlocked}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou telefone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="QUEUED">Na Fila</SelectItem>
                <SelectItem value="ACTIVE">Ativo</SelectItem>
                <SelectItem value="PAUSED">Pausado</SelectItem>
                <SelectItem value="CLOSED">Encerrado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={aiStatusFilter} onValueChange={setAiStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status IA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas IA</SelectItem>
                <SelectItem value="enabled">IA Ativa</SelectItem>
                <SelectItem value="disabled">IA Desativada</SelectItem>
                <SelectItem value="blocked">IA Bloqueada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Organizacao" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Organizacoes</SelectItem>
                {organizations.map((org: any) => (
                  <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sessoes</CardTitle>
          <CardDescription>
            {pagination?.total || 0} sessao(es) encontrada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-[200px]" />
                    <Skeleton className="h-3 w-[150px]" />
                  </div>
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma sessao encontrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contato</TableHead>
                  <TableHead>Organizacao</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>IA</TableHead>
                  <TableHead>Ultima Atividade</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => {
                  const statusConfig = STATUS_CONFIG[session.status]
                  const StatusIcon = statusConfig.icon

                  return (
                    <TableRow key={session.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={session.contact.profilePicUrl || undefined} />
                            <AvatarFallback>
                              {session.contact.name?.[0] || session.contact.phoneNumber[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{session.contact.name || 'Sem nome'}</p>
                            <p className="text-sm text-muted-foreground">{session.contact.phoneNumber}</p>
                          </div>
                          {session.contact.bypassBots && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className="bg-red-500/10 text-red-600">
                                    <BotOff className="h-3 w-3" />
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>Contato na blacklist (bots desativados)</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{session.organization?.name || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{session.connection.name}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusConfig.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>{getAIBadge(session)}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true, locale: ptBR })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setSelectedSession(session)
                              setDetailsOpen(true)
                            }}>
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {getAIStatus(session) === 'enabled' ? (
                              <DropdownMenuItem onClick={() => blockAIMutation.mutate({ sessionId: session.id, duration: 15 })}>
                                <BotOff className="h-4 w-4 mr-2" />
                                Bloquear IA (15min)
                              </DropdownMenuItem>
                            ) : getAIStatus(session) === 'blocked' ? (
                              <DropdownMenuItem onClick={() => unblockAIMutation.mutate(session.id)}>
                                <Bot className="h-4 w-4 mr-2" />
                                Desbloquear IA
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            {session.status !== 'ACTIVE' && session.status !== 'CLOSED' && (
                              <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ sessionId: session.id, status: 'ACTIVE' })}>
                                <Play className="h-4 w-4 mr-2" />
                                Ativar
                              </DropdownMenuItem>
                            )}
                            {session.status === 'ACTIVE' && (
                              <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ sessionId: session.id, status: 'PAUSED' })}>
                                <Pause className="h-4 w-4 mr-2" />
                                Pausar
                              </DropdownMenuItem>
                            )}
                            {session.status !== 'CLOSED' && (
                              <DropdownMenuItem
                                onClick={() => closeSessionMutation.mutate(session.id)}
                                className="text-destructive"
                              >
                                <X className="h-4 w-4 mr-2" />
                                Encerrar Sessao
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Pagina {pagination.page} de {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= pagination.totalPages}
                >
                  Proximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Sessao</DialogTitle>
            <DialogDescription>
              Informacoes detalhadas sobre a sessao de atendimento
            </DialogDescription>
          </DialogHeader>
          {selectedSession && (
            <div className="space-y-6">
              {/* Contact Info */}
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={selectedSession.contact.profilePicUrl || undefined} />
                  <AvatarFallback className="text-xl">
                    {selectedSession.contact.name?.[0] || selectedSession.contact.phoneNumber[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-lg">{selectedSession.contact.name || 'Sem nome'}</h3>
                  <p className="text-muted-foreground">{selectedSession.contact.phoneNumber}</p>
                  <div className="flex gap-2 mt-2">
                    {STATUS_CONFIG[selectedSession.status] && (
                      <Badge variant="outline" className={STATUS_CONFIG[selectedSession.status].color}>
                        {STATUS_CONFIG[selectedSession.status].label}
                      </Badge>
                    )}
                    {getAIBadge(selectedSession)}
                  </div>
                </div>
              </div>

              {/* Session Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Organizacao</p>
                  <p className="font-medium">{selectedSession.organization?.name || 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Canal</p>
                  <p className="font-medium">{selectedSession.connection.name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Criada em</p>
                  <p className="font-medium">{format(new Date(selectedSession.createdAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Ultima atividade</p>
                  <p className="font-medium">{format(new Date(selectedSession.updatedAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</p>
                </div>
                {selectedSession.closedAt && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Encerrada em</p>
                    <p className="font-medium">{format(new Date(selectedSession.closedAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</p>
                  </div>
                )}
                {selectedSession.aiBlockedUntil && new Date(selectedSession.aiBlockedUntil) > new Date() && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">IA bloqueada ate</p>
                    <p className="font-medium text-orange-600">
                      {format(new Date(selectedSession.aiBlockedUntil), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => window.open(`/conversas/${selectedSession.id}`, '_blank')}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Abrir Conversa
                </Button>
                {selectedSession.status !== 'CLOSED' && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      closeSessionMutation.mutate(selectedSession.id)
                      setDetailsOpen(false)
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Encerrar
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
