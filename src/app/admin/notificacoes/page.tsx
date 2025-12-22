'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Bell,
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
  Send,
  Calendar,
  Clock,
  Eye,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/lib/auth'

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

// Helper to format dates
function safeFormatDate(date: string | null | undefined): string {
  if (!date) return 'N/A'
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return 'N/A'
    return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
  } catch {
    return 'N/A'
  }
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
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // State
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
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

  // Queries
  const { data: notificationsData, isLoading, refetch } = useQuery({
    queryKey: ['notifications', typeFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('limit', '50')
      if (typeFilter !== 'all') params.append('type', typeFilter)
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

  // Filter notifications by search
  const filteredNotifications = notifications.filter((n: Notification) =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Bell className="h-8 w-8 text-primary" aria-hidden="true" />
            Gerenciamento de Notificacoes
          </h1>
          <p className="text-muted-foreground mt-1">
            Crie e gerencie notificacoes para usuarios e organizacoes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => cleanupMutation.mutate()}
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
            <CardTitle className="text-2xl">{notifications.length}</CardTitle>
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" aria-hidden="true" />
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
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="create-notification-description">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" aria-hidden="true" />
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
