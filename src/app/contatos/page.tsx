'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/igniter.client';
import { PageContainer, PageHeader } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Users,
    Search,
    MoreVertical,
    Filter,
    Download,
    Phone,
    Mail,
    MessageSquare,
    Tag,
    Trash2,
    UserCog,
    RefreshCcw,
    AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
import { toast } from 'sonner';

interface Contact {
    id: string;
    name: string | null;
    phoneNumber: string;
    email: string | null;
    profilePicUrl: string | null;
    tags: string[];
    lastInteractionAt: Date | string;
    lastSessionStatus: string | null;
    organizationName: string | null;
}

export default function ContactsPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
    const limit = 20;

    // Fetch contacts from API
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['contacts', page, searchTerm],
        queryFn: async () => {
            const response = await api.contacts.list.query({
                query: {
                    page,
                    limit,
                    search: searchTerm || undefined,
                },
            });

            if (response.error) {
                throw new Error((response.error as any)?.message || 'Erro ao carregar contatos');
            }

            return response.data;
        },
    });

    // Delete contact mutation
    const deleteMutation = useMutation({
        mutationFn: async (contactId: string) => {
            // @ts-expect-error - Igniter.js mutation params handled internally
            const response = await api.contacts.delete.mutate(contactId);

            if (response.error) {
                throw new Error((response.error as any)?.message || 'Erro ao deletar contato');
            }

            return response.data;
        },
        onSuccess: () => {
            toast.success('Contato deletado com sucesso');
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
            setDeleteContactId(null);
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    const contacts = (data?.data || []) as Contact[];
    const pagination = data?.pagination || { total: 0, totalPages: 0, page: 1, limit };

    const handleSearch = () => {
        setPage(1);
        refetch();
    };

    const handleDeleteContact = (contactId: string) => {
        setDeleteContactId(contactId);
    };

    const confirmDelete = () => {
        if (deleteContactId) {
            deleteMutation.mutate(deleteContactId);
        }
    };

    if (error) {
        return (
            <PageContainer>
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        {(error as Error).message || 'Erro ao carregar contatos'}
                    </AlertDescription>
                </Alert>
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <PageHeader
                title="Contatos"
                description="Gerencie sua base de clientes e leads."
                icon={<Users className="h-6 w-6 text-primary" />}
                actions={
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => refetch()}>
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            Atualizar
                        </Button>
                        <Button
                            variant="outline"
                            disabled={contacts.length === 0}
                            onClick={() => {
                                // Export contacts as CSV
                                if (contacts.length === 0) return;
                                const headers = ['Nome', 'Telefone', 'Email', 'Tags', 'Ultima Interacao'];
                                const rows = contacts.map((c) => [
                                    c.name || 'Sem nome',
                                    c.phoneNumber,
                                    c.email || '',
                                    c.tags.join(', '),
                                    new Date(c.lastInteractionAt).toLocaleString('pt-BR'),
                                ]);
                                const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
                                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = `contatos-${new Date().toISOString().split('T')[0]}.csv`;
                                link.click();
                                URL.revokeObjectURL(url);
                            }}
                        >
                            <Download className="mr-2 h-4 w-4" />
                            Exportar
                        </Button>
                    </div>
                }
            />

            <div className="space-y-4">
                {/* Filters & Search */}
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg border shadow-sm">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nome, telefone ou email..."
                            className="pl-8"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button variant="outline" className="flex-1 sm:flex-none" disabled>
                            <Filter className="mr-2 h-4 w-4" />
                            Filtros
                        </Button>
                        <Button variant="outline" className="flex-1 sm:flex-none" disabled>
                            <Tag className="mr-2 h-4 w-4" />
                            Tags
                        </Button>
                    </div>
                </div>

                {/* Table */}
                <div className="rounded-md border bg-card shadow-sm overflow-hidden overflow-x-auto">
                    {isLoading ? (
                        <div className="p-4 space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </div>
                    ) : contacts.length === 0 ? (
                        <div className="text-center py-12">
                            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-semibold mb-2">Nenhum contato encontrado</h3>
                            <p className="text-muted-foreground">
                                {searchTerm
                                    ? 'Tente ajustar sua busca'
                                    : 'Os contatos aparecem automaticamente quando clientes interagem via WhatsApp'}
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead className="w-[300px]">Contato</TableHead>
                                    <TableHead>Tags</TableHead>
                                    <TableHead>Ultima Interacao</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Acoes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {contacts.map((contact) => (
                                    <TableRow
                                        key={contact.id}
                                        className="group hover:bg-muted/50 transition-colors"
                                    >
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                                                    <AvatarImage src={contact.profilePicUrl || undefined} />
                                                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                                        {(contact.name || contact.phoneNumber).substring(0, 2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col">
                                                    <span
                                                        className="font-medium cursor-pointer hover:text-primary transition-colors"
                                                        onClick={() => router.push(`/contatos/${contact.id}`)}
                                                    >
                                                        {contact.name || 'Sem nome'}
                                                    </span>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <span className="flex items-center gap-1">
                                                            <Phone className="h-3 w-3" />
                                                            {contact.phoneNumber}
                                                        </span>
                                                        {contact.email && (
                                                            <span className="flex items-center gap-1">
                                                                <Mail className="h-3 w-3" />
                                                                {contact.email}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {contact.tags.length > 0 ? (
                                                    contact.tags.map((tag, idx) => (
                                                        <Badge
                                                            key={idx}
                                                            variant="secondary"
                                                            className="text-xs px-2 py-0.5"
                                                        >
                                                            {tag}
                                                        </Badge>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">
                                                        Sem tags
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-muted-foreground">
                                                {formatDistanceToNow(new Date(contact.lastInteractionAt), {
                                                    addSuffix: true,
                                                    locale: ptBR,
                                                })}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={`text-xs font-normal ${
                                                    contact.lastSessionStatus === 'ACTIVE'
                                                        ? 'bg-green-500/10 text-green-600 border-green-200'
                                                        : contact.lastSessionStatus === 'CLOSED'
                                                        ? 'bg-gray-500/10 text-gray-600 border-gray-200'
                                                        : 'bg-yellow-500/10 text-yellow-600 border-yellow-200'
                                                }`}
                                            >
                                                {contact.lastSessionStatus === 'ACTIVE'
                                                    ? 'Ativo'
                                                    : contact.lastSessionStatus === 'CLOSED'
                                                    ? 'Encerrado'
                                                    : contact.lastSessionStatus || 'Novo'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                                                    onClick={() => router.push('/integracoes/conversations')}
                                                >
                                                    <MessageSquare className="h-4 w-4" />
                                                </Button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                                                        >
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Acoes</DropdownMenuLabel>
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                router.push(`/contatos/${contact.id}`)
                                                            }
                                                        >
                                                            <UserCog className="mr-2 h-4 w-4" />
                                                            Ver Detalhes
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem disabled>
                                                            <Tag className="mr-2 h-4 w-4" />
                                                            Editar Tags
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            className="text-destructive focus:text-destructive"
                                                            onClick={() => handleDeleteContact(contact.id)}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Excluir
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>

                {/* Pagination */}
                {pagination.total > 0 && (
                    <div className="flex items-center justify-between px-2">
                        <span className="text-sm text-muted-foreground">
                            Mostrando {contacts.length} de {pagination.total.toLocaleString()} contatos
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page === 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                                Anterior
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= pagination.totalPages}
                                onClick={() => setPage((p) => p + 1)}
                            >
                                Proxima
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteContactId} onOpenChange={() => setDeleteContactId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Deletar Contato</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja deletar este contato? Esta acao nao pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={confirmDelete}
                        >
                            Deletar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </PageContainer>
    );
}
