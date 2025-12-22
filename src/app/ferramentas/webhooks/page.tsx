'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Webhook,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Activity,
  Eye,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  Zap,
  Power,
  PowerOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { api } from '@/igniter.client'
import { useAuth } from '@/lib/auth/auth-provider'

// Webhook type from API
interface WebhookType {
  id: string
  url: string
  events: string[]
  description: string | null
  isActive: boolean
  secret?: string | null
  organizationId: string
  createdAt: string
  _count?: {
    deliveries: number
  }
}

interface Delivery {
  id: string
  webhookId: string
  event: string
  status: 'success' | 'failure' | 'pending'
  statusCode?: number
  response?: string
  error?: string
  attempts: number
  createdAt: string
}

// Available webhook events from the backend
const WEBHOOK_EVENTS = [
  { key: 'instance.created', label: 'Instancia Criada' },
  { key: 'instance.updated', label: 'Instancia Atualizada' },
  { key: 'instance.deleted', label: 'Instancia Deletada' },
  { key: 'instance.connected', label: 'Instancia Conectada' },
  { key: 'instance.disconnected', label: 'Instancia Desconectada' },
  { key: 'message.received', label: 'Mensagem Recebida' },
  { key: 'message.sent', label: 'Mensagem Enviada' },
  { key: 'organization.updated', label: 'Organizacao Atualizada' },
  { key: 'user.invited', label: 'Usuario Convidado' },
  { key: 'user.joined', label: 'Usuario Entrou' },
  { key: 'user.removed', label: 'Usuario Removido' },
]

