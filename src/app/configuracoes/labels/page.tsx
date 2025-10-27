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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Tag,
  TrendingUp,
  Bookmark,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface LabelType {
  id: string;
  name: string;
  color?: string;
  category?: string;
  organizationId: string;
  createdAt: Date;
  _count?: {
    messages: number;
  };
}

const CATEGORIES = [
  'Geral',
  'Atendimento',
  'Vendas',
  'Suporte',
  'Marketing',
  'Financeiro',
  'Urgente',
  'Outros',
];

export default function LabelsPage() {
  const router = useRouter();
  const [labels, setLabels] = useState<LabelType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<LabelType | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    color: '#8b5cf6',
    category: 'Geral',
  });

  const loadLabels = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/labels', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Erro ao carregar labels');

      const data = await response.json();
      setLabels(data.data || []);
    } catch (error) {
      console.error('Erro ao carregar labels:', error);
      toast.error('Erro ao carregar labels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLabels();
  }, []);

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome da label é obrigatório');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Erro ao criar label');

      toast.success('Label criada com sucesso!');
      setCreateModalOpen(false);
      setFormData({ name: '', color: '#8b5cf6', category: 'Geral' });
      loadLabels();
    } catch (error) {
      console.error('Erro ao criar label:', error);
      toast.error('Erro ao criar label');
    }
  };

  const handleEdit = async () => {
    if (!selectedLabel || !formData.name.trim()) {
      toast.error('Nome da label é obrigatório');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/labels/${selectedLabel.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Erro ao editar label');

      toast.success('Label atualizada com sucesso!');
      setEditModalOpen(false);
      setSelectedLabel(null);
      setFormData({ name: '', color: '#8b5cf6', category: 'Geral' });
      loadLabels();
    } catch (error) {
      console.error('Erro ao editar label:', error);
      toast.error('Erro ao editar label');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta label?')) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/labels/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Erro ao excluir label');

      toast.success('Label excluída com sucesso!');
      loadLabels();
    } catch (error) {
      console.error('Erro ao excluir label:', error);
      toast.error('Erro ao excluir label');
    }
  };

  const openEditModal = (label: LabelType) => {
    setSelectedLabel(label);
    setFormData({
      name: label.name,
      color: label.color || '#8b5cf6',
      category: label.category || 'Geral',
    });
    setEditModalOpen(true);
  };

  const filteredLabels = labels
    .filter((label) => label.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter((label) =>
      categoryFilter === 'all' ? true : label.category === categoryFilter
    );

  const totalUsage = labels.reduce((acc, label) => acc + (label._count?.messages || 0), 0);
  const categoriesCount = new Set(labels.map((l) => l.category)).size;

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Labels</h1>
          <p className="text-muted-foreground">
            Gerencie labels genéricas para categorizar mensagens e atendimentos
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} size="default">
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          Nova Label
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Labels</CardTitle>
            <Bookmark className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{labels.length}</div>
            <p className="text-xs text-muted-foreground">
              Labels para categorização
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Uso Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsage}</div>
            <p className="text-xs text-muted-foreground">
              Mensagens categorizadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Categorias</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categoriesCount}</div>
            <p className="text-xs text-muted-foreground">
              Categorias diferentes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                placeholder="Buscar labels..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                aria-label="Buscar labels"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]" aria-label="Filtrar por categoria">
                <SelectValue placeholder="Todas categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredLabels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bookmark className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
              <h3 className="text-lg font-semibold">Nenhuma label encontrada</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery || categoryFilter !== 'all'
                  ? 'Tente ajustar os filtros'
                  : 'Crie sua primeira label para começar'}
              </p>
              {!searchQuery && categoryFilter === 'all' && (
                <Button onClick={() => setCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                  Nova Label
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
                    <TableHead>Categoria</TableHead>
                    <TableHead>Uso</TableHead>
                    <TableHead>Criada</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLabels.map((label) => (
                    <TableRow key={label.id}>
                      <TableCell>
                        <div
                          className="h-6 w-6 rounded-full border-2 border-border"
                          style={{ backgroundColor: label.color || '#8b5cf6' }}
                          aria-label={`Cor: ${label.color}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{label.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{label.category || 'Geral'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {label._count?.messages || 0} msg
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(label.createdAt), {
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
                              aria-label={`Opções para ${label.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Abrir menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => openEditModal(label)}
                              aria-label="Editar label"
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(label.id)}
                              aria-label="Excluir label"
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
            <DialogTitle>Nova Label</DialogTitle>
            <DialogDescription>
              Crie uma nova label para categorizar mensagens
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Nome</Label>
              <Input
                id="create-name"
                placeholder="Ex: Urgente"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                aria-label="Nome da label"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-category">Categoria</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="create-category" aria-label="Categoria da label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  aria-label="Cor da label"
                />
                <Input
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#8b5cf6"
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
                setFormData({ name: '', color: '#8b5cf6', category: 'Geral' });
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate}>Criar Label</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Label</DialogTitle>
            <DialogDescription>
              Atualize as informações da label
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                placeholder="Ex: Urgente"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                aria-label="Nome da label"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-category">Categoria</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="edit-category" aria-label="Categoria da label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  aria-label="Cor da label"
                />
                <Input
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#8b5cf6"
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
                setSelectedLabel(null);
                setFormData({ name: '', color: '#8b5cf6', category: 'Geral' });
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
