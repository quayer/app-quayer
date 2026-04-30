'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Badge } from '@/client/components/ui/badge'
import { Textarea } from '@/client/components/ui/textarea'
import { Switch } from '@/client/components/ui/switch'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/client/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/client/components/ui/dialog'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
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
import { Skeleton } from '@/client/components/ui/skeleton'
import { ScrollArea } from '@/client/components/ui/scroll-area'
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Search,
  Filter,
  Globe,
  User,
  Building,
  Users,
  MessageCircle,
  AlertTriangle,
  Info,
  Check,
  XCircle,
  Settings,
  Wifi,
  RefreshCw,
  Calendar,
  Clock,
  Eye,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  UserPlus,
  ShieldAlert,
  Megaphone,
  Zap,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { safeFormatDate } from '@/lib/utils/format'

// Notification types with icons
const NOTIFICATION_TYPE_CONFIG = {
  MESSAGE: { label: 'Mensagem', icon: MessageCircle, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  USER: { label: 'Usuario', icon: Users, color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  WARNING: { label: 'Aviso', icon: AlertTriangle, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
  INFO: { label: 'Informativo', icon: Info, color: 'text-sky-500', bgColor: 'bg-sky-500/10' },
  SUCCESS: { label: 'Sucesso', icon: Check, color: 'text-green-500', bgColor: 'bg-green-500/10' },
  ERROR: { label: 'Erro', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500/10' },
  SYSTEM: { label: 'Sistema', icon: Settings, color: 'text-gray-500', bgColor: 'bg-gray-500/10' },
  CONNECTION: { label: 'Conexao', icon: Wifi, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
}

type NotificationType = keyof typeof NOTIFICATION_TYPE_CONFIG

// Default notification templates
const NOTIFICATION_TEMPLATES = [
  {
    id: 'instance-connected',
    label: 'Instancia Conectada',
    icon: Wifi,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    data: {
      type: 'CONNECTION' as NotificationType,
      title: 'WhatsApp Conectado',
      description: 'Uma nova instancia do WhatsApp foi conectada com sucesso a sua organizacao.',
      actionUrl: '/projetos',
      actionLabel: 'Ver Instancias',
      isGlobal: false,
    },
  },
  {
    id: 'instance-disconnected',
    label: 'Instancia Desconectada',
    icon: AlertTriangle,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    data: {
      type: 'WARNING' as NotificationType,
      title: 'WhatsApp Desconectado',
      description: 'Uma instancia do WhatsApp foi desconectada. Reconecte para continuar recebendo mensagens.',
      actionUrl: '/projetos',
      actionLabel: 'Reconectar',
      isGlobal: false,
    },
  },
  {
    id: 'payment-overdue',
    label: 'Pagamento Pendente',
    icon: CreditCard,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    data: {
      type: 'ERROR' as NotificationType,
      title: 'Pagamento Pendente',
      description: 'Sua fatura esta pendente. Regularize o pagamento para evitar a suspensao dos servicos.',
      actionUrl: '/admin/billing',
      actionLabel: 'Ver Fatura',
      isGlobal: false,
    },
  },
  {
    id: 'payment-confirmed',
    label: 'Pagamento Confirmado',
    icon: Check,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    data: {
      type: 'SUCCESS' as NotificationType,
      title: 'Pagamento Confirmado',
      description: 'Seu pagamento foi confirmado com sucesso. Obrigado!',
      actionUrl: '/admin/billing',
      actionLabel: 'Ver Detalhes',
      isGlobal: false,
    },
  },
  {
    id: 'new-member',
    label: 'Novo Membro',
    icon: UserPlus,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    data: {
      type: 'USER' as NotificationType,
      title: 'Novo Membro na Equipe',
      description: 'Um novo membro aceitou o convite e entrou na sua organizacao.',
      actionUrl: '/admin/settings',
      actionLabel: 'Ver Equipe',
      isGlobal: false,
    },
  },
  {
    id: 'plan-limit',
    label: 'Limite do Plano',
    icon: ShieldAlert,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    data: {
      type: 'WARNING' as NotificationType,
      title: 'Limite do Plano Proximo',
      description: 'Voce esta proximo do limite de mensagens/instancias do seu plano. Considere fazer upgrade.',
      actionUrl: '/admin/billing',
      actionLabel: 'Ver Planos',
      isGlobal: false,
    },
  },
  {
    id: 'maintenance',
    label: 'Manutencao Programada',
    icon: Settings,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
    data: {
      type: 'SYSTEM' as NotificationType,
      title: 'Manutencao Programada',
      description: 'Uma manutencao programada ocorrera em breve. O sistema pode ficar indisponivel por alguns minutos.',
      isGlobal: true,
    },
  },
  {
    id: 'new-feature',
    label: 'Nova Funcionalidade',
    icon: Zap,
    color: 'text-sky-500',
    bgColor: 'bg-sky-500/10',
    data: {
      type: 'INFO' as NotificationType,
      title: 'Nova Funcionalidade Disponivel',
      description: 'Temos novidades! Confira as novas funcionalidades que acabaram de ser lancadas.',
      isGlobal: true,
    },
  },
  {
    id: 'announcement',
    label: 'Comunicado Geral',
    icon: Megaphone,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    data: {
      type: 'INFO' as NotificationType,
      title: 'Comunicado Importante',
      description: '',
      isGlobal: true,
    },
  },
  {
    id: 'report-ready',
    label: 'Relatorio Pronto',
    icon: FileText,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
    data: {
      type: 'SUCCESS' as NotificationType,
      title: 'Relatorio Pronto',
      description: 'Seu relatorio foi gerado e esta pronto para download.',
      actionUrl: '/projetos',
      actionLabel: 'Ver Relatorio',
      isGlobal: false,
    },
  },
]

interface Notification {
  id: string
  type: NotificationType
  title: string
  description: string
  actionUrl?: string | null
  actionLabel?: string | null
  source?: string | null
  sourceId?: string | null
  metadata?: Record<string, any> | null
  userId?: string | null
  organizationId?: string | null
  role?: string | null
  isGlobal: boolean
  isActive: boolean
  scheduledFor?: string | null
  expiresAt?: string | null
  createdAt: string
  updatedAt: string
  _count?: { reads: number }
}


// Helper to fetch with auth
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.message || 'Erro na requisicao')
  }
  return data
}

export default function NotificationsAdminPage() {
  const queryClient = useQueryClient()

  // State
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const limit = 20
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
  const [formData, setFormData] = useState({
    type: 'INFO' as NotificationType,
    title: '',
    description: '',
    actionUrl: '',
    actionLabel: '',
    isGlobal: true,
    userId: '',
    organizationId: '',
    role: '',
    scheduledFor: '',
    expiresAt: '',
  })

  // Debounce da busca — evita requests a cada keystroke
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Queries — search e type passados ao servidor
  const { data: notificationsData, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ['notifications', typeFilter, debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('limit', String(limit))
      params.append('page', String(page))
      if (typeFilter !== 'all') params.append('type', typeFilter)
      if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim())
      return fetchWithAuth(`/api/v1/notifications?${params}`)
    },
  })

  // Helper to format datetime-local value to ISO string
  const formatDatetimeToISO = (value: string): string | null => {
    if (!value) return null
    try {
      // datetime-local returns "2024-01-15T10:30", convert to ISO 8601
      const date = new Date(value)
      return date.toISOString()
    } catch {
      return null
    }
  }

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return fetchWithAuth('/api/v1/notifications', {
        method: 'POST',
        body: JSON.stringify({
          type: data.type,
          title: data.title,
          description: data.description,
          actionUrl: data.actionUrl || null,
          actionLabel: data.actionLabel || null,
          isGlobal: data.isGlobal,
          userId: data.userId || null,
          organizationId: data.organizationId || null,
          role: data.role || null,
          scheduledFor: formatDatetimeToISO(data.scheduledFor),
          expiresAt: formatDatetimeToISO(data.expiresAt),
        }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setCreateDialogOpen(false)
      resetForm()
      toast.success('Notificacao criada com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar notificacao')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      return fetchWithAuth(`/api/v1/notifications/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setEditDialogOpen(false)
      setSelectedNotification(null)
      resetForm()
      toast.success('Notificacao atualizada com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao atualizar notificacao')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return fetchWithAuth(`/api/v1/notifications/${id}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setDeleteDialogOpen(false)
      setSelectedNotification(null)
      toast.success('Notificacao excluida com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao excluir notificacao')
    },
  })

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      return fetchWithAuth('/api/v1/notifications/cleanup', {
        method: 'POST',
      })
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success(data.message || 'Notificacoes expiradas removidas')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao limpar notificacoes')
    },
  })

  // Helpers
  const resetForm = () => {
    setFormData({
      type: 'INFO',
      title: '',
      description: '',
      actionUrl: '',
      actionLabel: '',
      isGlobal: true,
      userId: '',
      organizationId: '',
      role: '',
      scheduledFor: '',
      expiresAt: '',
    })
  }

  const handleEdit = (notification: Notification) => {
    setSelectedNotification(notification)
    setFormData({
      type: notification.type,
      title: notification.title,
      description: notification.description,
      actionUrl: notification.actionUrl || '',
      actionLabel: notification.actionLabel || '',
      isGlobal: notification.isGlobal,
      userId: notification.userId || '',
      organizationId: notification.organizationId || '',
      role: notification.role || '',
      scheduledFor: notification.scheduledFor || '',
      expiresAt: notification.expiresAt || '',
    })
    setEditDialogOpen(true)
  }

  const handleDelete = (notification: Notification) => {
    setSelectedNotification(notification)
    setDeleteDialogOpen(true)
  }

  // Get target display
  const getTargetDisplay = (notification: Notification) => {
    if (notification.isGlobal) {
      return (
        <Badge variant="outline" className="gap-1">
          <Globe className="h-3 w-3" aria-hidden="true" />
          Global
        </Badge>
      )
    }
    if (notification.userId) {
      return (
        <Badge variant="outline" className="gap-1">
          <User className="h-3 w-3" aria-hidden="true" />
          Usuario
        </Badge>
      )
    }
    if (notification.organizationId) {
      return (
        <Badge variant="outline" className="gap-1">
          <Building className="h-3 w-3" aria-hidden="true" />
          Organizacao
        </Badge>
      )
    }
    if (notification.role) {
      return (
        <Badge variant="outline" className="gap-1">
          <Users className="h-3 w-3" aria-hidden="true" />
          {notification.role}
        </Badge>
      )
    }
    return <span className="text-muted-foreground">-</span>
  }

  // API retorna { data: { data: [...], pagination: {...} } }
  const notifications = Array.isArray(notificationsData?.data?.data)
    ? notificationsData.data.data
    : Array.isArray(notificationsData?.data)
      ? notificationsData.data
      : []

  const pagination = notificationsData?.data?.pagination ?? null
  const total = pagination?.total ?? notifications.length
  const totalPages = pagination?.totalPages ?? 1

  // Sem filtro client-side — servidor já filtra por search e type
  const filteredNotifications = notifications

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Gerenciamento de Notificacoes
          </h1>
          <p className="text-muted-foreground mt-1">
            Crie e gerencie notificacoes para usuarios e organizacoes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setCleanupDialogOpen(true)}
            disabled={cleanupMutation.isPending}
            aria-label="Limpar notificacoes expiradas"
          >
            {cleanupMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            Limpar Expiradas
          </Button>
          <Button
            onClick={() => {
              resetForm()
              setCreateDialogOpen(true)
            }}
            aria-label="Criar nova notificacao"
          >
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            Nova Notificacao
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl">{total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Globais</CardDescription>
            <CardTitle className="text-2xl">
              {notifications.filter((n: Notification) => n.isGlobal).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ativas</CardDescription>
            <CardTitle className="text-2xl">
              {notifications.filter((n: Notification) => n.isActive).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Agendadas</CardDescription>
            <CardTitle className="text-2xl">
              {notifications.filter((n: Notification) => n.scheduledFor).length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Buscar notificacoes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                aria-label="Buscar notificacoes"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filtrar por tipo">
                <Filter className="h-4 w-4 mr-2" aria-hidden="true" />
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {Object.entries(NOTIFICATION_TYPE_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <config.icon className={`h-4 w-4 ${config.color}`} />
                      {config.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => refetch()} aria-label="Atualizar lista">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notificacoes Rapidas</CardTitle>
          <CardDescription>
            Use templates prontos para enviar notificacoes comuns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {NOTIFICATION_TEMPLATES.map((template) => {
              const TemplateIcon = template.icon
              return (
                <button
                  key={template.id}
                  type="button"
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 transition-colors text-center group"
                  onClick={() => {
                    setFormData({
                      type: template.data.type,
                      title: template.data.title,
                      description: template.data.description,
                      actionUrl: template.data.actionUrl || '',
                      actionLabel: template.data.actionLabel || '',
                      isGlobal: template.data.isGlobal,
                      userId: '',
                      organizationId: '',
                      role: '',
                      scheduledFor: '',
                      expiresAt: '',
                    })
                    setCreateDialogOpen(true)
                  }}
                >
                  <div className={`p-2.5 rounded-lg ${template.bgColor} group-hover:scale-110 transition-transform`}>
                    <TemplateIcon className={`h-5 w-5 ${template.color}`} aria-hidden="true" />
                  </div>
                  <span className="text-xs font-medium leading-tight">{template.label}</span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-8 text-center space-y-4">
              <AlertTriangle className="h-12 w-12 mx-auto text-destructive/50" aria-hidden="true" />
              <p className="text-muted-foreground">
                {queryError instanceof Error ? queryError.message : 'Erro ao carregar notificacoes'}
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                Tentar novamente
              </Button>
            </div>
          ) : isLoading ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">Nenhuma notificacao encontrada</p>
            </div>
          ) : (
            <Table aria-label="Lista de notificacoes">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Tipo</TableHead>
                  <TableHead>Titulo</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Leituras</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead className="w-12">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotifications.map((notification: Notification) => {
                  const typeConfig = NOTIFICATION_TYPE_CONFIG[notification.type]
                  const TypeIcon = typeConfig?.icon || Info
                  return (
                    <TableRow key={notification.id}>
                      <TableCell>
                        <div className={`p-2 rounded-lg w-fit ${typeConfig?.bgColor || 'bg-gray-500/10'}`}>
                          <TypeIcon className={`h-4 w-4 ${typeConfig?.color || 'text-gray-500'}`} aria-hidden="true" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{notification.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {notification.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{getTargetDisplay(notification)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          <Eye className="h-3 w-3 mr-1" aria-hidden="true" />
                          {notification._count?.reads || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={notification.isActive ? 'default' : 'secondary'}>
                          {notification.isActive ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {safeFormatDate(notification.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Acoes">
                              <MoreVertical className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(notification)}>
                              <Pencil className="h-4 w-4 mr-2" aria-hidden="true" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(notification)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                              Excluir
                            </DropdownMenuItem>
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
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Página {page} de {totalPages} ({total} notificações)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="create-notification-description">
          <DialogHeader>
            <DialogTitle>
              Nova Notificacao
            </DialogTitle>
            <DialogDescription id="create-notification-description">
              Crie uma notificacao para enviar aos usuarios
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Type Selection */}
            <div className="space-y-2">
              <Label htmlFor="notification-type">Tipo da Notificacao</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value as NotificationType })}
              >
                <SelectTrigger id="notification-type" aria-label="Selecionar tipo">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(NOTIFICATION_TYPE_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <config.icon className={`h-4 w-4 ${config.color}`} />
                        {config.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="notification-title">Titulo *</Label>
              <Input
                id="notification-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Titulo da notificacao"
                maxLength={200}
                aria-required="true"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="notification-description">Descricao *</Label>
              <Textarea
                id="notification-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Conteudo da notificacao..."
                rows={3}
                aria-required="true"
              />
            </div>

            {/* Action URL */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="notification-url">URL de Acao (opcional)</Label>
                <Input
                  id="notification-url"
                  value={formData.actionUrl}
                  onChange={(e) => setFormData({ ...formData, actionUrl: e.target.value })}
                  placeholder="https://..."
                  type="url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notification-label">Texto do Botao (opcional)</Label>
                <Input
                  id="notification-label"
                  value={formData.actionLabel}
                  onChange={(e) => setFormData({ ...formData, actionLabel: e.target.value })}
                  placeholder="Ver detalhes"
                  maxLength={50}
                />
              </div>
            </div>

            {/* Target */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Destino</Label>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-lg border">
                <Switch
                  id="notification-global"
                  checked={formData.isGlobal}
                  onCheckedChange={(checked) => setFormData({ ...formData, isGlobal: checked })}
                />
                <Label htmlFor="notification-global" className="flex items-center gap-2 cursor-pointer">
                  <Globe className="h-4 w-4" aria-hidden="true" />
                  Notificacao Global (todos os usuarios)
                </Label>
              </div>
              {!formData.isGlobal && (
                <div className="space-y-4 p-4 rounded-lg border">
                  <p className="text-sm text-muted-foreground">
                    Especifique o destino da notificacao:
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="target-user">ID do Usuario</Label>
                      <Input
                        id="target-user"
                        value={formData.userId}
                        onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                        placeholder="UUID do usuario"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="target-org">ID da Organizacao</Label>
                      <Input
                        id="target-org"
                        value={formData.organizationId}
                        onChange={(e) => setFormData({ ...formData, organizationId: e.target.value })}
                        placeholder="UUID da organizacao"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="target-role">Role</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(value) => setFormData({ ...formData, role: value })}
                    >
                      <SelectTrigger id="target-role" aria-label="Selecionar role">
                        <SelectValue placeholder="Selecione uma role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="master">Master</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Scheduling */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="notification-scheduled" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" aria-hidden="true" />
                  Agendar para (opcional)
                </Label>
                <Input
                  id="notification-scheduled"
                  type="datetime-local"
                  value={formData.scheduledFor}
                  onChange={(e) => setFormData({ ...formData, scheduledFor: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Horário: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notification-expires" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  Expira em (opcional)
                </Label>
                <Input
                  id="notification-expires"
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Horário: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate(formData)}
              disabled={createMutation.isPending || !formData.title || !formData.description}
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              )}
              Criar Notificacao
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl" aria-describedby="edit-notification-description">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" aria-hidden="true" />
              Editar Notificacao
            </DialogTitle>
            <DialogDescription id="edit-notification-description">
              Atualize os dados da notificacao
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Titulo</Label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Titulo da notificacao"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Descricao</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Conteudo da notificacao..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-url">URL de Acao</Label>
                <Input
                  id="edit-url"
                  value={formData.actionUrl}
                  onChange={(e) => setFormData({ ...formData, actionUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-label">Texto do Botao</Label>
                <Input
                  id="edit-label"
                  value={formData.actionLabel}
                  onChange={(e) => setFormData({ ...formData, actionLabel: e.target.value })}
                  placeholder="Ver detalhes"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => selectedNotification && updateMutation.mutate({
                id: selectedNotification.id,
                data: {
                  title: formData.title,
                  description: formData.description,
                  actionUrl: formData.actionUrl || undefined,
                  actionLabel: formData.actionLabel || undefined,
                },
              })}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              )}
              Salvar Alteracoes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cleanup Confirmation */}
      <AlertDialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar Notificações Expiradas</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover todas as notificações expiradas. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                cleanupMutation.mutate()
                setCleanupDialogOpen(false)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cleanupMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              )}
              Limpar Expiradas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusao</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a notificacao &quot;{selectedNotification?.title}&quot;?
              Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedNotification && deleteMutation.mutate(selectedNotification.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
