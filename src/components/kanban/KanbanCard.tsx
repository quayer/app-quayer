'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  User,
  Phone,
  MessageSquare,
  MoreHorizontal,
  Edit,
  Tag,
  GripVertical,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

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

interface KanbanCardProps {
  contact: Contact;
}

export function KanbanCard({ contact }: KanbanCardProps) {
  const router = useRouter();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: contact.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleViewConversation = () => {
    // Find session for this contact and navigate
    router.push(`/conversas?contactId=${contact.id}`);
  };

  const handleEditContact = () => {
    router.push(`/crm/contatos/${contact.id}`);
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-primary'
      )}
      role="listitem"
      aria-label={`Card do contato ${contact.name}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 touch-none"
            aria-label="Arraste para mover card"
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </div>

          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={contact.profilePictureUrl} alt={contact.name} />
            <AvatarFallback>
              <User className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate">{contact.name}</h4>
            <p className="text-xs text-muted-foreground font-mono truncate">
              <Phone className="h-3 w-3 inline mr-1" aria-hidden="true" />
              {contact.phoneNumber}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                aria-label={`Opções do contato ${contact.name}`}
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
                  handleViewConversation();
                }}
                aria-label="Ver conversa"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Ver Conversa
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditContact();
                }}
                aria-label="Editar contato"
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar Contato
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled aria-label="Gerenciar tags">
                <Tag className="h-4 w-4 mr-2" />
                Gerenciar Tags
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {/* Last Message Time */}
        {contact.lastMessageAt && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3 w-3" aria-hidden="true" />
            <span>
              Última mensagem{' '}
              {formatDistanceToNow(new Date(contact.lastMessageAt), {
                locale: ptBR,
                addSuffix: true,
              })}
            </span>
          </div>
        )}

        {/* Tags */}
        {contact.tabulations && contact.tabulations.length > 0 && (
          <div className="flex flex-wrap gap-1" role="list" aria-label="Tags do contato">
            {contact.tabulations.slice(0, 3).map((tab) => (
              <Badge key={tab.id} variant="secondary" className="text-xs" role="listitem">
                {tab.name}
              </Badge>
            ))}
            {contact.tabulations.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{contact.tabulations.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
