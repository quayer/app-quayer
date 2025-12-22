'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/igniter.client'
import { useOrganization } from '@/hooks/useOrganization'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  MessageSquare,
  Search,
  MoreVertical,
  Bot,
  BotOff,
  Clock,
  Pause,
  Play,
  RefreshCw,
  MessageCircle,
  Inbox,
  Archive,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Phone,
  Tag,
  User,
  Wifi,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'

type SessionStatus = 'QUEUED' | 'ACTIVE' | 'PAUSED' | 'CLOSED'

interface Session {
  id: string
  status: SessionStatus
  aiEnabled: boolean
  aiBlockedUntil: string | null
  aiBlockReason: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
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
  _count?: {
    messages: number
  }
  lastMessage?: {
    content: string
    createdAt: string
    author: string
  }
  sessionTabulations?: {
    tabulation: {
      id: string
      name: string
      backgroundColor: string | null
    }
  }[]
}

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string; icon: any }> = {
  QUEUED: { label: 'Na Fila', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30', icon: Inbox },
  ACTIVE: { label: 'Ativo', color: 'bg-green-500/10 text-green-600 border-green-500/30', icon: MessageCircle },
  PAUSED: { label: 'Pausado', color: 'bg-orange-500/10 text-orange-600 border-orange-500/30', icon: Pause },
  CLOSED: { label: 'Encerrado', color: 'bg-gray-500/10 text-gray-600 border-gray-500/30', icon: Archive },
}

export default function MasterSessionsPage() {
  const queryClient = useQueryClient()
  const { currentOrgId } = useOrganization()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [connectionFilter, setConnectionFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('active')
  const limit = 20

  // Fetch sessions
  const { data: sessionsData, isLoading, refetch } = useQuery({
    queryKey: ['org-sessions', currentOrgId, statusFilter, connectionFilter, search, page, activeTab],
    queryFn: async () => {
      // Map tab to status filter
      let status = statusFilter !== 'all' ? statusFilter : undefined
      if (activeTab === 'active') status = 'ACTIVE'
      else if (activeTab === 'queued') status = 'QUEUED'
      else if (activeTab === 'closed') status = 'CLOSED'
      else if (activeTab === 'all') status = undefined

      const response = await (api.sessions as any).list.query({
        organizationId: currentOrgId,
        status,
        connectionId: connectionFilter !== 'all' ? connectionFilter : undefined,
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
    enabled: !!currentOrgId,
  })

  // Fetch connections for filter
  const { data: connectionsData } = useQuery({
    queryKey: ['org-connections', currentOrgId],
    queryFn: async () => {
      const response = await (api.instances as any).list.query({})
      return response.data?.instances || response.instances || []
    },
    enabled: !!currentOrgId,
  })

  // Block AI mutation
  const blockAIMutation = useMutation({
    mutationFn: async ({ sessionId, duration }: { sessionId: string; duration: number }) => {
      return await (api.sessions as any).blockAI.mutate({
        id: sessionId,
        body: { durationMinutes: duration, reason: 'manual_takeover' },
      })
    },
    onSuccess: () => {
      toast.success('IA bloqueada - voce assumiu o atendimento')
      queryClient.invalidateQueries({ queryKey: ['org-sessions'] })
    },
    onError: () => toast.error('Erro ao bloquear IA'),
  })

  // Unblock AI mutation
  const unblockAIMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return await (api.sessions as any).unblockAI.mutate({ id: sessionId })
    },
    onSuccess: () => {
      toast.success('IA reativada para este atendimento')
      queryClient.invalidateQueries({ queryKey: ['org-sessions'] })
    },
    onError: () => toast.error('Erro ao desbloquear IA'),
  })

  // Close session mutation
  const closeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return await (api.sessions as any).close.mutate({ id: sessionId })
    },
    onSuccess: () => {
      toast.success('Atendimento encerrado')
      queryClient.invalidateQueries({ queryKey: ['org-sessions'] })
    },
    onError: () => toast.error('Erro ao encerrar atendimento'),
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
      queryClient.invalidateQueries({ queryKey: ['org-sessions'] })
    },
    onError: () => toast.error('Erro ao atualizar status'),
  })

  const sessions = sessionsData?.sessions || []
  const pagination = sessionsData?.pagination
  const connections = connectionsData || []

  // Stats
  const stats = useMemo(() => {
    return {
      total: pagination?.total || 0,
      queued: sessions.filter(s => s.status === 'QUEUED').length,
      active: sessions.filter(s => s.status === 'ACTIVE').length,
      aiBlocked: sessions.filter(s => s.aiBlockedUntil && new Date(s.aiBlockedUntil) > new Date()).length,
    }
  }, [sessions, pagination])

  const getAIStatus = (session: Session) => {
    if (!session.aiEnabled) return 'disabled'
    if (session.aiBlockedUntil && new Date(session.aiBlockedUntil) > new Date()) return 'blocked'
    return 'enabled'
  }

  const getAIBadge = (session: Session) => {
    const status = getAIStatus(session)
    if (status === 'enabled') {
      return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30"><Bot className="h-3 w-3 mr-1" />IA</Badge>
    }
    if (status === 'blocked') {
      return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30"><User className="h-3 w-3 mr-1" />Humano</Badge>
    }
    return <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/30"><BotOff className="h-3 w-3 mr-1" />Off</Badge>
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Atendimentos</h1>
          <p className="text-muted-foreground">
            Gerencie as sessoes de atendimento WhatsApp da sua organizacao
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setActiveTab('all')}>
          <CardHeader className="pb-2">
            <CardDescription>Total de Atendimentos</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={cn("cursor-pointer hover:border-primary/50 transition-colors", activeTab === 'queued' && "border-yellow-500")} onClick={() => setActiveTab('queued')}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Inbox className="h-4 w-4 text-yellow-500" />
              Aguardando
            </CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{stats.queued}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={cn("cursor-pointer hover:border-primary/50 transition-colors", activeTab === 'active' && "border-green-500")} onClick={() => setActiveTab('active')}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <MessageCircle className="h-4 w-4 text-green-500" />
              Em Atendimento
            </CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <User className="h-4 w-4 text-blue-500" />
              Atendimento Humano
            </CardDescription>
            <CardTitle className="text-3xl text-blue-600">{stats.aiBlocked}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs + Filters */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <TabsList>
            <TabsTrigger value="active">
              <MessageCircle className="h-4 w-4 mr-2" />
              Ativos
            </TabsTrigger>
            <TabsTrigger value="queued">
              <Inbox className="h-4 w-4 mr-2" />
              Na Fila
            </TabsTrigger>
            <TabsTrigger value="closed">
              <Archive className="h-4 w-4 mr-2" />
              Encerrados
            </TabsTrigger>
            <TabsTrigger value="all">Todos</TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-[200px]"
              />
            </div>
            <Select value={connectionFilter} onValueChange={setConnectionFilter}>
              <SelectTrigger className="w-[180px]">
                <Wifi className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Canais</SelectItem>
                {connections.map((conn: any) => (
                  <SelectItem key={conn.id} value={conn.id}>{conn.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Sessions List */}
        <Card className="mt-4">
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-[200px]" />
                      <Skeleton className="h-3 w-[300px]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">Nenhum atendimento encontrado</p>
                <p className="text-sm">Os atendimentos aparecerao aqui quando os clientes entrarem em contato</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => {
                  const statusConfig = STATUS_CONFIG[session.status]
                  const StatusIcon = statusConfig.icon
                  const isAIBlocked = getAIStatus(session) === 'blocked'

                  return (
                    <div
                      key={session.id}
                      className={cn(
                        "flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer",
                        isAIBlocked && "border-l-4 border-l-blue-500"
                      )}
                      onClick={() => {
                        setSelectedSession(session)
                        setDetailsOpen(true)
                      }}
                    >
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={session.contact.profilePicUrl || undefined} />
                        <AvatarFallback>
                          {session.contact.name?.[0] || session.contact.phoneNumber[0]}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{session.contact.name || session.contact.phoneNumber}</p>
                          {session.contact.bypassBots && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className="bg-red-500/10 text-red-600 text-xs">
                                    Blacklist
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>Contato na blacklist - IA desativada</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {session.contact.phoneNumber} - {session.connection.name}
                        </p>
                        {session.sessionTabulations && session.sessionTabulations.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {session.sessionTabulations.slice(0, 3).map((st) => (
                              <Badge
                                key={st.tabulation.id}
                                variant="outline"
                                className="text-xs"
                                style={{
                                  backgroundColor: st.tabulation.backgroundColor ? `${st.tabulation.backgroundColor}20` : undefined,
                                  borderColor: st.tabulation.backgroundColor || undefined,
                                  color: st.tabulation.backgroundColor || undefined,
                                }}
                              >
                                {st.tabulation.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {getAIBadge(session)}
                        <Badge variant="outline" className={statusConfig.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig.label}
                        </Badge>
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation()
                            window.open(`/conversas/${session.id}`, '_blank')
                          }}>
                            <MessageCircle className="h-4 w-4 mr-2" />
                            Abrir Conversa
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {getAIStatus(session) === 'enabled' ? (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation()
                              blockAIMutation.mutate({ sessionId: session.id, duration: 30 })
                            }}>
                              <User className="h-4 w-4 mr-2" />
                              Assumir Atendimento
                            </DropdownMenuItem>
                          ) : getAIStatus(session) === 'blocked' ? (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation()
                              unblockAIMutation.mutate(session.id)
                            }}>
                              <Bot className="h-4 w-4 mr-2" />
                              Devolver para IA
                            </DropdownMenuItem>
                          ) : null}
                          {session.status !== 'CLOSED' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  closeSessionMutation.mutate(session.id)
                                }}
                                className="text-destructive"
                              >
                                <X className="h-4 w-4 mr-2" />
                                Encerrar
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t">
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
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= pagination.totalPages}
                  >
                    Proximo
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>

      {/* Session Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Atendimento</DialogTitle>
            <DialogDescription>
              Informacoes sobre a sessao de atendimento
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
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{selectedSession.contact.name || 'Sem nome'}</h3>
                  <p className="text-muted-foreground flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {selectedSession.contact.phoneNumber}
                  </p>
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

              {/* Session Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Canal</p>
                  <p className="font-medium flex items-center gap-2">
                    <Wifi className="h-4 w-4" />
                    {selectedSession.connection.name}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Iniciado em</p>
                  <p className="font-medium">{format(new Date(selectedSession.createdAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Ultima atividade</p>
                  <p className="font-medium">{formatDistanceToNow(new Date(selectedSession.updatedAt), { addSuffix: true, locale: ptBR })}</p>
                </div>
                {selectedSession.aiBlockedUntil && new Date(selectedSession.aiBlockedUntil) > new Date() && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Atendimento humano ate</p>
                    <p className="font-medium text-blue-600">
                      {format(new Date(selectedSession.aiBlockedUntil), "HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                )}
              </div>

              {/* Tags */}
              {selectedSession.sessionTabulations && selectedSession.sessionTabulations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Etiquetas
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedSession.sessionTabulations.map((st) => (
                      <Badge
                        key={st.tabulation.id}
                        variant="outline"
                        style={{
                          backgroundColor: st.tabulation.backgroundColor ? `${st.tabulation.backgroundColor}20` : undefined,
                          borderColor: st.tabulation.backgroundColor || undefined,
                          color: st.tabulation.backgroundColor || undefined,
                        }}
                      >
                        {st.tabulation.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  className="flex-1"
                  onClick={() => window.open(`/conversas/${selectedSession.id}`, '_blank')}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Abrir Conversa
                </Button>
                {getAIStatus(selectedSession) === 'enabled' ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      blockAIMutation.mutate({ sessionId: selectedSession.id, duration: 30 })
                      setDetailsOpen(false)
                    }}
                  >
                    <User className="h-4 w-4 mr-2" />
                    Assumir
                  </Button>
                ) : getAIStatus(selectedSession) === 'blocked' ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      unblockAIMutation.mutate(selectedSession.id)
                      setDetailsOpen(false)
                    }}
                  >
                    <Bot className="h-4 w-4 mr-2" />
                    Devolver IA
                  </Button>
                ) : null}
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
