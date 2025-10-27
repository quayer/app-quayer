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
  Tag,
  Link2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

interface Tabulation {
  id: string;
  name: string;
  color?: string;
  organizationId: string;
  createdAt: Date;
  _count?: {
    contacts: number;
    kanbanColumns: number;
  };
}

export default function TabulacoesPage() {
  const router = useRouter();
  const [tabulations, setTabulations] = useState<Tabulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedTabulation, setSelectedTabulation] = useState<Tabulation | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    color: '#3b82f6',
  });

  const loadTabulations = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/tabulations', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Erro ao carregar tabulações');

      const data = await response.json();
      setTabulations(data.data || []);
    } catch (error) {
      console.error('Erro ao carregar tabulações:', error);
      toast.error('Erro ao carregar tabulações');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTabulations();
  }, []);

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome da tabulação é obrigatório');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/tabulations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Erro ao criar tabulação');

      const data = await response.json();
      toast.success('Tabulação criada com sucesso!');
      setCreateModalOpen(false);
      setFormData({ name: '', color: '#3b82f6' });
      loadTabulations();
    } catch (error) {
      console.error('Erro ao criar tabulação:', error);
      toast.error('Erro ao criar tabulação');
    }
  };

  const handleEdit = async () => {
    if (!selectedTabulation || !formData.name.trim()) {
      toast.error('Nome da tabulação é obrigatório');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/tabulations/${selectedTabulation.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Erro ao editar tabulação');

      toast.success('Tabulação atualizada com sucesso!');
      setEditModalOpen(false);
      setSelectedTabulation(null);
      setFormData({ name: '', color: '#3b82f6' });
      loadTabulations();
    } catch (error) {
      console.error('Erro ao editar tabulação:', error);
      toast.error('Erro ao editar tabulação');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta tabulação?')) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/tabulations/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Erro ao excluir tabulação');

      toast.success('Tabulação excluída com sucesso!');
      loadTabulations();
    } catch (error) {
      console.error('Erro ao excluir tabulação:', error);
      toast.error('Erro ao excluir tabulação');
    }
  };

  const openEditModal = (tabulation: Tabulation) => {
    setSelectedTabulation(tabulation);
    setFormData({
      name: tabulation.name,
      color: tabulation.color || '#3b82f6',
    });
    setEditModalOpen(true);
  };

  const filteredTabulations = tabulations.filter((tab) =>
    tab.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalContacts = tabulations.reduce(
    (acc, tab) => acc + (tab._count?.contacts || 0),
    0
  );
  const linkedToKanban = tabulations.filter(
    (tab) => (tab._count?.kanbanColumns || 0) > 0
  ).length;

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tabulações</h1>
          <p className="text-muted-foreground">
            Gerencie as tabulações para organizar contatos e funis de venda
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} size="default">
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          Nova Tabulação
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Tabulações
            </CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tabulations.length}</div>
            <p className="text-xs text-muted-foreground">
              Tags para organizar contatos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Contatos Marcados
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalContacts}</div>
            <p className="text-xs text-muted-foreground">
              Total de contatos com tabulações
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Vinculadas ao Kanban
            </CardTitle>
            <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{linkedToKanban}</div>
            <p className="text-xs text-muted-foreground">
              Tabulações usadas em funis
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
                placeholder="Buscar tabulações..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                aria-label="Buscar tabulações"
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
          ) : filteredTabulations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Tag className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
              <h3 className="text-lg font-semibold">Nenhuma tabulação encontrada</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery
                  ? 'Tente buscar com outro termo'
                  : 'Crie sua primeira tabulação para começar'}
              </p>
              {!searchQuery && (
                <Button onClick={() => setCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                  Nova Tabulação
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cor</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Contatos</TableHead>
                    <TableHead>Kanban</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTabulations.map((tabulation) => (
                    <TableRow key={tabulation.id}>
                      <TableCell>
                        <div
                          className="h-6 w-6 rounded-full border-2 border-border"
                          style={{ backgroundColor: tabulation.color || '#3b82f6' }}
                          aria-label={`Cor: ${tabulation.color}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {tabulation.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {tabulation._count?.contacts || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(tabulation._count?.kanbanColumns || 0) > 0 ? (
                          <Badge variant="default">
                            <Link2 className="h-3 w-3 mr-1" aria-hidden="true" />
                            {tabulation._count?.kanbanColumns} coluna(s)
                          </Badge>
                        ) : (
                          <Badge variant="outline">Não vinculada</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Opções para ${tabulation.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Abrir menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => openEditModal(tabulation)}
                              aria-label="Editar tabulação"
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(tabulation.id)}
                              aria-label="Excluir tabulação"
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
            <DialogTitle>Nova Tabulação</DialogTitle>
            <DialogDescription>
              Crie uma nova tabulação para organizar seus contatos
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Nome</Label>
              <Input
                id="create-name"
                placeholder="Ex: Cliente VIP"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                aria-label="Nome da tabulação"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-color">Cor</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="create-color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-20 h-10 cursor-pointer"
                  aria-label="Cor da tabulação"
                />
                <Input
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#3b82f6"
                  className="flex-1 font-mono"
                  aria-label="Código hexadecimal da cor"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateModalOpen(false);
                setFormData({ name: '', color: '#3b82f6' });
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate}>Criar Tabulação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Tabulação</DialogTitle>
            <DialogDescription>
              Atualize as informações da tabulação
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                placeholder="Ex: Cliente VIP"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                aria-label="Nome da tabulação"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-color">Cor</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="edit-color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-20 h-10 cursor-pointer"
                  aria-label="Cor da tabulação"
                />
                <Input
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#3b82f6"
                  className="flex-1 font-mono"
                  aria-label="Código hexadecimal da cor"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditModalOpen(false);
                setSelectedTabulation(null);
                setFormData({ name: '', color: '#3b82f6' });
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
