'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { IntegrationCard } from '@/components/integrations/IntegrationCard';
import { CreateIntegrationModal } from '@/components/integrations/CreateIntegrationModal';
import { QRCodeModal } from '@/features/connections/components/QRCodeModal';
import { ShareLinkModal } from '@/components/whatsapp/share-link-modal';
import {
  Plus,
  Search,
  RefreshCw,
  Filter,
  Smartphone,
  MessageSquare,
  Wifi,
  WifiOff,
  Clock,
  LayoutGrid,
  List,
  Zap,
  Radio,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useInstances,
  useCreateInstance,
  useConnectInstance,
  useDisconnectInstance,
  useDeleteInstance,
  useInstanceStats,
} from '@/hooks/useInstance';
import { BrokerType } from '@/features/instances/instances.interfaces';
import { PageContainer, PageHeader } from '@/components/layout/page-layout';

interface Instance {
  id: string;
  name: string;
  description?: string;
  status: 'connected' | 'disconnected' | 'connecting';
  phoneNumber?: string;
  profileName?: string;
  profilePictureUrl?: string;
  webhookUrl?: string;
  createdAt: string;
  messageCount?: number;
  unreadCount?: number;
}

export default function IntegrationsPage() {
  const [isMounted, setIsMounted] = useState(false);

  // Hydration fix: esperar montagem no cliente
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Detectar se há instâncias conectando para polling mais rápido
  const [hasPendingConnections, setHasPendingConnections] = useState(false)

  // TanStack Query hooks com polling automático
  const { data: instancesData, isLoading: loading, refetch, isFetching: refreshing } = useInstances({
    enablePolling: true,
    fastPolling: hasPendingConnections, // Polling rápido (3s) quando há conexões pendentes
  });
  const { data: statsData } = useInstanceStats();
  const createInstanceMutation = useCreateInstance();
  const connectInstanceMutation = useConnectInstance();
  const disconnectInstanceMutation = useDisconnectInstance();
  const deleteInstanceMutation = useDeleteInstance();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'delete' | 'disconnect' | null;
    instanceId: string | null;
    instanceName: string | null;
  }>({
    open: false,
    type: null,
    instanceId: null,
    instanceName: null,
  });

  // Mapear instâncias para o formato do frontend
  const instances: Instance[] = useMemo(() => {
    const data = instancesData?.data || [];
    return data.map((instance: any) => ({
      id: instance.id,
      name: instance.name,
      description: instance.description,
      status: instance.status?.toLowerCase() || 'disconnected',
      phoneNumber: instance.phoneNumber,
      profileName: instance.profileName || instance.name,
      profilePictureUrl: instance.profilePictureUrl,
      webhookUrl: instance.webhookUrl,
      createdAt: instance.createdAt || instance.created_at,
      messageCount: instance.messageCount || 0,
      unreadCount: instance.unreadCount || 0,
    }));
  }, [instancesData]);

  // Estatísticas das instâncias
  const stats = useMemo(() => ({
    total: instances.length,
    connected: statsData?.connected || instances.filter(i => i.status === 'connected').length,
    connecting: statsData?.connecting || instances.filter(i => i.status === 'connecting').length,
    disconnected: statsData?.disconnected || instances.filter(i => i.status === 'disconnected').length,
    totalMessages: instances.reduce((sum, i) => sum + (i.messageCount || 0), 0),
  }), [instances, statsData]);

  // Filtrar instâncias
  const filteredInstances = useMemo(() => {
    return instances.filter((instance) => {
      const matchesSearch =
        instance.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        instance.profileName?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || instance.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [instances, searchTerm, statusFilter]);

  // Indicador de instâncias em polling
  const hasConnectingInstances = stats.connecting > 0;

  // Atualizar flag de conexões pendentes para polling rápido
  useEffect(() => {
    // Ativar polling rápido se houver instâncias conectando OU se o modal QR estiver aberto
    setHasPendingConnections(hasConnectingInstances || qrModalOpen)
  }, [hasConnectingInstances, qrModalOpen])

  // Handlers
  const handleCreateIntegration = async (data: any) => {
    try {
      const result = await createInstanceMutation.mutateAsync({
        name: data.name,
        provider: data.provider || 'WHATSAPP_WEB',
        channel: 'WHATSAPP',
      });

      if (result) {
        // Retorna o resultado para o modal decidir o próximo passo
        return { success: true, instanceId: result.id };
      }
    } catch (error: any) {
      console.error('Erro ao criar integração:', error);
      // Extrair mensagem de erro de forma mais robusta
      const errorMessage = error?.message ||
        (typeof error === 'string' ? error : null) ||
        'Erro desconhecido ao criar integração';
      toast.error(errorMessage);
      throw error;
    }
  };

  // Callback quando o usuário escolhe QR Code no modal de criação
  const handleSelectQRCode = (instanceId: string, instanceName: string) => {
    const newInstance: Instance = {
      id: instanceId,
      name: instanceName,
      status: 'connecting',
      createdAt: new Date().toISOString(),
      messageCount: 0,
      unreadCount: 0,
    };
    setSelectedInstance(newInstance);
    // Pequeno delay para garantir que o modal de criação fechou
    setTimeout(() => {
      setQrModalOpen(true);
    }, 100);
  };

  const handleOpenQRCode = async (id: string) => {
    const instance = instances.find(i => i.id === id);
    if (instance) {
      setSelectedInstance(instance);
      setQrModalOpen(true);
    }
  };



  const handleDelete = async (id: string) => {
    const instance = instances.find(i => i.id === id);
    setConfirmDialog({
      open: true,
      type: 'delete',
      instanceId: id,
      instanceName: instance?.name || 'esta integração',
    });
  };

  const executeDelete = async () => {
    if (!confirmDialog.instanceId) return;

    try {
      await deleteInstanceMutation.mutateAsync(confirmDialog.instanceId);
      toast.success('Integração excluída com sucesso!');
    } catch (error) {
      console.error('Erro ao deletar instância:', error);
      toast.error('Erro ao excluir integração. Tente novamente.');
    } finally {
      setConfirmDialog({ open: false, type: null, instanceId: null, instanceName: null });
    }
  };

  const handleReconnect = async (id: string) => {
    try {
      await connectInstanceMutation.mutateAsync(id);
      const instance = instances.find(i => i.id === id);
      if (instance) {
        setSelectedInstance({ ...instance, status: 'connecting' });
        setQrModalOpen(true);
      }
    } catch (error) {
      console.error('Erro ao reconectar instância:', error);
      toast.error('Erro ao reconectar instância. Tente novamente.');
    }
  };

  const handleDisconnect = async (id: string) => {
    const instance = instances.find(i => i.id === id);
    setConfirmDialog({
      open: true,
      type: 'disconnect',
      instanceId: id,
      instanceName: instance?.name || 'esta instância',
    });
  };

  const executeDisconnect = async () => {
    if (!confirmDialog.instanceId) return;

    try {
      await disconnectInstanceMutation.mutateAsync(confirmDialog.instanceId);
      toast.success('Instância desconectada!');
    } catch (error) {
      console.error('Erro ao desconectar instância:', error);
      toast.error('Erro ao desconectar instância. Tente novamente.');
    } finally {
      setConfirmDialog({ open: false, type: null, instanceId: null, instanceName: null });
    }
  };

  const handleConfirmAction = () => {
    if (confirmDialog.type === 'delete') {
      executeDelete();
    } else if (confirmDialog.type === 'disconnect') {
      executeDisconnect();
    }
  };

  const handleCancelConfirm = () => {
    setConfirmDialog({ open: false, type: null, instanceId: null, instanceName: null });
  };

  const handleRestart = async (id: string) => {
    try {
      await connectInstanceMutation.mutateAsync(id);
      toast.success('Instância reiniciada!');
    } catch (error) {
      console.error('Erro ao reiniciar instância:', error);
      toast.error('Erro ao reiniciar instância. Tente novamente.');
    }
  };

  const handleShare = async (id: string) => {
    const instance = instances.find(i => i.id === id);
    if (instance) {
      setSelectedInstance(instance);
      setShareModalOpen(true);
    }
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleInstanceConnected = async () => {
    // Ativar fast polling temporariamente
    setHasPendingConnections(true)

    // Aguardar um pouco para o backend atualizar o banco de dados
    await new Promise(resolve => setTimeout(resolve, 500));

    // Forçar refetch imediato para pegar o status atualizado
    refetch();

    // Refetch adicional após mais tempo para garantir sincronização
    setTimeout(() => refetch(), 1500);
    setTimeout(() => refetch(), 3000);

    // Desativar fast polling após 10 segundos
    setTimeout(() => {
      setHasPendingConnections(false)
    }, 10000);
  };

  // Loading skeleton - também usado antes da hydration
  if (!isMounted || loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-48" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <PageContainer maxWidth="full">
        <PageHeader
          title="Canais de Comunicação"
          description="Gerencie suas conexões do WhatsApp e outros canais de atendimento."
          actions={
            <Button
              onClick={() => setCreateModalOpen(true)}
              className="gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-105"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Conectar
            </Button>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Conectadas</p>
                <Wifi className="h-4 w-4 text-green-600" />
              </div>
              <p className="text-2xl font-bold">{stats.connected}</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Conectando</p>
                <Clock className="h-4 w-4 text-yellow-600" />
              </div>
              <p className="text-2xl font-bold">{stats.connecting}</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Desconectadas</p>
                <WifiOff className="h-4 w-4 text-red-600" />
              </div>
              <p className="text-2xl font-bold">{stats.disconnected}</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Mensagens</p>
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold">{stats.totalMessages.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row items-center gap-4" role="search" aria-label="Filtros de integrações">
          <div className="relative flex-1 max-w-md">
            <label htmlFor="search-integrations" className="sr-only">Pesquisar integrações</label>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="search-integrations"
              placeholder="Pesquisar integrações..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              aria-describedby="search-results-count"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48" aria-label="Filtrar por status">
              <Filter className="h-4 w-4 mr-2" aria-hidden="true" />
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="connected">Conectadas</SelectItem>
              <SelectItem value="connecting">Conectando</SelectItem>
              <SelectItem value="disconnected">Desconectadas</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  aria-label={refreshing ? 'Atualizando lista...' : 'Atualizar lista de integrações'}
                >
                  <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Atualizar lista</p>
              </TooltipContent>
            </Tooltip>

            <div className="border rounded-lg p-1 flex" role="group" aria-label="Modo de visualização">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode('grid')}
                    aria-label="Visualização em grade"
                    aria-pressed={viewMode === 'grid'}
                  >
                    <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Visualização em grade</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode('list')}
                    aria-label="Visualização em lista"
                    aria-pressed={viewMode === 'list'}
                  >
                    <List className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Visualização em lista</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Results info */}
        <div className="flex items-center justify-between">
          <p id="search-results-count" className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {filteredInstances.length} integração(ões) encontrada(s)
          </p>

          {instances.length > 0 && (
            <Badge variant="outline" className="gap-1">
              <Zap className="h-3 w-3" aria-hidden="true" />
              <span aria-label={`${instances.length} de 10 instâncias utilizadas`}>
                {instances.length}/10 instâncias
              </span>
            </Badge>
          )}
        </div>

        {/* Instance Cards */}
        {filteredInstances.length === 0 ? (
          <Card className="border-dashed" role="region" aria-label="Nenhuma integração">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 bg-muted rounded-full mb-4">
                <Smartphone className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {searchTerm || statusFilter !== 'all'
                  ? 'Nenhuma integração encontrada'
                  : 'Nenhuma integração criada ainda'}
              </h3>
              <p className="text-muted-foreground text-center mb-6 max-w-sm">
                {searchTerm || statusFilter !== 'all'
                  ? 'Tente ajustar os filtros de pesquisa'
                  : 'Crie sua primeira integração WhatsApp Business para começar a enviar e receber mensagens'}
              </p>
              {!searchTerm && statusFilter === 'all' && (
                <Button
                  onClick={() => setCreateModalOpen(true)}
                  className="bg-green-600 hover:bg-green-700 gap-2"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Criar Primeira Integração
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div
            className={cn(
              'grid gap-6',
              viewMode === 'grid'
                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                : 'grid-cols-1'
            )}
            role="list"
            aria-label="Lista de integrações"
          >
            {filteredInstances.map((instance) => (
              <IntegrationCard
                key={instance.id}
                instance={{
                  ...instance,
                  createdAt: new Date(instance.createdAt),
                }}
                onDelete={handleDelete}
                onReconnect={handleReconnect}
                onGenerateQrCode={handleOpenQRCode}
                onShare={handleShare}
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        )}

        {/* Modals */}
        <CreateIntegrationModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onCreate={handleCreateIntegration}
          onSelectQRCode={handleSelectQRCode}
          isAdmin={false}
        />

        <QRCodeModal
          open={qrModalOpen}
          onOpenChange={(open) => {
            setQrModalOpen(open)
            if (!open) handleInstanceConnected()
          }}
          connectionId={selectedInstance?.id || ''}
          connectionName={selectedInstance?.name || ''}
          onConnected={handleInstanceConnected}
        />

        <ShareLinkModal
          open={shareModalOpen}
          onOpenChange={setShareModalOpen}
          instanceId={selectedInstance?.id || ''}
          instanceName={selectedInstance?.name || ''}
        />

        {/* Confirmation Dialog */}
        <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && handleCancelConfirm()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmDialog.type === 'delete' ? 'Excluir Integração' : 'Desconectar Instância'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDialog.type === 'delete'
                  ? `Tem certeza que deseja excluir "${confirmDialog.instanceName}"? Esta ação não pode ser desfeita e todos os dados relacionados serão perdidos.`
                  : `Tem certeza que deseja desconectar "${confirmDialog.instanceName}"? Você precisará escanear o QR Code novamente para reconectar.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCancelConfirm}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmAction}
                className={confirmDialog.type === 'delete' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
              >
                {confirmDialog.type === 'delete' ? 'Excluir' : 'Desconectar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </PageContainer>
    </TooltipProvider>
  );
}
