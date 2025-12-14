'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    ArrowLeft,
    Phone,
    Mail,
    MapPin,
    Building2,
    Calendar,
    MessageSquare,
    Clock,
    Tag,
    Edit,
    Save,
    Trash2,
    Plus,
    FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ContactDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const contactId = params.id as string;

    const [activeTab, setActiveTab] = useState('overview');

    // Mock data
    const contact = {
        id: contactId,
        name: 'Cliente Exemplo',
        phoneNumber: '5511999999999',
        email: 'cliente@exemplo.com',
        company: 'Empresa ABC Ltda',
        address: 'Av. Paulista, 1000 - SP',
        profilePictureUrl: null,
        status: 'active',
        createdAt: new Date('2024-01-15'),
        tags: [
            { id: '1', name: 'VIP', color: '#FFD700' },
            { id: '2', name: 'Novo Lead', color: '#32CD32' }
        ],
        notes: [
            { id: '1', content: 'Cliente interessado no plano Pro.', author: 'João Silva', createdAt: new Date('2024-02-10') },
            { id: '2', content: 'Agendada reunião para próxima semana.', author: 'Maria Souza', createdAt: new Date('2024-02-12') }
        ]
    };

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
                        <AvatarImage src={contact.profilePictureUrl || undefined} />
                        <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                            {contact.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 z-10">
                        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
                            <h1 className="text-2xl font-bold tracking-tight">{contact.name}</h1>
                            <Badge variant="outline" className="w-fit bg-green-500/10 text-green-600 border-green-200">
                                Ativo
                            </Badge>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                            <div className="flex items-center gap-1.5">
                                <Phone className="h-4 w-4" />
                                {contact.phoneNumber}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Mail className="h-4 w-4" />
                                {contact.email}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Building2 className="h-4 w-4" />
                                {contact.company}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            {contact.tags.map((tag) => (
                                <Badge
                                    key={tag.id}
                                    variant="secondary"
                                    className="px-2 py-0.5 border-0"
                                    style={{ backgroundColor: tag.color + '20', color: tag.color }}
                                >
                                    {tag.name}
                                </Badge>
                            ))}
                            <Button variant="outline" size="sm" className="h-6 text-xs border-dashed">
                                <Plus className="h-3 w-3 mr-1" />
                                Tag
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 z-10 w-full md:w-auto">
                        <Button className="w-full md:w-auto">
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
            <Tabs defaultValue="overview" className="space-y-4" onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                    <TabsTrigger value="notes">Anotações</TabsTrigger>
                    <TabsTrigger value="history">Histórico</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Dados Pessoais</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">Nome Completo</span>
                                        <p className="font-medium">{contact.name}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">Data de Cadastro</span>
                                        <p className="font-medium">{format(contact.createdAt, 'dd/MM/yyyy')}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">Telefone</span>
                                        <p className="font-medium">{contact.phoneNumber}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">Email</span>
                                        <p className="font-medium">{contact.email}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Endereço & Empresa</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-1">
                                    <span className="text-xs text-muted-foreground">Empresa</span>
                                    <p className="font-medium">{contact.company}</p>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-muted-foreground">Endereço</span>
                                    <p className="font-medium">{contact.address}</p>
                                </div>
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
                                <Textarea placeholder="Digite uma nova anotação..." className="min-h-[100px]" />
                            </div>
                            <div className="flex justify-end">
                                <Button>
                                    <Save className="mr-2 h-4 w-4" />
                                    Salvar Anotação
                                </Button>
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                {contact.notes.map((note) => (
                                    <div key={note.id} className="flex gap-4 group">
                                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                                            <FileText className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-medium">{note.author}</p>
                                                <span className="text-xs text-muted-foreground">
                                                    {format(note.createdAt, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                                                </span>
                                            </div>
                                            <p className="text-sm text-muted-foreground leading-relaxed">
                                                {note.content}
                                            </p>
                                        </div>
                                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
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
                            <div className="text-center py-10 text-muted-foreground">
                                <Clock className="h-10 w-10 mx-auto mb-4 opacity-20" />
                                <p>Nenhuma conversa encerrada encontrada.</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </PageContainer>
    );
}
