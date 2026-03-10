'use client'

import { useState, useMemo } from 'react'
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
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  RefreshCw,
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

type SessionStatus = 'QUEUED' | 'ACTIVE' | 'PAUSED' | 'CLOSED'
type AIStatus = 'enabled' | 'disabled' | 'blocked'
type SessionStartedBy = 'CUSTOMER' | 'BUSINESS' | 'AGENT'
type WhatsAppWindowStatus = 'active' | 'expiring' | 'expired' | 'none'

interface Session {
  id: string
  status: SessionStatus
  startedBy: SessionStartedBy
  aiEnabled: boolean
  aiBlockedUntil: string | null
  aiBlockReason: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  organizationId: string
  totalMessages: number
  sessionDuration: number | null
  whatsappWindowExpiresAt: string | null
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
    status: string
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
  computed?: {
    whatsappWindowStatus: WhatsAppWindowStatus
    whatsappWindowRemaining: number
    aiStatus: AIStatus
    durationMinutes: number
    messageCount: number
  }
}

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string; icon: React.ElementType }> = {
  QUEUED:  { label: 'Na Fila',   color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30', icon: Inbox },
  ACTIVE:  { label: 'Ativo',     color: 'bg-green-500/10 text-green-600 border-green-500/30',   icon: MessageCircle },
  PAUSED:  { label: 'Pausado',   color: 'bg-orange-500/10 text-orange-600 border-orange-500/30', icon: Pause },
  CLOSED:  { label: 'Encerrado', color: 'bg-gray-500/10 text-gray-600 border-gray-500/30',      icon: Archive },
}

const STARTED_BY_CONFIG: Record<SessionStartedBy, { label: string; color: string }> = {
  CUSTOMER: { label: 'Cliente',    color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  BUSINESS: { label: 'Empresa',    color: 'bg-purple-500/10 text-purple-600 border-purple-500/30' },
  AGENT:    { label: 'Atendente',  color: 'bg-teal-500/10 text-teal-600 border-teal-500/30' },
}

const WHATSAPP_WINDOW_CONFIG: Record<WhatsAppWindowStatus, { label: string; color: string; icon: React.ElementType }> = {
  active:   { label: 'Ativa',     color: 'bg-green-500/10 text-green-600 border-green-500/30',   icon: CheckCircle2 },
  expiring: { label: 'Expirando', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30', icon: AlertTriangle },
  expired:  { label: 'Expirada',  color: 'bg-red-500/10 text-red-600 border-red-500/30',          icon: XCircle },
  none:     { label: 'N/A',       color: 'bg-gray-500/10 text-gray-500 border-gray-500/30',       icon: Clock },
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

export default function AdminSessionsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [aiStatusFilter, setAiStatusFilter] = useState<string>('all')
  const [orgFilter, setOrgFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const limit = 20

  // ✅ Igniter client — sem as any
  const { data: sessionsData, isLoading, refetch } = api.sessions.list.useQuery({
    query: {
      status: statusFilter !== 'all' ? statusFilter as SessionStatus : undefined,
      aiStatus: aiStatusFilter !== 'all' ? aiStatusFilter as AIStatus : undefined,
      organizationId: orgFilter !== 'all' ? orgFilter : undefined,
      search: search || undefined,
      page,
      limit,
      sortBy: 'lastMessage',
      sortOrder: 'desc',
    },
  })

  // ✅ Org list para filtro
  const { data: orgsData } = api.organizations.list.useQuery({
    query: { limit: 100 },
  })

  // ✅ Mutations sem as any
  const blockAIMutation = api.sessions.blockAI.useMutation({
    onSuccess: () => { toast.success('IA bloqueada com sucesso'); refetch() },
    onError: () => toast.error('Erro ao bloquear IA'),
  })

  const unblockAIMutation = api.sessions.unblockAI.useMutation({
    onSuccess: () => { toast.success('IA desbloqueada com sucesso'); refetch() },
    onError: () => toast.error('Erro ao desbloquear IA'),
  })

  const closeSessionMutation = api.sessions.close.useMutation({
    onSuccess: () => { toast.success('Sessão encerrada com sucesso'); refetch() },
    onError: () => toast.error('Erro ao encerrar sessão'),
  })

  const updateStatusMutation = api.sessions.updateStatus.useMutation({
    onSuccess: () => { toast.success('Status atualizado'); refetch() },
    onError: () => toast.error('Erro ao atualizar status'),
  })

  // Cast mutate para suporte a params/body — padrão Igniter
  const blockAIMutate = blockAIMutation.mutate as (input: { params: { id: string }; body: { durationMinutes: number; reason: string } }) => void
  const unblockAIMutate = unblockAIMutation.mutate as (input: { params: { id: string } }) => void
  const closeMutate = closeSessionMutation.mutate as (input: { params: { id: string } }) => void
  const updateStatusMutate = updateStatusMutation.mutate as (input: { params: { id: string }; body: { status: SessionStatus } }) => void

  const sessions: Session[] = (sessionsData as any)?.data || []
  const pagination = (sessionsData as any)?.pagination as { total: number; totalPages: number; page: number } | undefined
  const organizations: Array<{ id: string; name: string }> = Array.isArray((orgsData as any)?.data)
    ? (orgsData as any).data
    : Array.isArray(orgsData)
      ? (orgsData as any)
      : []

  const stats = useMemo(() => ({
    total: pagination?.total || 0,
    queued: sessions.filter(s => s.status === 'QUEUED').length,
    active: sessions.filter(s => s.status === 'ACTIVE').length,
    paused: sessions.filter(s => s.status === 'PAUSED').length,
    aiBlocked: sessions.filter(s => s.aiBlockedUntil && new Date(s.aiBlockedUntil) > new Date()).length,
  }), [sessions, pagination])

  const getAIStatus = (session: Session): AIStatus => {
    if (!session.aiEnabled) return 'disabled'
    if (session.aiBlockedUntil && new Date(session.aiBlockedUntil) > new Date()) return 'blocked'
    return 'enabled'
  }

  const getAIBadge = (session: Session) => {
    const status = session.computed?.aiStatus || getAIStatus(session)
    if (status === 'enabled')  return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30"><Bot className="h-3 w-3 mr-1" />IA Ativa</Badge>
    if (status === 'blocked')  return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30"><BotOff className="h-3 w-3 mr-1" />IA Bloqueada</Badge>
    return <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/30"><BotOff className="h-3 w-3 mr-1" />IA Desativada</Badge>
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sessões de Atendimento</h1>
          <p className="text-muted-foreground">
            Gerencie todas as sessões de atendimento WhatsApp
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
              <Inbox className="h-4 w-4 text-yellow-500" />Na Fila
            </CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{stats.queued}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <MessageCircle className="h-4 w-4 text-green-500" />Ativos
            </CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Pause className="h-4 w-4 text-orange-500" />Pausados
            </CardDescription>
            <CardTitle className="text-3xl text-orange-600">{stats.paused}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <BotOff className="h-4 w-4 text-red-500" />IA Bloqueada
            </CardDescription>
            <CardTitle className="text-3xl text-red-600">{stats.aiBlocked}</CardTitle>
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
                placeholder="Buscar por nome ou telefone..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
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
            <Select value={aiStatusFilter} onValueChange={(v) => { setAiStatusFilter(v); setPage(1) }}>
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
            <Select value={orgFilter} onValueChange={(v) => { setOrgFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Organização" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Organizações</SelectItem>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sessões</CardTitle>
          <CardDescription>{pagination?.total || 0} sessão(ões) encontrada(s)</CardDescription>
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
              <p>Nenhuma sessão encontrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contato</TableHead>
                  <TableHead>Organização</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Iniciado</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>IA</TableHead>
                  <TableHead>Janela 24h</TableHead>
                  <TableHead className="text-center">Msgs</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => {
                  const statusConfig = STATUS_CONFIG[session.status]
                  const StatusIcon = statusConfig.icon
                  const startedByConfig = STARTED_BY_CONFIG[session.startedBy || 'CUSTOMER']
                  const whatsappStatus = session.computed?.whatsappWindowStatus || 'none'
                  const whatsappConfig = WHATSAPP_WINDOW_CONFIG[whatsappStatus]
                  const WhatsAppIcon = whatsappConfig.icon
                  const messageCount = session.computed?.messageCount || session._count?.messages || 0
                  const durationMinutes = session.computed?.durationMinutes || 0
                  const isCloudApi = session.connection.provider === 'WHATSAPP_CLOUD_API'
                  const aiStatus = session.computed?.aiStatus || getAIStatus(session)

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
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {session.contact.phoneNumber}
                            </p>
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
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline">{session.connection.name}</Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {session.connection.provider === 'WHATSAPP_CLOUD_API' ? 'WhatsApp Cloud API (Meta)' :
                               session.connection.provider === 'WHATSAPP_WEB' ? 'WhatsApp Web (UAZApi)' :
                               session.connection.provider}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={startedByConfig.color}>
                          {startedByConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusConfig.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>{getAIBadge(session)}</TableCell>
                      <TableCell>
                        {isCloudApi ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline" className={whatsappConfig.color}>
                                  <WhatsAppIcon className="h-3 w-3 mr-1" />
                                  {whatsappStatus === 'expiring' && session.computed?.whatsappWindowRemaining
                                    ? `${session.computed.whatsappWindowRemaining}min`
                                    : whatsappConfig.label}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                {whatsappStatus === 'active'   && 'Janela de 24h ativa — pode enviar mensagens livremente'}
                                {whatsappStatus === 'expiring' && `Janela expira em ${session.computed?.whatsappWindowRemaining} minutos`}
                                {whatsappStatus === 'expired'  && 'Janela expirada — apenas templates permitidos'}
                                {whatsappStatus === 'none'     && 'Sem janela ativa — aguardando mensagem do cliente'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/30">
                            Ilimitado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-medium">{messageCount}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDuration(durationMinutes)}
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
                            <DropdownMenuItem onClick={() => { setSelectedSession(session); setDetailsOpen(true) }}>
                              <Eye className="h-4 w-4 mr-2" />Ver Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {aiStatus === 'enabled' && (
                              <DropdownMenuItem onClick={() => blockAIMutate({ params: { id: session.id }, body: { durationMinutes: 15, reason: 'admin_block' } })}>
                                <BotOff className="h-4 w-4 mr-2" />Bloquear IA (15min)
                              </DropdownMenuItem>
                            )}
                            {aiStatus === 'blocked' && (
                              <DropdownMenuItem onClick={() => unblockAIMutate({ params: { id: session.id } })}>
                                <Bot className="h-4 w-4 mr-2" />Desbloquear IA
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {session.status !== 'ACTIVE' && session.status !== 'CLOSED' && (
                              <DropdownMenuItem onClick={() => updateStatusMutate({ params: { id: session.id }, body: { status: 'ACTIVE' } })}>
                                <Play className="h-4 w-4 mr-2" />Ativar
                              </DropdownMenuItem>
                            )}
                            {session.status === 'ACTIVE' && (
                              <DropdownMenuItem onClick={() => updateStatusMutate({ params: { id: session.id }, body: { status: 'PAUSED' } })}>
                                <Pause className="h-4 w-4 mr-2" />Pausar
                              </DropdownMenuItem>
                            )}
                            {session.status !== 'CLOSED' && (
                              <DropdownMenuItem
                                onClick={() => closeMutate({ params: { id: session.id } })}
                                className="text-destructive"
                              >
                                <X className="h-4 w-4 mr-2" />Encerrar Sessão
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
                Página {pagination.page} de {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="h-4 w-4" />Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= pagination.totalPages}>
                  Próximo<ChevronRight className="h-4 w-4" />
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
            <DialogTitle>Detalhes da Sessão</DialogTitle>
            <DialogDescription>Informações detalhadas sobre a sessão de atendimento</DialogDescription>
          </DialogHeader>
          {selectedSession && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-6 pr-4">
                {/* Contact */}
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
                      <Badge variant="outline" className={STATUS_CONFIG[selectedSession.status].color}>
                        {STATUS_CONFIG[selectedSession.status].label}
                      </Badge>
                      {getAIBadge(selectedSession)}
                    </div>
                  </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Organização</p>
                    <p className="font-medium">{selectedSession.organization?.name || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Canal</p>
                    <p className="font-medium">{selectedSession.connection.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Criada em</p>
                    <p className="font-medium">{format(new Date(selectedSession.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Última atividade</p>
                    <p className="font-medium">{formatDistanceToNow(new Date(selectedSession.updatedAt), { addSuffix: true, locale: ptBR })}</p>
                  </div>
                  {selectedSession.closedAt && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Encerrada em</p>
                      <p className="font-medium">{format(new Date(selectedSession.closedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                    </div>
                  )}
                  {selectedSession.aiBlockedUntil && new Date(selectedSession.aiBlockedUntil) > new Date() && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">IA bloqueada até</p>
                      <p className="font-medium text-orange-600">
                        {format(new Date(selectedSession.aiBlockedUntil), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => window.open(`/conversas?sessionId=${selectedSession.id}`, '_blank')}>
                    <MessageCircle className="h-4 w-4 mr-2" />Abrir Conversa
                  </Button>
                  {selectedSession.status !== 'CLOSED' && (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        closeMutate({ params: { id: selectedSession.id } })
                        setDetailsOpen(false)
                      }}
                    >
                      <X className="h-4 w-4 mr-2" />Encerrar
                    </Button>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
