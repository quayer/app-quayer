'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IntegrationCard } from '@/components/integrations/IntegrationCard';
import { CreateIntegrationModal } from '@/components/integrations/CreateIntegrationModal';
import {
  Plus,
  Search,
  RefreshCw,
  Filter,
  Smartphone,
  MessageSquare,
  Users,
  Wifi,
  WifiOff,
  Clock,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';

interface Instance {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting';
  phoneNumber?: string;
  profileName?: string;
  profilePictureUrl?: string;
  createdAt: string;
  messageCount?: number;
  unreadCount?: number;
}

export default function IntegrationsPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Verificar se o usuário é admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const response = await fetch('/api/v1/auth/me', {
          headers: {
            ...(token && { 'Authorization': `Bearer ${token}` }),
          },
        });
        if (response.ok) {
          const userData = await response.json();
          setIsAdmin(userData.role === 'admin');
        }
      } catch (error) {
        console.error('Erro ao verificar status de admin:', error);
      }
    };

    checkAdminStatus();
  }, []);

  // Carregar instâncias reais da API
  useEffect(() => {
    const fetchInstances = async () => {
      try {
        setLoading(true);
        
        // Buscar token do localStorage
        const token = localStorage.getItem('accessToken');
        
        // Chamada real para a API de instâncias
        const response = await fetch('/api/v1/instances?page=1&limit=50', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
          },
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success && data.data) {
          // Mapear dados da API para o formato esperado pelo componente
          const mappedInstances: Instance[] = data.data.map((instance: any) => ({
            id: instance.id,
            name: instance.name,
            status: instance.status || 'disconnected',
            phoneNumber: instance.phoneNumber,
            profileName: instance.profileName || instance.name,
            profilePictureUrl: instance.profilePictureUrl,
            createdAt: instance.createdAt || instance.created_at,
            messageCount: instance.messageCount || 0,
            unreadCount: instance.unreadCount || 0
          }));
          
          setInstances(mappedInstances);
        } else {
          console.error('Erro na resposta da API:', data);
          // Limpar dados em caso de erro
          setInstances([]);
        }
      } catch (error) {
        console.error('Erro ao carregar instâncias:', error);
        // Limpar dados em caso de erro
        setInstances([]);
      } finally {
        setLoading(false);
      }
    };

    fetchInstances();
  }, []);

  const filteredInstances = instances.filter(instance => {
    const matchesSearch = instance.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         instance.profileName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || instance.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStats = () => {
    const connected = instances.filter(i => i.status === 'connected').length;
    const connecting = instances.filter(i => i.status === 'connecting').length;
    const disconnected = instances.filter(i => i.status === 'disconnected').length;
    const totalMessages = instances.reduce((sum, i) => sum + (i.messageCount || 0), 0);

    return { connected, connecting, disconnected, totalMessages };
  };

  const stats = getStats();

  const handleCreateIntegration = async (data: any) => {
    try {
      console.log('Criando integração:', data);

      const token = localStorage.getItem('accessToken');

      // Chamada real para criar instância
      const response = await fetch('/api/v1/instances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        credentials: 'include',
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          webhookUrl: data.webhookUrl || null
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        // Adicionar nova instância criada
        const newInstance: Instance = {
          id: result.data.id,
          name: result.data.name,
          status: 'connecting',
          createdAt: result.data.createdAt || new Date().toISOString(),
          messageCount: 0,
          unreadCount: 0
        };

        setInstances(prev => [newInstance, ...prev]);

        // Mostrar sucesso
        toast.success('Integração criada com sucesso!');

        // Retornar o ID da instância criada para que o modal possa usar
        return { success: true, instanceId: result.data.id };
      } else {
        throw new Error(result.message || 'Erro ao criar integração');
      }
    } catch (error) {
      console.error('Erro ao criar integração:', error);
      toast.error('Erro ao criar integração. Tente novamente.');
      throw error; // Re-throw para o modal saber que houve erro
    }
  };

  const handleConfigure = async (id: string) => {
    try {
      // Navegar para página de configuração ou abrir modal
      console.log('Configurar instância:', id);
      // Implementar navegação ou modal de configuração
    } catch (error) {
      console.error('Erro ao configurar instância:', error);
      toast.error('Erro ao configurar instância');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      if (!confirm('Tem certeza que deseja excluir esta integração?')) {
        return;
      }

      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/instances/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setInstances(prev => prev.filter(i => i.id !== id));
        toast.success('Integração excluída com sucesso!');
      } else {
        throw new Error(result.message || 'Erro ao excluir integração');
      }
    } catch (error) {
      console.error('Erro ao deletar instância:', error);
      toast.error('Erro ao excluir integração. Tente novamente.');
    }
  };

  const handleReconnect = async (id: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/instances/${id}/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setInstances(prev => prev.map(i =>
          i.id === id ? { ...i, status: 'connecting' as const } : i
        ));
        toast.success('Reconectando instância...');
      } else {
        throw new Error(result.message || 'Erro ao reconectar');
      }
    } catch (error) {
      console.error('Erro ao reconectar instância:', error);
      toast.error('Erro ao reconectar instância. Tente novamente.');
    }
  };

  const handleGenerateQrCode = async (id: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/instances/${id}/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        // Navegar para página de QR code ou abrir modal
        window.open(`/integracoes/compartilhar/${id}`, '_blank');
        toast.success('QR Code gerado! Abrindo página de conexão...');
      } else {
        throw new Error(result.message || 'Erro ao gerar QR Code');
      }
    } catch (error) {
      console.error('Erro ao gerar QR Code:', error);
      toast.error('Erro ao gerar QR Code. Tente novamente.');
    }
  };

  const handleShare = async (id: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      // Gerar token de compartilhamento
      const response = await fetch(`/api/v1/instances/${id}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.data?.token) {
        const shareUrl = `${window.location.origin}/integracoes/compartilhar/${result.data.token}`;
        
        // Copiar para clipboard
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Link de compartilhamento copiado para a área de transferência!');
      } else {
        throw new Error(result.message || 'Erro ao gerar link de compartilhamento');
      }
    } catch (error) {
      console.error('Erro ao compartilhar:', error);
      toast.error('Erro ao gerar link de compartilhamento. Tente novamente.');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Carregando integrações...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center space-x-2">
            <Smartphone className="h-8 w-8 text-primary" />
            <span>Integrações WhatsApp</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie suas integrações WhatsApp Business
          </p>
            </div>

        <Button 
          onClick={() => setCreateModalOpen(true)}
          className="bg-green-600 hover:bg-green-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nova Integração
        </Button>
            </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-lg border">
          <div className="flex items-center space-x-2">
            <Wifi className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium">Conectadas</span>
          </div>
          <p className="text-2xl font-bold mt-1">{stats.connected}</p>
          </div>

        <div className="bg-card p-4 rounded-lg border">
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            <span className="text-sm font-medium">Conectando</span>
                    </div>
          <p className="text-2xl font-bold mt-1">{stats.connecting}</p>
              </div>
        
        <div className="bg-card p-4 rounded-lg border">
          <div className="flex items-center space-x-2">
            <WifiOff className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium">Desconectadas</span>
                      </div>
          <p className="text-2xl font-bold mt-1">{stats.disconnected}</p>
                    </div>

        <div className="bg-card p-4 rounded-lg border">
          <div className="flex items-center space-x-2">
            <MessageSquare className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium">Total Mensagens</span>
                    </div>
          <p className="text-2xl font-bold mt-1">{stats.totalMessages.toLocaleString()}</p>
                  </div>
                </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar integrações..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
          </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="connected">Conectadas</SelectItem>
            <SelectItem value="connecting">Conectando</SelectItem>
            <SelectItem value="disconnected">Desconectadas</SelectItem>
          </SelectContent>
        </Select>
        
        <Button variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
          </div>

      {/* Results */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {filteredInstances.length} integração(ões) encontrada(s)
          </p>
          
          {instances.length > 0 && (
            <Badge variant="outline">
              {instances.length}/10 instâncias
            </Badge>
          )}
              </div>

        {filteredInstances.length === 0 ? (
          <div className="text-center py-12">
            <Smartphone className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchTerm || statusFilter !== 'all' 
                ? 'Nenhuma integração encontrada' 
                : 'Nenhuma integração criada ainda'
              }
              </h3>
            <p className="text-muted-foreground mb-6">
              {searchTerm || statusFilter !== 'all'
                ? 'Tente ajustar os filtros de pesquisa'
                : 'Crie sua primeira integração WhatsApp Business para começar'
              }
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <Button 
                onClick={() => setCreateModalOpen(true)}
                className="bg-green-600 hover:bg-green-700"
              >
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeira Integração
                </Button>
              )}
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredInstances.map((instance) => (
                      <IntegrationCard
                        key={instance.id}
                        instance={{
                          ...instance,
                          createdAt: new Date(instance.createdAt)
                        }}
                        onConfigure={handleConfigure}
                        onDelete={handleDelete}
                        onReconnect={handleReconnect}
                        onGenerateQrCode={handleGenerateQrCode}
                        onShare={handleShare}
                      />
                    ))}
            </div>
          )}
      </div>

      {/* Create Modal */}
      <CreateIntegrationModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateIntegration}
        isAdmin={isAdmin}
      />
    </div>
  );
}