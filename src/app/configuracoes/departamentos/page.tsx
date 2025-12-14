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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Building2,
  Users,
  MessageSquare,
  Target,
  Headphones,
  DollarSign,
  Wrench,
  Package,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Department {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  organizationId: string;
  createdAt: Date;
  _count?: {
    users: number;
    sessions: number;
  };
}

// Ícones e cores por tipo de departamento
const getDepartmentIconAndColor = (name: string) => {
  const nameLower = name.toLowerCase();

  if (nameLower.includes('venda') || nameLower.includes('comercial')) {
    return { icon: TrendingUp, color: 'text-green-600', bgColor: 'bg-green-100', borderColor: 'border-green-200' };
  }
  if (nameLower.includes('suporte') || nameLower.includes('técnico')) {
    return { icon: Headphones, color: 'text-blue-600', bgColor: 'bg-blue-100', borderColor: 'border-blue-200' };
  }
  if (nameLower.includes('financeiro') || nameLower.includes('cobrança')) {
    return { icon: DollarSign, color: 'text-yellow-600', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-200' };
  }
  if (nameLower.includes('atendimento') || nameLower.includes('sac')) {
    return { icon: MessageSquare, color: 'text-purple-600', bgColor: 'bg-purple-100', borderColor: 'border-purple-200' };
  }
  if (nameLower.includes('manutenção') || nameLower.includes('operações')) {
    return { icon: Wrench, color: 'text-orange-600', bgColor: 'bg-orange-100', borderColor: 'border-orange-200' };
  }
  if (nameLower.includes('logística') || nameLower.includes('entrega')) {
    return { icon: Package, color: 'text-indigo-600', bgColor: 'bg-indigo-100', borderColor: 'border-indigo-200' };
  }

  return { icon: Target, color: 'text-gray-600', bgColor: 'bg-gray-100', borderColor: 'border-gray-200' };
};

export default function DepartamentosPage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
  });

  const loadDepartments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/departments', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Erro ao carregar departamentos');

      const data = await response.json();
      setDepartments(data.data || []);
    } catch (error) {
      console.error('Erro ao carregar departamentos:', error);
      toast.error('Erro ao carregar departamentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, []);

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome do departamento é obrigatório');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/departments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Erro ao criar departamento');

      toast.success('Departamento criado com sucesso!');
      setCreateModalOpen(false);
      setFormData({ name: '', description: '', isActive: true });
      loadDepartments();
    } catch (error) {
      console.error('Erro ao criar departamento:', error);
      toast.error('Erro ao criar departamento');
    }
  };

  const handleEdit = async () => {
    if (!selectedDepartment || !formData.name.trim()) {
      toast.error('Nome do departamento é obrigatório');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/departments/${selectedDepartment.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Erro ao editar departamento');

      toast.success('Departamento atualizado com sucesso!');
      setEditModalOpen(false);
      setSelectedDepartment(null);
      setFormData({ name: '', description: '', isActive: true });
      loadDepartments();
    } catch (error) {
      console.error('Erro ao editar departamento:', error);
      toast.error('Erro ao editar departamento');
    }
  };

  const handleToggleActive = async (department: Department) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/departments/${department.id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !department.isActive }),
      });

      if (!response.ok) throw new Error('Erro ao atualizar status');

      toast.success(
        `Departamento ${!department.isActive ? 'ativado' : 'desativado'} com sucesso!`
      );
      loadDepartments();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este departamento?')) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/departments/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Erro ao excluir departamento');

      toast.success('Departamento excluído com sucesso!');
      loadDepartments();
    } catch (error) {
      console.error('Erro ao excluir departamento:', error);
      toast.error('Erro ao excluir departamento');
    }
  };

  const openEditModal = (department: Department) => {
    setSelectedDepartment(department);
    setFormData({
      name: department.name,
      description: department.description || '',
      isActive: department.isActive,
    });
    setEditModalOpen(true);
  };

  const filteredDepartments = departments.filter((dept) =>
    dept.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeDepartments = departments.filter((d) => d.isActive).length;
  const totalUsers = departments.reduce((acc, d) => acc + (d._count?.users || 0), 0);
  const totalSessions = departments.reduce((acc, d) => acc + (d._count?.sessions || 0), 0);

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            Departamentos
          </h1>
          <p className="text-muted-foreground mt-1">
            Organize sua equipe em departamentos para melhor distribuição de atendimentos
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} size="default" className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Departamento
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Departamentos
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{departments.length}</div>
            <p className="text-xs text-muted-foreground">
              {activeDepartments} ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Usuários Alocados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              Membros da equipe
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sessões Ativas</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSessions}</div>
            <p className="text-xs text-muted-foreground">
              Atendimentos em andamento
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar departamentos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Departments Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-12 w-12 rounded-lg mb-3" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredDepartments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-6 mb-4">
              <Building2 className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {searchQuery ? 'Nenhum departamento encontrado' : 'Crie seu primeiro departamento'}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              {searchQuery
                ? 'Tente buscar com outro termo ou crie um novo departamento'
                : 'Departamentos ajudam a organizar sua equipe e distribuir atendimentos de forma eficiente'}
            </p>
            {!searchQuery && (
              <Button onClick={() => setCreateModalOpen(true)} size="lg" className="gap-2">
                <Plus className="h-5 w-5" />
                Criar Primeiro Departamento
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredDepartments.map((department) => {
            const { icon: Icon, color, bgColor, borderColor } = getDepartmentIconAndColor(department.name);

            return (
              <Card
                key={department.id}
                className={cn(
                  "relative overflow-hidden transition-all hover:shadow-md",
                  department.isActive ? borderColor : "border-gray-200 opacity-75"
                )}
              >
                {/* Status Badge */}
                <div className="absolute top-4 right-4 z-10">
                  <Badge
                    variant={department.isActive ? "default" : "secondary"}
                    className="gap-1"
                  >
                    {department.isActive ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        Ativo
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3" />
                        Inativo
                      </>
                    )}
                  </Badge>
                </div>

                <CardHeader className="pb-4">
                  {/* Icon */}
                  <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center mb-3", bgColor)}>
                    <Icon className={cn("h-6 w-6", color)} />
                  </div>

                  {/* Name & Description */}
                  <CardTitle className="text-lg pr-20">{department.name}</CardTitle>
                  {department.description && (
                    <CardDescription className="line-clamp-2 text-sm">
                      {department.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Stats */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{department._count?.users || 0}</span>
                      <span className="text-muted-foreground text-xs">usuários</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{department._count?.sessions || 0}</span>
                      <span className="text-muted-foreground text-xs">conversas</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEditModal(department)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleToggleActive(department)}>
                          {department.isActive ? 'Desativar' : 'Ativar'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(department.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Created At */}
                  <p className="text-xs text-muted-foreground pt-2 border-t">
                    Criado {formatDistanceToNow(new Date(department.createdAt), {
                      locale: ptBR,
                      addSuffix: true,
                    })}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Departamento</DialogTitle>
            <DialogDescription>
              Crie um novo departamento para organizar sua equipe
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Nome do Departamento *</Label>
              <Input
                id="create-name"
                placeholder="Ex: Vendas, Suporte, Financeiro..."
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-description">Descrição (opcional)</Label>
              <Textarea
                id="create-description"
                placeholder="Descreva o propósito do departamento..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="create-active">Ativar imediatamente</Label>
                <p className="text-xs text-muted-foreground">
                  O departamento ficará disponível para uso
                </p>
              </div>
              <Switch
                id="create-active"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateModalOpen(false);
                setFormData({ name: '', description: '', isActive: true });
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate}>Criar Departamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Departamento</DialogTitle>
            <DialogDescription>
              Atualize as informações do departamento
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome do Departamento *</Label>
              <Input
                id="edit-name"
                placeholder="Ex: Vendas, Suporte, Financeiro..."
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrição (opcional)</Label>
              <Textarea
                id="edit-description"
                placeholder="Descreva o propósito do departamento..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="edit-active">Status do departamento</Label>
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
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditModalOpen(false);
                setSelectedDepartment(null);
                setFormData({ name: '', description: '', isActive: true });
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleEdit}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
