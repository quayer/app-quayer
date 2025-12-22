'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, MoreVertical, Webhook, CheckCircle2, XCircle, RefreshCw, Eye, Trash2, Play, Power, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { listWebhooksAction } from '@/app/admin/actions'
import { CreateWebhookDialog } from '@/app/integracoes/webhooks/create-webhook-dialog'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '@/igniter.client'

// Helper para formatar datas com segurança
function safeFormatDate(date: any): string {
  if (!date) return 'Nunca'
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return 'Nunca'
    return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
  } catch {
    return 'Nunca'
  }
}

interface WebhookType {
  id: string
  url: string
  events: string[]
  isActive: boolean
  organizationId?: string | null
  organization?: { name: string } | null
  instance?: { name: string } | null
  lastExecutedAt?: Date | string | null
  createdAt?: Date | string
  secret?: string
}

export default function AdminWebhooksPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isMounted, setIsMounted] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const queryClient = useQueryClient()

  // Dialog states
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookType | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  // Hydration fix: esperar montagem no cliente
  useEffect(() => {
    setIsMounted(true)
  }, [])

  const handleCreateSuccess = () => {
    setIsCreateDialogOpen(false)
    queryClient.invalidateQueries({ queryKey: ['admin-webhooks'] })
  }

  // Fetch webhooks usando Server Action (como outras páginas admin)
  const { data: webhooksData, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-webhooks'],
    queryFn: async () => {
      const result = await listWebhooksAction({ page: 1, limit: 100 })
      if (result.error) {
        throw new Error(result.error.message || 'Erro ao carregar webhooks')
      }
      return result.data
    },
    enabled: isMounted,
  })
  const webhooks = (webhooksData?.data || []) as WebhookType[]

  // Toggle webhook mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await (api.webhooks.update as any).mutate({
        id,
        body: { isActive: !isActive },
      })
      if (response.error) throw new Error('Erro ao atualizar webhook')
      return response.data
    },
    onSuccess: () => {
      toast.success('Webhook atualizado')
      queryClient.invalidateQueries({ queryKey: ['admin-webhooks'] })
    },
    onError: () => {
      toast.error('Erro ao atualizar webhook')
    },
  })

  // Delete webhook mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await (api.webhooks.delete as any).mutate({ id })
      if (response.error) throw new Error('Erro ao excluir webhook')
      return response.data
    },
    onSuccess: () => {
      toast.success('Webhook excluído')
      setIsDeleteOpen(false)
      setSelectedWebhook(null)
      queryClient.invalidateQueries({ queryKey: ['admin-webhooks'] })
    },
    onError: () => {
      toast.error('Erro ao excluir webhook')
    },
  })

  // Test webhook mutation using API endpoint
  const testMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      const response = await (api.webhooks.test as any).mutate({ id: webhookId })
      return response
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
    onError: () => {
      toast.error('Erro ao testar webhook')
    },
  })

  // Handle test using API
  const handleTest = (webhook: WebhookType) => {
    testMutation.mutate(webhook.id)
  }

  // Handlers
  const handleViewDetails = (webhook: WebhookType) => {
    setSelectedWebhook(webhook)
    setIsDetailsOpen(true)
  }

  const handleToggle = (webhook: WebhookType) => {
    toggleMutation.mutate({ id: webhook.id, isActive: webhook.isActive })
  }

  const handleDeleteClick = (webhook: WebhookType) => {
    setSelectedWebhook(webhook)
    setIsDeleteOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (selectedWebhook) {
      deleteMutation.mutate(selectedWebhook.id)
    }
  }

  // Calculate statistics
  const stats = {
    total: webhooks.length,
    active: webhooks.filter((w: any) => w.isActive).length,
    inactive: webhooks.filter((w: any) => !w.isActive).length,
  }

  // Filter webhooks
  const filteredWebhooks = webhooks.filter((webhook: any) =>
    webhook.url?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    webhook.events?.some((e: string) => e.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  if (error) {
    return (
      <div className="pt-6">
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar webhooks: {(error as any)?.message || 'Erro desconhecido'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 pt-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Webhooks Globais</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie todos os webhooks configurados no sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Webhook
          </Button>
        </div>
      </div>

      {/* Dialog de criação */}
      <CreateWebhookDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* Stats Cards - Compact */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Webhook className="h-3.5 w-3.5" />
              Total
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              Ativos
            </div>
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          </CardContent>
        </Card>
        <Card className="border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <XCircle className="h-3.5 w-3.5 text-red-500" />
              Inativos
            </div>
            <p className="text-2xl font-bold text-red-600">{stats.inactive}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Table */}
      <Card>
        <div className="p-4 border-b">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por URL ou evento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>
        <div className="p-4">
          {!isMounted || isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredWebhooks.length === 0 ? (
            <div className="text-center py-12">
              <Webhook className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                Nenhum webhook encontrado
              </h3>
              <p className="text-muted-foreground mb-4">
                Configure o primeiro webhook para começar
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Webhook
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Eventos</TableHead>
                  <TableHead>Organização</TableHead>
                  <TableHead>Instância</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última Execução</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWebhooks.map((webhook: any) => (
                  <TableRow key={webhook.id}>
                    <TableCell className="font-medium max-w-xs truncate">
                      {webhook.url}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {webhook.events?.slice(0, 2).map((event: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {event}
                          </Badge>
                        ))}
                        {webhook.events?.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{webhook.events.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{webhook.organization?.name || '-'}</TableCell>
                    <TableCell>{webhook.instance?.name || 'Global'}</TableCell>
                    <TableCell>
                      <Badge variant={webhook.isActive ? 'default' : 'secondary'}>
                        {webhook.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {safeFormatDate(webhook.lastExecutedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewDetails(webhook)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleTest(webhook)} disabled={testMutation.isPending && testMutation.variables === webhook.id}>
                            {testMutation.isPending && testMutation.variables === webhook.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-2" />
                            )}
                            Testar Webhook
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleToggle(webhook)} disabled={toggleMutation.isPending}>
                            <Power className="h-4 w-4 mr-2" />
                            {webhook.isActive ? 'Desativar' : 'Ativar'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDeleteClick(webhook)}
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
          )}
        </div>
      </Card>

      {/* Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Detalhes do Webhook
            </DialogTitle>
            <DialogDescription>
              Informações completas do webhook
            </DialogDescription>
          </DialogHeader>
          {selectedWebhook && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                <div>
                  <Label className="text-xs text-muted-foreground">URL</Label>
                  <p className="text-sm font-mono break-all">{selectedWebhook.url}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge variant={selectedWebhook.isActive ? 'default' : 'secondary'}>
                      {selectedWebhook.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Eventos</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedWebhook.events?.map((event, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {event}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Organização</Label>
                  <p className="text-sm">{selectedWebhook.organization?.name || 'Global'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Instância</Label>
                  <p className="text-sm">{selectedWebhook.instance?.name || 'Todas'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Última Execução</Label>
                  <p className="text-sm">{safeFormatDate(selectedWebhook.lastExecutedAt)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Criado em</Label>
                  <p className="text-sm">
                    {selectedWebhook.createdAt
                      ? format(new Date(selectedWebhook.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : '-'}
                  </p>
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Webhook</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este webhook? Esta ação não pode ser desfeita.
              <div className="mt-2 p-2 bg-muted rounded text-xs font-mono break-all">
                {selectedWebhook?.url}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
