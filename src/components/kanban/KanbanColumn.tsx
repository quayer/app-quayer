'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Settings,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface KanbanColumnProps {
  column: Column;
  onDelete?: () => void;
  onEdit?: () => void;
  children?: React.ReactNode;
}

export function KanbanColumn({
  column,
  onDelete,
  onEdit,
  children,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        'w-80 flex-shrink-0 flex flex-col transition-colors',
        isOver && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <GripVertical
              className="h-5 w-5 text-muted-foreground cursor-grab flex-shrink-0"
              aria-label="Arraste para reordenar coluna"
            />
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base truncate flex items-center gap-2">
                {column.color && (
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: column.color }}
                    aria-label={`Cor da coluna: ${column.color}`}
                  />
                )}
                {column.title}
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                {column.contacts.length}{' '}
                {column.contacts.length === 1 ? 'card' : 'cards'}
              </CardDescription>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                aria-label={`Opções da coluna ${column.title}`}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Abrir menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Ações</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={onEdit}
                disabled={!onEdit}
                aria-label="Editar coluna"
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem disabled aria-label="Configurações da coluna">
                <Settings className="h-4 w-4 mr-2" />
                Configurar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={onDelete}
                disabled={!onDelete}
                aria-label="Excluir coluna"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {column.tabulationId && (
          <Badge variant="secondary" className="w-fit text-xs">
            Tabulação vinculada
          </Badge>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-[calc(100vh-240px)] px-3 pb-3">
          <div className="space-y-2" role="list" aria-label={`Cards da coluna ${column.title}`}>
            {children}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
