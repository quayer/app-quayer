'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Columns3,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  TrendingUp,
  Users,
  Target,
  BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/igniter.client';

interface KanbanBoard {
  id: string;
  name: string;
  description?: string;
  columnsCount: number;
  cardsCount: number;
  createdAt: Date;
}

export default function KanbanListPage() {
  const router = useRouter();
  const [boards, setBoards] = useState<KanbanBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    loadBoards();
  }, []);

  const loadBoards = async () => {
    try {
      setLoading(true);
      const response = await api.kanban.boards.list.query({ limit: 50 });

      if (response.data) {
        setBoards(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar quadros:', error);
      toast.error('Erro ao carregar quadros Kanban');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBoard = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome do quadro é obrigatório');
      return;
    }

    try {
      const response = await api.kanban.boards.create.mutate(formData);

      if (response.data) {
        toast.success('Quadro criado com sucesso!');
        setCreateModalOpen(false);
        setFormData({ name: '', description: '' });
        loadBoards();
      }
    } catch (error) {
      console.error('Erro ao criar quadro:', error);
      toast.error('Erro ao criar quadro');
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    if (!confirm('Deseja realmente excluir este quadro?')) return;

    try {
      await fetch(`/api/v1/kanban/boards/${boardId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      toast.success('Quadro excluído com sucesso!');
      loadBoards();
    } catch (error) {
      console.error('Erro ao excluir quadro:', error);
      toast.error('Erro ao excluir quadro');
    }
  };

  if (loading) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Kanban</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex-1 space-y-4 p-8 pt-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-32" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Kanban</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 space-y-4 p-8 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Columns3 className="h-8 w-8" />
              Quadros Kanban
            </h2>
            <p className="text-muted-foreground">
              Gerencie seus funis de vendas e atendimento
            </p>
          </div>

          <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Quadro
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Quadro Kanban</DialogTitle>
                <DialogDescription>
                  Crie um novo quadro para organizar seu funil
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Quadro *</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Funil de Vendas"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição (opcional)</Label>
                  <Input
                    id="description"
                    placeholder="Descrição do quadro..."
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateBoard}>Criar Quadro</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Quadros
              </CardTitle>
              <Columns3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{boards.length}</div>
              <p className="text-xs text-muted-foreground">
                quadros ativos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Colunas
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {boards.reduce((sum, b) => sum + b.columnsCount, 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                em todos os quadros
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Cards
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {boards.reduce((sum, b) => sum + b.cardsCount, 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                contatos no funil
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Taxa de Conversão
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">23%</div>
              <p className="text-xs text-muted-foreground">
                média do período
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Boards Grid */}
        {boards.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Columns3 className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                Nenhum quadro criado ainda
              </h3>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                Crie seu primeiro quadro Kanban para organizar seu funil de
                vendas ou atendimento
              </p>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Quadro
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {boards.map((board) => (
              <Card
                key={board.id}
                className="cursor-pointer hover:shadow-md transition-shadow group"
                onClick={() => router.push(`/crm/kanban/${board.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="line-clamp-1">
                        {board.name}
                      </CardTitle>
                      {board.description && (
                        <CardDescription className="line-clamp-2 mt-1">
                          {board.description}
                        </CardDescription>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Abrir menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/crm/kanban/${board.id}`);
                          }}
                        >
                          Abrir Quadro
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Edit modal
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBoard(board.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {board.columnsCount} colunas
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {board.cardsCount} cards
                        </span>
                      </div>
                    </div>

                    <Badge variant="secondary">Ativo</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
