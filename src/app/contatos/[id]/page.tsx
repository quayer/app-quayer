'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { PageContainer } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
    ArrowLeft,
    Phone,
    Mail,
    Building2,
    MessageSquare,
    Clock,
    Edit,
    Save,
    Trash2,
    FileText,
    AlertCircle,
    Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { api } from '@/igniter.client';
import { toast } from 'sonner';

export default function ContactDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const contactId = params.id as string;

    const [newNote, setNewNote] = useState('');

    // Fetch contact data from API
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['contact', contactId],
        queryFn: async () => {
            // @ts-expect-error - Igniter client type issue with path params
            const response = await api.contacts.getById.query({ id: contactId });

            if (response.error) {
                throw new Error('Erro ao carregar contato');
            }

            return response.data;
        },
        enabled: !!contactId,
    });

    // Create observation mutation
    const createObservationMutation = useMutation({
        mutationFn: async (content: string) => {
            const response = await api['contact-observation'].create.mutate({
                body: {
                    contactId,
                    content,
                },
            });

            if (response.error) {
                throw new Error('Erro ao salvar anotação');
            }

            return response.data;
        },
        onSuccess: () => {
            toast.success('Anotação salva com sucesso');
            setNewNote('');
            refetch();
        },
        onError: () => {
            toast.error('Erro ao salvar anotação');
        },
    });

    // Delete observation mutation
    const deleteObservationMutation = useMutation({
        mutationFn: async (observationId: string) => {
            // @ts-expect-error - Igniter client type issue with path params
            const response = await api['contact-observation'].delete.mutate({ id: observationId });

            if (response.error) {
                throw new Error('Erro ao excluir anotação');
            }

            return response.data;
        },
        onSuccess: () => {
            toast.success('Anotação excluída');
            refetch();
        },
        onError: () => {
            toast.error('Erro ao excluir anotação');
        },
    });

    const handleSaveNote = async () => {
        if (!newNote.trim()) {
            toast.error('Digite uma anotação');
            return;
        }

        createObservationMutation.mutate(newNote.trim());
    };

    const handleDeleteNote = async (observationId: string) => {
        if (!confirm('Deseja excluir esta anotação?')) return;
        deleteObservationMutation.mutate(observationId);
    };

    // Loading state
    if (isLoading) {
        return (
            <PageContainer>
                <div className="mb-8">
                    <Skeleton className="h-8 w-48 mb-4" />
                    <Skeleton className="h-40 w-full rounded-xl" />
                </div>
                <Skeleton className="h-10 w-64 mb-4" />
                <Skeleton className="h-64 w-full" />
            </PageContainer>
        );
    }

    // Error state
    if (error || !data?.data) {
        return (
            <PageContainer>
                <div className="flex flex-col items-center justify-center py-20">
                    <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                    <h2 className="text-xl font-semibold mb-2">Contato não encontrado</h2>
                    <p className="text-muted-foreground mb-4">
                        O contato que você está procurando não existe ou você não tem permissão para acessá-lo.
                    </p>
                    <Button onClick={() => router.push('/contatos')}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar para Contatos
                    </Button>
                </div>
            </PageContainer>
        );
    }

    const contact = data.data;

    return (
        <PageContainer>
            {/* Header / Profile Card */}
            <div className="mb-8">
                <Button
                    variant="ghost"
                    className="mb-4 pl-0 hover:pl-2 transition-all"
                    onClick={() => router.push('/contatos')}
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Contatos
                </Button>

                <div className="flex flex-col md:flex-row gap-6 items-start md:items-center bg-card p-6 rounded-xl border shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Building2 className="h-32 w-32" />
                    </div>

                    <Avatar className="h-24 w-24 border-4 border-background shadow-md">
                        <AvatarImage src={contact.profilePicUrl || undefined} />
                        <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                            {(contact.name || 'C').substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 z-10">
                        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
                            <h1 className="text-2xl font-bold tracking-tight">
                                {contact.name || 'Sem nome'}
                            </h1>
                            <Badge variant="outline" className="w-fit bg-green-500/10 text-green-600 border-green-200">
                                Ativo
                            </Badge>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                            <div className="flex items-center gap-1.5">
                                <Phone className="h-4 w-4" />
                                {contact.phoneNumber}
                            </div>
                            {contact.email && (
                                <div className="flex items-center gap-1.5">
                                    <Mail className="h-4 w-4" />
                                    {contact.email}
                                </div>
                            )}
                        </div>

                        {/* Custom Attributes */}
                        {contact.contactAttributes && contact.contactAttributes.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {contact.contactAttributes.map((attr: any) => (
                                    <Badge key={attr.id} variant="secondary" className="px-2 py-0.5">
                                        {attr.attribute?.name}: {attr.value}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2 z-10 w-full md:w-auto">
                        <Button className="w-full md:w-auto" onClick={() => router.push(`/integracoes/conversations?contact=${contact.phoneNumber}`)}>
                            <MessageSquare className="mr-2 h-4 w-4" />
                            Iniciar Conversa
                        </Button>
                        <Button variant="outline" className="w-full md:w-auto">
                            <Edit className="mr-2 h-4 w-4" />
                            Editar Perfil
                        </Button>
                    </div>
                </div>
            </div>

            {/* Content Tabs */}
            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                    <TabsTrigger value="notes">Anotações</TabsTrigger>
                    <TabsTrigger value="history">Histórico</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Dados do Contato</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">Nome</span>
                                        <p className="font-medium">{contact.name || '-'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">Data de Cadastro</span>
                                        <p className="font-medium">
                                            {contact.createdAt ? format(new Date(contact.createdAt), 'dd/MM/yyyy') : '-'}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">Telefone</span>
                                        <p className="font-medium">{contact.phoneNumber}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">Email</span>
                                        <p className="font-medium">{contact.email || '-'}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Sessões de Chat</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {contact.chatSessions && contact.chatSessions.length > 0 ? (
                                    <div className="space-y-3">
                                        {contact.chatSessions.map((session: any) => (
                                            <div key={session.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                                                <div>
                                                    <p className="text-sm font-medium">{session.organization?.name || 'Organização'}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {format(new Date(session.updatedAt), 'dd/MM/yyyy HH:mm')}
                                                    </p>
                                                </div>
                                                <Badge variant={session.status === 'open' ? 'default' : 'secondary'}>
                                                    {session.status === 'open' ? 'Aberto' : 'Fechado'}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                        Nenhuma sessão de chat encontrada
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="notes" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Anotações Internas</CardTitle>
                            <CardDescription>
                                Registre observações importantes sobre este cliente. Visível apenas para a equipe.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex gap-4">
                                <Textarea
                                    placeholder="Digite uma nova anotação..."
                                    className="min-h-[100px]"
                                    value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                    disabled={createObservationMutation.isPending}
                                />
                            </div>
                            <div className="flex justify-end">
                                <Button
                                    onClick={handleSaveNote}
                                    disabled={createObservationMutation.isPending || !newNote.trim()}
                                >
                                    {createObservationMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="mr-2 h-4 w-4" />
                                    )}
                                    Salvar Anotação
                                </Button>
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                {contact.contactObservations && contact.contactObservations.length > 0 ? (
                                    contact.contactObservations.map((note: any) => (
                                        <div key={note.id} className="flex gap-4 group">
                                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                                                <FileText className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-medium">{note.user?.name || 'Usuário'}</p>
                                                    <span className="text-xs text-muted-foreground">
                                                        {format(new Date(note.createdAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    {note.content}
                                                </p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => handleDeleteNote(note.id)}
                                                disabled={deleteObservationMutation.isPending}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-6 text-muted-foreground">
                                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                        <p>Nenhuma anotação registrada</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Histórico de Conversas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {contact.chatSessions && contact.chatSessions.filter((s: any) => s.status === 'closed').length > 0 ? (
                                <div className="space-y-3">
                                    {contact.chatSessions.filter((s: any) => s.status === 'closed').map((session: any) => (
                                        <div key={session.id} className="flex items-center justify-between p-3 rounded-lg border">
                                            <div>
                                                <p className="text-sm font-medium">{session.organization?.name || 'Conversa'}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Encerrada em {format(new Date(session.updatedAt), 'dd/MM/yyyy HH:mm')}
                                                </p>
                                            </div>
                                            <Button variant="outline" size="sm">
                                                Ver detalhes
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-10 text-muted-foreground">
                                    <Clock className="h-10 w-10 mx-auto mb-4 opacity-20" />
                                    <p>Nenhuma conversa encerrada encontrada.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </PageContainer>
    );
}
