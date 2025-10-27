'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  Plus,
  MoreHorizontal,
  Settings,
  Trash2,
  Edit,
  GripVertical,
  Phone,
  MessageSquare,
  User,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/igniter.client';
import { cn } from '@/lib/utils';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { KanbanCard } from '@/components/kanban/KanbanCard';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  profilePictureUrl?: string;
  lastMessageAt?: Date;
  tabulations?: Array<{
    id: string;
    name: string;
  }>;
}

interface Column {
  id: string;
  title: string;
  position: number;
  color?: string;
  tabulationId?: string;
  contacts: Contact[];
}

interface Board {
  id: string;
  name: string;
  description?: string;
  columns: Column[];
}

export default function KanbanBoardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;

  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<Contact | null>(null);

  // Modals
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');

  // Sensors for drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    loadBoard();
  }, [boardId]);

  const loadBoard = async () => {
    try {
      setLoading(true);

      // Get board details
      const boardResponse = await api.kanban.boards.getById.query({
        id: boardId,
      });

      if (boardResponse.data) {
        setBoard(boardResponse.data);
      }
    } catch (error) {
      console.error('Erro ao carregar quadro:', error);
      toast.error('Erro ao carregar quadro');
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const contact = findContact(active.id as string);
    setActiveCard(contact);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const activeColumn = findColumn(activeId as string);
    const overColumn = findColumn(overId as string);

    if (!activeColumn || !overColumn) return;

    if (activeColumn.id === overColumn.id) {
      // Same column - reorder
      const activeIndex = activeColumn.contacts.findIndex(
        (c) => c.id === activeId
      );
      const overIndex = overColumn.contacts.findIndex((c) => c.id === overId);

      if (activeIndex !== overIndex) {
        setBoard((prev) => {
          if (!prev) return prev;

          const newColumns = prev.columns.map((col) => {
            if (col.id === activeColumn.id) {
              return {
                ...col,
                contacts: arrayMove(col.contacts, activeIndex, overIndex),
              };
            }
            return col;
          });

          return { ...prev, columns: newColumns };
        });
      }
    } else {
      // Different column - move
      const activeContact = activeColumn.contacts.find((c) => c.id === activeId);
      if (!activeContact) return;

      setBoard((prev) => {
        if (!prev) return prev;

        const newColumns = prev.columns.map((col) => {
          if (col.id === activeColumn.id) {
            return {
              ...col,
              contacts: col.contacts.filter((c) => c.id !== activeId),
            };
          }

          if (col.id === overColumn.id) {
            const overIndex = col.contacts.findIndex((c) => c.id === overId);
            const newContacts = [...col.contacts];
            newContacts.splice(
              overIndex >= 0 ? overIndex : col.contacts.length,
              0,
              activeContact
            );
            return {
              ...col,
              contacts: newContacts,
            };
          }

          return col;
        });

        return { ...prev, columns: newColumns };
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const activeColumn = findColumn(active.id as string);
    const overColumn = findColumn(over.id as string);

    if (!activeColumn || !overColumn) return;

    // If moved to different column, update tabulation
    if (activeColumn.id !== overColumn.id && overColumn.tabulationId) {
      try {
        await api.contacts.addTabulations.mutate({
          contactId: active.id as string,
          tabulationIds: [overColumn.tabulationId],
        });

        toast.success('Contato movido com sucesso!');
      } catch (error) {
        console.error('Erro ao mover contato:', error);
        toast.error('Erro ao mover contato');
        loadBoard(); // Reload to revert
      }
    }
  };

  const findColumn = (id: string): Column | undefined => {
    if (!board) return undefined;

    // Check if ID is a column
    const column = board.columns.find((col) => col.id === id);
    if (column) return column;

    // Check if ID is a contact in any column
    for (const col of board.columns) {
      const contact = col.contacts.find((c) => c.id === id);
      if (contact) return col;
    }

    return undefined;
  };

  const findContact = (id: string): Contact | null => {
    if (!board) return null;

    for (const col of board.columns) {
      const contact = col.contacts.find((c) => c.id === id);
      if (contact) return contact;
    }

    return null;
  };

  const handleAddColumn = async () => {
    if (!newColumnTitle.trim()) {
      toast.error('Título da coluna é obrigatório');
      return;
    }

    try {
      const response = await api.kanban.columns.create.mutate({
        boardId,
        title: newColumnTitle,
        position: board?.columns.length || 0,
      });

      if (response.data) {
        toast.success('Coluna criada com sucesso!');
        setAddColumnOpen(false);
        setNewColumnTitle('');
        loadBoard();
      }
    } catch (error) {
      console.error('Erro ao criar coluna:', error);
      toast.error('Erro ao criar coluna');
    }
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (!confirm('Deseja realmente excluir esta coluna?')) return;

    try {
      await api.kanban.columns.delete.mutate({ id: columnId });
      toast.success('Coluna excluída com sucesso!');
      loadBoard();
    } catch (error) {
      console.error('Erro ao excluir coluna:', error);
      toast.error('Erro ao excluir coluna');
    }
  };

  if (loading || !board) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando quadro...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/crm/kanban')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/crm/kanban">Kanban</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{board.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Configurar
          </Button>
        </div>
      </header>

      <div className="flex-1 p-6 overflow-x-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">{board.name}</h1>
          {board.description && (
            <p className="text-muted-foreground mt-1">{board.description}</p>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 pb-4">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                onDelete={() => handleDeleteColumn(column.id)}
              >
                <SortableContext
                  items={column.contacts.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {column.contacts.map((contact) => (
                      <KanbanCard key={contact.id} contact={contact} />
                    ))}
                  </div>
                </SortableContext>

                {column.contacts.length === 0 && (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    Arraste cards aqui
                  </div>
                )}
              </KanbanColumn>
            ))}

            {/* Add Column Button */}
            <div className="w-80 flex-shrink-0">
              <Dialog open={addColumnOpen} onOpenChange={setAddColumnOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full h-12 border-dashed"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Coluna
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova Coluna</DialogTitle>
                    <DialogDescription>
                      Adicione uma nova etapa ao funil
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Título da Coluna *</Label>
                      <Input
                        id="title"
                        placeholder="Ex: Proposta Enviada"
                        value={newColumnTitle}
                        onChange={(e) => setNewColumnTitle(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setAddColumnOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button onClick={handleAddColumn}>Criar Coluna</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <DragOverlay>
            {activeCard ? (
              <Card className="w-80 cursor-grabbing rotate-3 shadow-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={activeCard.profilePictureUrl} />
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold truncate">
                        {activeCard.name}
                      </h4>
                      <p className="text-xs text-muted-foreground font-mono">
                        {activeCard.phoneNumber}
                      </p>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </>
  );
}
