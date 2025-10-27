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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Building2,
  Users,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
          <h1 className="text-3xl font-bold tracking-tight">Departamentos</h1>
          <p className="text-muted-foreground">
            Organize sua equipe em departamentos para melhor distribuição de atendimentos
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} size="default">
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
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
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
            <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                placeholder="Buscar departamentos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                aria-label="Buscar departamentos"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredDepartments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
              <h3 className="text-lg font-semibold">Nenhum departamento encontrado</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery
                  ? 'Tente buscar com outro termo'
                  : 'Crie seu primeiro departamento para começar'}
              </p>
              {!searchQuery && (
                <Button onClick={() => setCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                  Novo Departamento
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Usuários</TableHead>
                    <TableHead>Sessões</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDepartments.map((department) => (
                    <TableRow key={department.id}>
                      <TableCell className="font-medium">
                        {department.name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {department.description || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {department._count?.users || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {department._count?.sessions || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={department.isActive}
                            onCheckedChange={() => handleToggleActive(department)}
                            aria-label={`${department.isActive ? 'Desativar' : 'Ativar'} departamento`}
                          />
                          <Badge
                            variant={department.isActive ? 'default' : 'secondary'}
                          >
                            {department.isActive ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(department.createdAt), {
                          locale: ptBR,
                          addSuffix: true,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Opções para ${department.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Abrir menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => openEditModal(department)}
                              aria-label="Editar departamento"
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleToggleActive(department)}
                              aria-label={`${department.isActive ? 'Desativar' : 'Ativar'} departamento`}
                            >
                              <Building2 className="h-4 w-4 mr-2" />
                              {department.isActive ? 'Desativar' : 'Ativar'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(department.id)}
                              aria-label="Excluir departamento"
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Departamento</DialogTitle>
            <DialogDescription>
              Crie um novo departamento para organizar sua equipe
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Nome</Label>
              <Input
                id="create-name"
                placeholder="Ex: Suporte Técnico"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                aria-label="Nome do departamento"
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
                aria-label="Descrição do departamento"
              />
            </div>

            <div className="flex items-center justify-between">
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
                aria-label="Ativar departamento"
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
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                placeholder="Ex: Suporte Técnico"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                aria-label="Nome do departamento"
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
                aria-label="Descrição do departamento"
              />
            </div>

            <div className="flex items-center justify-between">
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
                aria-label="Status do departamento"
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
