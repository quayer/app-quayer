'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface WebhookType {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret?: string;
  organizationId: string;
  createdAt: Date;
  _count?: {
    deliveries: number;
  };
}

interface Delivery {
  id: string;
  webhookId: string;
  event: string;
  status: 'success' | 'failed' | 'pending';
  statusCode?: number;
  response?: string;
  error?: string;
  attempts: number;
  createdAt: Date;
}

const WEBHOOK_EVENTS = [
  'message.received',
  'message.sent',
  'message.read',
  'session.opened',
  'session.closed',
  'contact.created',
  'contact.updated',
  'instance.connected',
  'instance.disconnected',
];

export default function WebhooksPage() {
  const router = useRouter();
  const [webhooks, setWebhooks] = useState<WebhookType[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deliveriesModalOpen, setDeliveriesModalOpen] = useState(false);
  const [deliveryDetailModalOpen, setDeliveryDetailModalOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookType | null>(null);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [formData, setFormData] = useState({
    url: '',
    events: [] as string[],
    isActive: true,
    secret: '',
  });

  const loadWebhooks = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/webhooks', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Erro ao carregar webhooks');

      const data = await response.json();
      setWebhooks(data.data || []);
    } catch (error) {
      console.error('Erro ao carregar webhooks:', error);
      toast.error('Erro ao carregar webhooks');
    } finally {
      setLoading(false);
    }
  };

  const loadDeliveries = async (webhookId: string) => {
    try {
      setDeliveriesLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/webhooks/${webhookId}/deliveries`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Erro ao carregar entregas');

      const data = await response.json();
      setDeliveries(data.data || []);
    } catch (error) {
      console.error('Erro ao carregar entregas:', error);
      toast.error('Erro ao carregar entregas');
    } finally {
      setDeliveriesLoading(false);
    }
  };

  useEffect(() => {
    loadWebhooks();
  }, []);

  const handleCreate = async () => {
    if (!formData.url.trim()) {
      toast.error('URL do webhook é obrigatória');
      return;
    }
    if (formData.events.length === 0) {
      toast.error('Selecione pelo menos um evento');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Erro ao criar webhook');

      toast.success('Webhook criado com sucesso!');
      setCreateModalOpen(false);
      setFormData({ url: '', events: [], isActive: true, secret: '' });
      loadWebhooks();
    } catch (error) {
      console.error('Erro ao criar webhook:', error);
      toast.error('Erro ao criar webhook');
    }
  };

  const handleEdit = async () => {
    if (!selectedWebhook || !formData.url.trim()) {
      toast.error('URL do webhook é obrigatória');
      return;
    }
    if (formData.events.length === 0) {
      toast.error('Selecione pelo menos um evento');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/webhooks/${selectedWebhook.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Erro ao editar webhook');

      toast.success('Webhook atualizado com sucesso!');
      setEditModalOpen(false);
      setSelectedWebhook(null);
      setFormData({ url: '', events: [], isActive: true, secret: '' });
      loadWebhooks();
    } catch (error) {
      console.error('Erro ao editar webhook:', error);
      toast.error('Erro ao editar webhook');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este webhook?')) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/webhooks/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Erro ao excluir webhook');

      toast.success('Webhook excluído com sucesso!');
      loadWebhooks();
    } catch (error) {
      console.error('Erro ao excluir webhook:', error);
      toast.error('Erro ao excluir webhook');
    }
  };

  const handleTestWebhook = async (webhook: WebhookType) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/webhooks/${webhook.id}/test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Erro ao testar webhook');

      toast.success('Webhook testado! Verifique as entregas.');
    } catch (error) {
      console.error('Erro ao testar webhook:', error);
      toast.error('Erro ao testar webhook');
    }
  };

  const handleRetryDelivery = async (deliveryId: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/webhooks/deliveries/${deliveryId}/retry`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Erro ao retentar entrega');

      toast.success('Entrega retentada com sucesso!');
      if (selectedWebhook) {
        loadDeliveries(selectedWebhook.id);
      }
    } catch (error) {
      console.error('Erro ao retentar entrega:', error);
      toast.error('Erro ao retentar entrega');
    }
  };

  const openEditModal = (webhook: WebhookType) => {
    setSelectedWebhook(webhook);
    setFormData({
      url: webhook.url,
      events: webhook.events,
      isActive: webhook.isActive,
      secret: webhook.secret || '',
    });
    setEditModalOpen(true);
  };

  const openDeliveriesModal = (webhook: WebhookType) => {
    setSelectedWebhook(webhook);
    loadDeliveries(webhook.id);
    setDeliveriesModalOpen(true);
  };

  const openDeliveryDetail = (delivery: Delivery) => {
    setSelectedDelivery(delivery);
    setDeliveryDetailModalOpen(true);
  };

  const filteredWebhooks = webhooks.filter((wh) =>
    wh.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeWebhooks = webhooks.filter((w) => w.isActive).length;
  const totalDeliveries = webhooks.reduce((acc, w) => acc + (w._count?.deliveries || 0), 0);

  const toggleEvent = (event: string) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Webhooks</h1>
          <p className="text-muted-foreground">
            Configure webhooks para receber notificações de eventos em tempo real
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} size="default">
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          Novo Webhook
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Webhooks</CardTitle>
            <Webhook className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{webhooks.length}</div>
            <p className="text-xs text-muted-foreground">{activeWebhooks} ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Entregas</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDeliveries}</div>
            <p className="text-xs text-muted-foreground">Eventos enviados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">98.5%</div>
            <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                placeholder="Buscar webhooks por URL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                aria-label="Buscar webhooks"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredWebhooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Webhook className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
              <h3 className="text-lg font-semibold">Nenhum webhook encontrado</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery
                  ? 'Tente buscar com outro termo'
                  : 'Crie seu primeiro webhook para começar'}
              </p>
              {!searchQuery && (
                <Button onClick={() => setCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
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
                    <TableHead className="text-right">Ações</TableHead>
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
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Opções para webhook ${webhook.url}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Abrir menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => openEditModal(webhook)}
                              aria-label="Editar webhook"
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleTestWebhook(webhook)}
                              aria-label="Testar webhook"
                            >
                              <Send className="h-4 w-4 mr-2" />
                              Testar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openDeliveriesModal(webhook)}
                              aria-label="Ver entregas"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Entregas
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(webhook.id)}
                              aria-label="Excluir webhook"
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

      {/* Create Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo Webhook</DialogTitle>
            <DialogDescription>
              Configure um webhook para receber notificações de eventos
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
                aria-label="URL do webhook"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-secret">Secret (opcional)</Label>
              <Input
                id="create-secret"
                type="password"
                placeholder="Token secreto para validação"
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                aria-label="Secret do webhook"
              />
              <p className="text-xs text-muted-foreground">
                Será enviado no header X-Webhook-Secret
              </p>
            </div>

            <div className="space-y-2">
              <Label>Eventos</Label>
              <ScrollArea className="h-48 rounded-md border p-4">
                <div className="space-y-2">
                  {WEBHOOK_EVENTS.map((event) => (
                    <div key={event} className="flex items-center space-x-2">
                      <Checkbox
                        id={`event-${event}`}
                        checked={formData.events.includes(event)}
                        onCheckedChange={() => toggleEvent(event)}
                        aria-label={`Evento ${event}`}
                      />
                      <label
                        htmlFor={`event-${event}`}
                        className="text-sm cursor-pointer"
                      >
                        {event}
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
                  Começar a receber eventos imediatamente
                </p>
              </div>
              <Switch
                id="create-active"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
                aria-label="Ativar webhook"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateModalOpen(false);
                setFormData({ url: '', events: [], isActive: true, secret: '' });
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate}>Criar Webhook</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Webhook</DialogTitle>
            <DialogDescription>Atualize as configurações do webhook</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-url">URL do Endpoint</Label>
              <Input
                id="edit-url"
                placeholder="https://seu-dominio.com/webhook"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                aria-label="URL do webhook"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-secret">Secret (opcional)</Label>
              <Input
                id="edit-secret"
                type="password"
                placeholder="Token secreto para validação"
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                aria-label="Secret do webhook"
              />
            </div>

            <div className="space-y-2">
              <Label>Eventos</Label>
              <ScrollArea className="h-48 rounded-md border p-4">
                <div className="space-y-2">
                  {WEBHOOK_EVENTS.map((event) => (
                    <div key={event} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-event-${event}`}
                        checked={formData.events.includes(event)}
                        onCheckedChange={() => toggleEvent(event)}
                        aria-label={`Evento ${event}`}
                      />
                      <label
                        htmlFor={`edit-event-${event}`}
                        className="text-sm cursor-pointer"
                      >
                        {event}
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
                  {formData.isActive ? 'Ativo' : 'Inativo'}
                </p>
              </div>
              <Switch
                id="edit-active"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
                aria-label="Status do webhook"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditModalOpen(false);
                setSelectedWebhook(null);
                setFormData({ url: '', events: [], isActive: true, secret: '' });
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleEdit}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deliveries Dialog */}
      <Dialog open={deliveriesModalOpen} onOpenChange={setDeliveriesModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Entregas do Webhook</DialogTitle>
            <DialogDescription>
              Histórico de entregas para {selectedWebhook?.url}
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
                <Send className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
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
                      <TableHead className="text-right">Ações</TableHead>
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
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Sucesso
                            </Badge>
                          )}
                          {delivery.status === 'failed' && (
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
                              aria-label="Ver detalhes"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {delivery.status === 'failed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRetryDelivery(delivery.id)}
                                aria-label="Retentar entrega"
                              >
                                <RefreshCw className="h-4 w-4" />
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
              Informações completas sobre a entrega do webhook
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
                      {JSON.stringify(
                        JSON.parse(selectedDelivery.response),
                        null,
                        2
                      )}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              {selectedDelivery.error && (
                <div>
                  <Label className="text-xs text-muted-foreground text-destructive">
                    Erro
                  </Label>
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
                setDeliveryDetailModalOpen(false);
                setSelectedDelivery(null);
              }}
            >
              Fechar
            </Button>
            {selectedDelivery?.status === 'failed' && (
              <Button
                onClick={() => {
                  handleRetryDelivery(selectedDelivery.id);
                  setDeliveryDetailModalOpen(false);
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retentar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