export default function WebhooksPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // State
  const [searchQuery, setSearchQuery] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deliveriesModalOpen, setDeliveriesModalOpen] = useState(false)
  const [deliveryDetailModalOpen, setDeliveryDetailModalOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookType | null>(null)
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null)
  const [webhookToDelete, setWebhookToDelete] = useState<WebhookType | null>(null)
  const [formData, setFormData] = useState({
    url: '',
    events: [] as string[],
    isActive: true,
    secret: '',
    description: '',
  })

  // Permissions
  const currentOrgId = user?.currentOrgId
  const organizationRole = (user as any)?.organizationRole || null
  const isAdmin = user?.role === 'admin'
  const canManageWebhooks = isAdmin || organizationRole === 'master' || organizationRole === 'manager'

  // Query: List webhooks
  const {
    data: webhooksResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['webhooks', currentOrgId],
    queryFn: async () => {
      const queryParams: Record<string, unknown> = { page: 1, limit: 100 }
      if (currentOrgId && !isAdmin) {
        queryParams.organizationId = currentOrgId
      }
      const response = await api.webhooks.list.query({ query: queryParams })
      return response as unknown as { data: WebhookType[]; pagination: any }
    },
    enabled: !!currentOrgId || isAdmin,
  })

  // Query: List deliveries
  const {
    data: deliveriesResponse,
    isLoading: deliveriesLoading,
    refetch: refetchDeliveries,
  } = useQuery({
    queryKey: ['webhook-deliveries', selectedWebhook?.id],
    queryFn: async () => {
      if (!selectedWebhook) return { data: [] }
      const response = await api.webhooks.listDeliveries.query({
        params: { id: selectedWebhook.id },
        query: { page: 1, limit: 50 },
      } as never)
      return response as unknown as { data: Delivery[] }
    },
    enabled: !!selectedWebhook && deliveriesModalOpen,
  })

  // Mutation: Create webhook
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!currentOrgId) throw new Error('Organizacao nao selecionada')
      return api.webhooks.create.mutate({
        body: {
          url: data.url,
          events: data.events,
          secret: data.secret || undefined,
          description: data.description || undefined,
          organizationId: currentOrgId,
        },
      })
    },
    onSuccess: () => {
      toast.success('Webhook criado com sucesso!')
      setCreateModalOpen(false)
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao criar webhook')
    },
  })

  // Mutation: Update webhook
  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!selectedWebhook) throw new Error('Webhook nao selecionado')
      return (api.webhooks.update as any).mutate({
        id: selectedWebhook.id,
        body: {
          url: data.url,
          events: data.events,
          isActive: data.isActive,
          secret: data.secret || undefined,
          description: data.description || undefined,
        },
      })
    },
    onSuccess: () => {
      toast.success('Webhook atualizado com sucesso!')
      setEditModalOpen(false)
      setSelectedWebhook(null)
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao atualizar webhook')
    },
  })

  // Mutation: Delete webhook
  const deleteMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      return (api.webhooks.delete as any).mutate({ id: webhookId })
    },
    onSuccess: () => {
      toast.success('Webhook excluido com sucesso!')
      setDeleteDialogOpen(false)
      setWebhookToDelete(null)
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao excluir webhook')
    },
  })

  // Mutation: Retry delivery
  const retryMutation = useMutation({
    mutationFn: async (deliveryId: string) => {
      return (api.webhooks.retryDelivery as any).mutate({ deliveryId })
    },
    onSuccess: () => {
      toast.success('Entrega retentada com sucesso!')
      refetchDeliveries()
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao retentar entrega')
    },
  })

  // Mutation: Test webhook
  const testMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      return (api.webhooks.test as any).mutate({ id: webhookId })
    },
    onSuccess: (data: any) => {
      if (data?.success) {
        toast.success(data.message || 'Webhook testado com sucesso!', {
          description: `Status: ${data.statusCode}`,
        })
      } else {
        toast.error(data?.message || 'Falha ao testar webhook', {
          description: data?.error || `Status: ${data?.statusCode || 'Erro'}`,
        })
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao testar webhook')
    },
  })

  // Mutation: Toggle active/inactive
  const toggleMutation = useMutation({
    mutationFn: async ({ webhookId, isActive }: { webhookId: string; isActive: boolean }) => {
      return (api.webhooks.update as any).mutate({
        id: webhookId,
        body: { isActive },
      })
    },
    onSuccess: (_, variables) => {
      toast.success(variables.isActive ? 'Webhook ativado!' : 'Webhook desativado!')
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao alterar status')
    },
  })

  // Helpers
  const resetForm = () => {
    setFormData({ url: '', events: [], isActive: true, secret: '', description: '' })
  }

  const toggleEvent = (event: string) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }))
  }

  const openEditModal = (webhook: WebhookType) => {
    setSelectedWebhook(webhook)
    setFormData({
      url: webhook.url,
      events: webhook.events,
      isActive: webhook.isActive,
      secret: '',
      description: webhook.description || '',
    })
    setEditModalOpen(true)
  }

  const openDeliveriesModal = (webhook: WebhookType) => {
    setSelectedWebhook(webhook)
    setDeliveriesModalOpen(true)
  }

  const openDeleteDialog = (webhook: WebhookType) => {
    setWebhookToDelete(webhook)
    setDeleteDialogOpen(true)
  }

  const openDeliveryDetail = (delivery: Delivery) => {
    setSelectedDelivery(delivery)
    setDeliveryDetailModalOpen(true)
  }

  // Data - Safe extraction
  const webhooks = Array.isArray(webhooksResponse?.data) ? webhooksResponse.data : []
  const deliveries = Array.isArray(deliveriesResponse?.data) ? deliveriesResponse.data : []

  const filteredWebhooks = webhooks.filter((wh) =>
    wh.url.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const activeWebhooks = webhooks.filter((w) => w.isActive).length
  const totalDeliveries = webhooks.reduce((acc, w) => acc + (w._count?.deliveries || 0), 0)

  // No organization selected
  if (!currentOrgId && !isAdmin) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/ferramentas">Ferramentas</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Webhooks</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Webhook className="h-16 w-16 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Sem Organizacao</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Voce precisa estar associado a uma organizacao para gerenciar webhooks.
          </p>
        </div>
      </>
    )
  }

  // No permission
  if (!canManageWebhooks) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/ferramentas">Ferramentas</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Webhooks</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-10 w-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Acesso Negado</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Apenas administradores, masters ou gerentes podem gerenciar webhooks.
          </p>
          <Button variant="outline" onClick={() => window.history.back()}>
            Voltar
          </Button>
        </div>
      </>
    )
  }

  // Error state
  if (error) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/ferramentas">Ferramentas</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Webhooks</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="p-8">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar webhooks</AlertTitle>
            <AlertDescription>
              {(error as any)?.message || 'Erro desconhecido. Tente novamente.'}
            </AlertDescription>
          </Alert>
          <Button onClick={() => refetch()} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/ferramentas">Ferramentas</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Webhooks</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 space-y-6 p-8 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Webhooks</h1>
            <p className="text-muted-foreground">
              Configure webhooks para receber notificacoes de eventos em tempo real
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Webhook
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de Webhooks</CardTitle>
              <Webhook className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{webhooks.length}</div>
              <p className="text-xs text-muted-foreground">{activeWebhooks} ativos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de Entregas</CardTitle>
              <Send className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalDeliveries}</div>
              <p className="text-xs text-muted-foreground">Eventos enviados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">Operacional</div>
              <p className="text-xs text-muted-foreground">Sistema funcionando</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar webhooks por URL..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredWebhooks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Webhook className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Nenhum webhook encontrado</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery
                    ? 'Tente buscar com outro termo'
                    : 'Crie seu primeiro webhook para comecar'}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setCreateModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Webhook
                  </Button>
                )}
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Eventos</TableHead>
                      <TableHead>Entregas</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWebhooks.map((webhook) => (
                      <TableRow key={webhook.id}>
                        <TableCell className="font-mono text-sm max-w-xs truncate">
                          {webhook.url}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{webhook.events.length} eventos</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => openDeliveriesModal(webhook)}
                            className="p-0 h-auto"
                          >
                            {webhook._count?.deliveries || 0} entregas
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge variant={webhook.isActive ? 'default' : 'secondary'}>
                            {webhook.isActive ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Acoes</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => testMutation.mutate(webhook.id)}
                                disabled={testMutation.isPending}
                              >
                                <Zap className="h-4 w-4 mr-2" />
                                {testMutation.isPending ? 'Testando...' : 'Testar Webhook'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditModal(webhook)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openDeliveriesModal(webhook)}>
                                <Eye className="h-4 w-4 mr-2" />
                                Ver Entregas
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => toggleMutation.mutate({
                                  webhookId: webhook.id,
                                  isActive: !webhook.isActive,
                                })}
                                disabled={toggleMutation.isPending}
                              >
                                {webhook.isActive ? (
                                  <>
                                    <PowerOff className="h-4 w-4 mr-2" />
                                    Desativar
                                  </>
                                ) : (
                                  <>
                                    <Power className="h-4 w-4 mr-2" />
                                    Ativar
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => openDeleteDialog(webhook)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo Webhook</DialogTitle>
            <DialogDescription>
              Configure um webhook para receber notificacoes de eventos
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-url">URL do Endpoint</Label>
              <Input
                id="create-url"
                placeholder="https://seu-dominio.com/webhook"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-description">Descricao (opcional)</Label>
              <Input
                id="create-description"
                placeholder="Descricao do webhook"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-secret">Secret (opcional)</Label>
              <Input
                id="create-secret"
                type="password"
                placeholder="Token secreto para validacao (min. 8 caracteres)"
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Sera enviado no header X-Webhook-Secret
              </p>
            </div>

            <div className="space-y-2">
              <Label>Eventos ({formData.events.length} selecionados)</Label>
              <ScrollArea className="h-48 rounded-md border p-4">
                <div className="space-y-2">
                  {WEBHOOK_EVENTS.map((event) => (
                    <div key={event.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`event-${event.key}`}
                        checked={formData.events.includes(event.key)}
                        onCheckedChange={() => toggleEvent(event.key)}
                      />
                      <label htmlFor={`event-${event.key}`} className="text-sm cursor-pointer flex-1">
                        <span className="font-mono text-xs text-muted-foreground mr-2">{event.key}</span>
                        <span>{event.label}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="create-active">Ativar webhook</Label>
                <p className="text-xs text-muted-foreground">
                  Comecar a receber eventos imediatamente
                </p>
              </div>
              <Switch
                id="create-active"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateModalOpen(false)
                resetForm()
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate(formData)}
              disabled={createMutation.isPending || !formData.url || formData.events.length === 0}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Webhook'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Webhook</DialogTitle>
            <DialogDescription>Atualize as configuracoes do webhook</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-url">URL do Endpoint</Label>
              <Input
                id="edit-url"
                placeholder="https://seu-dominio.com/webhook"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descricao (opcional)</Label>
              <Input
                id="edit-description"
                placeholder="Descricao do webhook"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-secret">Novo Secret (deixe vazio para manter)</Label>
              <Input
                id="edit-secret"
                type="password"
                placeholder="Token secreto para validacao"
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Eventos ({formData.events.length} selecionados)</Label>
              <ScrollArea className="h-48 rounded-md border p-4">
                <div className="space-y-2">
                  {WEBHOOK_EVENTS.map((event) => (
                    <div key={event.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-event-${event.key}`}
                        checked={formData.events.includes(event.key)}
                        onCheckedChange={() => toggleEvent(event.key)}
                      />
                      <label htmlFor={`edit-event-${event.key}`} className="text-sm cursor-pointer flex-1">
                        <span className="font-mono text-xs text-muted-foreground mr-2">{event.key}</span>
                        <span>{event.label}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-active">Status do webhook</Label>
                <p className="text-xs text-muted-foreground">
                  {formData.isActive ? 'Ativo - recebendo eventos' : 'Inativo'}
                </p>
              </div>
              <Switch
                id="edit-active"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditModalOpen(false)
                setSelectedWebhook(null)
                resetForm()
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => updateMutation.mutate(formData)}
              disabled={updateMutation.isPending || !formData.url || formData.events.length === 0}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Alteracoes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deliveries Dialog */}
      <Dialog open={deliveriesModalOpen} onOpenChange={setDeliveriesModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Entregas do Webhook</DialogTitle>
            <DialogDescription>
              Historico de entregas para {selectedWebhook?.url}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {deliveriesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : deliveries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Send className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma entrega registrada ainda
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tentativas</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell className="font-mono text-sm">
                          {delivery.event}
                        </TableCell>
                        <TableCell>
                          {delivery.status === 'success' && (
                            <Badge variant="default" className="gap-1 bg-green-600">
                              <CheckCircle2 className="h-3 w-3" />
                              Sucesso
                            </Badge>
                          )}
                          {delivery.status === 'failure' && (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              Falhou
                            </Badge>
                          )}
                          {delivery.status === 'pending' && (
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="h-3 w-3" />
                              Pendente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{delivery.attempts}x</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(delivery.createdAt), {
                            locale: ptBR,
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeliveryDetail(delivery)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {delivery.status === 'failure' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => retryMutation.mutate(delivery.id)}
                                disabled={retryMutation.isPending}
                              >
                                <RefreshCw className={`h-4 w-4 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delivery Detail Dialog */}
      <Dialog open={deliveryDetailModalOpen} onOpenChange={setDeliveryDetailModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Entrega</DialogTitle>
            <DialogDescription>
              Informacoes completas sobre a entrega do webhook
            </DialogDescription>
          </DialogHeader>

          {selectedDelivery && (
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-xs text-muted-foreground">Evento</Label>
                <p className="font-mono text-sm mt-1">{selectedDelivery.event}</p>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Status Code</Label>
                <p className="font-mono text-sm mt-1">
                  {selectedDelivery.statusCode || 'N/A'}
                </p>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Tentativas</Label>
                <p className="text-sm mt-1">{selectedDelivery.attempts}</p>
              </div>

              {selectedDelivery.response && (
                <div>
                  <Label className="text-xs text-muted-foreground">Resposta</Label>
                  <ScrollArea className="h-32 rounded-md border p-3 mt-1">
                    <pre className="text-xs font-mono">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(selectedDelivery.response), null, 2)
                        } catch {
                          return selectedDelivery.response
                        }
                      })()}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              {selectedDelivery.error && (
                <div>
                  <Label className="text-xs text-muted-foreground text-destructive">Erro</Label>
                  <ScrollArea className="h-32 rounded-md border border-destructive p-3 mt-1">
                    <pre className="text-xs font-mono text-destructive">
                      {selectedDelivery.error}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">Data</Label>
                <p className="text-sm mt-1">
                  {new Date(selectedDelivery.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeliveryDetailModalOpen(false)
                setSelectedDelivery(null)
              }}
            >
              Fechar
            </Button>
            {selectedDelivery?.status === 'failure' && (
              <Button
                onClick={() => {
                  retryMutation.mutate(selectedDelivery.id)
                  setDeliveryDetailModalOpen(false)
                }}
                disabled={retryMutation.isPending}
              >
                {retryMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Retentar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este webhook?
              <br />
              <br />
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                {webhookToDelete?.url}
              </span>
              <br />
              <br />
              Esta acao nao pode ser desfeita e todas as entregas serao perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => webhookToDelete && deleteMutation.mutate(webhookToDelete.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
