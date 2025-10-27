'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  Phone,
  Mail,
  MessageSquare,
  Tag,
  FileText,
  Edit,
  Trash2,
  Plus,
  X,
  Calendar,
  Building,
  MapPin,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/igniter.client';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  email?: string;
  profilePictureUrl?: string;
  tabulations?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  attributes?: Array<{
    id: string;
    key: string;
    value: string;
  }>;
  observations?: Array<{
    id: string;
    content: string;
    createdBy: string;
    createdAt: Date;
  }>;
  createdAt: Date;
  lastMessageAt?: Date;
  messagesCount?: number;
}

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
  });

  // Tags
  const [addTagOpen, setAddTagOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [selectedNewTags, setSelectedNewTags] = useState<string[]>([]);

  // Observações
  const [addObservationOpen, setAddObservationOpen] = useState(false);
  const [newObservation, setNewObservation] = useState('');

  useEffect(() => {
    loadContact();
    loadAvailableTags();
  }, [contactId]);

  const loadContact = async () => {
    try {
      setLoading(true);
      const response = await api.contacts.getById.query({ id: contactId });

      if (response.data) {
        setContact(response.data);
        setFormData({
          name: response.data.name,
          email: response.data.email || '',
          phoneNumber: response.data.phoneNumber,
        });
      }
    } catch (error) {
      console.error('Erro ao carregar contato:', error);
      toast.error('Erro ao carregar contato');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableTags = async () => {
    try {
      const response = await api.tabulations.list.query({ limit: 100 });
      if (response.data) {
        setAvailableTags(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar tags:', error);
    }
  };

  const handleUpdateContact = async () => {
    try {
      await api.contacts.update.mutate({
        id: contactId,
        ...formData,
      });

      toast.success('Contato atualizado com sucesso!');
      setEditMode(false);
      loadContact();
    } catch (error) {
      console.error('Erro ao atualizar contato:', error);
      toast.error('Erro ao atualizar contato');
    }
  };

  const handleAddTags = async () => {
    try {
      await api.contacts.addTabulations.mutate({
        contactId,
        tabulationIds: selectedNewTags,
      });

      toast.success('Tags adicionadas com sucesso!');
      setAddTagOpen(false);
      setSelectedNewTags([]);
      loadContact();
    } catch (error) {
      console.error('Erro ao adicionar tags:', error);
      toast.error('Erro ao adicionar tags');
    }
  };

  const handleRemoveTag = async (tabulationId: string) => {
    try {
      await api.contacts.removeTabulations.mutate({
        contactId,
        tabulationIds: [tabulationId],
      });

      toast.success('Tag removida com sucesso!');
      loadContact();
    } catch (error) {
      console.error('Erro ao remover tag:', error);
      toast.error('Erro ao remover tag');
    }
  };

  const handleAddObservation = async () => {
    if (!newObservation.trim()) return;

    try {
      await api.contactObservation.create.mutate({
        contactId,
        content: newObservation,
      });

      toast.success('Observação adicionada!');
      setAddObservationOpen(false);
      setNewObservation('');
      loadContact();
    } catch (error) {
      console.error('Erro ao adicionar observação:', error);
      toast.error('Erro ao adicionar observação');
    }
  };

  const handleDeleteContact = async () => {
    if (!confirm('Deseja realmente excluir este contato?')) return;

    try {
      await fetch(`/api/v1/contacts/${contactId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      toast.success('Contato excluído com sucesso!');
      router.push('/crm/contatos');
    } catch (error) {
      console.error('Erro ao excluir contato:', error);
      toast.error('Erro ao excluir contato');
    }
  };

  if (loading || !contact) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="animate-pulse h-4 w-48 bg-muted rounded" />
        </header>
        <div className="flex-1 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-64 bg-muted rounded" />
            <div className="h-24 w-full bg-muted rounded" />
            <div className="h-64 w-full bg-muted rounded" />
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
              <BreadcrumbLink href="/crm/contatos">Contatos</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{contact.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/crm/contatos')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div className="flex items-start gap-4">
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                {contact.profilePictureUrl ? (
                  <img
                    src={contact.profilePictureUrl}
                    alt={contact.name}
                    className="h-20 w-20 rounded-full"
                  />
                ) : (
                  <User className="h-10 w-10 text-muted-foreground" />
                )}
              </div>

              <div>
                <h1 className="text-3xl font-bold">{contact.name}</h1>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span className="font-mono">{contact.phoneNumber}</span>
                  </div>
                  {contact.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span>{contact.email}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  {contact.tabulations?.map((tag) => (
                    <Badge key={tag.id} variant="secondary">
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setEditMode(!editMode)}
            >
              <Edit className="h-4 w-4 mr-2" />
              {editMode ? 'Cancelar' : 'Editar'}
            </Button>
            <Button variant="outline" onClick={() => router.push(`/conversas/${contact.id}`)}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Ver Conversa
            </Button>
            <Button variant="destructive" onClick={handleDeleteContact}>
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
          </div>
        </div>

        {/* Content */}
        <Tabs defaultValue="info" className="space-y-4">
          <TabsList>
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="messages">
              Mensagens ({contact.messagesCount || 0})
            </TabsTrigger>
            <TabsTrigger value="observations">
              Observações ({contact.observations?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Informações Básicas */}
              <Card>
                <CardHeader>
                  <CardTitle>Informações Básicas</CardTitle>
                  <CardDescription>
                    Dados principais do contato
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editMode ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="name">Nome</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) =>
                            setFormData({ ...formData, email: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Telefone</Label>
                        <Input
                          id="phone"
                          value={formData.phoneNumber}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              phoneNumber: e.target.value,
                            })
                          }
                        />
                      </div>
                      <Button onClick={handleUpdateContact} className="w-full">
                        Salvar Alterações
                      </Button>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label className="text-muted-foreground">Nome</Label>
                        <p className="text-lg font-medium">{contact.name}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Telefone</Label>
                        <p className="font-mono">{contact.phoneNumber}</p>
                      </div>
                      {contact.email && (
                        <div>
                          <Label className="text-muted-foreground">Email</Label>
                          <p>{contact.email}</p>
                        </div>
                      )}
                      <div>
                        <Label className="text-muted-foreground">
                          Cadastrado em
                        </Label>
                        <p>
                          {format(new Date(contact.createdAt), 'PPP', {
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                      {contact.lastMessageAt && (
                        <div>
                          <Label className="text-muted-foreground">
                            Última mensagem
                          </Label>
                          <p>
                            {formatDistanceToNow(
                              new Date(contact.lastMessageAt),
                              { addSuffix: true, locale: ptBR }
                            )}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Tags */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Tags</CardTitle>
                      <CardDescription>
                        Categorias e classificações
                      </CardDescription>
                    </div>
                    <Dialog open={addTagOpen} onOpenChange={setAddTagOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Plus className="h-4 w-4 mr-2" />
                          Adicionar
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Adicionar Tags</DialogTitle>
                          <DialogDescription>
                            Selecione as tags para adicionar ao contato
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <ScrollArea className="h-64">
                            <div className="space-y-2">
                              {availableTags
                                .filter(
                                  (tag) =>
                                    !contact.tabulations?.some(
                                      (t) => t.id === tag.id
                                    )
                                )
                                .map((tag) => (
                                  <Button
                                    key={tag.id}
                                    variant={
                                      selectedNewTags.includes(tag.id)
                                        ? 'default'
                                        : 'outline'
                                    }
                                    className="w-full justify-start"
                                    onClick={() => {
                                      if (selectedNewTags.includes(tag.id)) {
                                        setSelectedNewTags(
                                          selectedNewTags.filter(
                                            (id) => id !== tag.id
                                          )
                                        );
                                      } else {
                                        setSelectedNewTags([
                                          ...selectedNewTags,
                                          tag.id,
                                        ]);
                                      }
                                    }}
                                  >
                                    <Tag className="h-4 w-4 mr-2" />
                                    {tag.name}
                                  </Button>
                                ))}
                            </div>
                          </ScrollArea>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={handleAddTags}
                            disabled={selectedNewTags.length === 0}
                          >
                            Adicionar {selectedNewTags.length} tag(s)
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {contact.tabulations?.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhuma tag adicionada
                      </p>
                    ) : (
                      contact.tabulations?.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="secondary"
                          className="pl-3 pr-2 py-1"
                        >
                          {tag.name}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 ml-2 hover:bg-transparent"
                            onClick={() => handleRemoveTag(tag.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="messages">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Mensagens</CardTitle>
                <CardDescription>
                  Total de {contact.messagesCount || 0} mensagens
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground text-center py-12">
                  Ver histórico completo de mensagens
                </p>
                <Button className="w-full" onClick={() => router.push(`/conversas/${contact.id}`)}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Abrir Conversa
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="observations" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Observações Internas</CardTitle>
                    <CardDescription>
                      Anotações visíveis apenas para a equipe
                    </CardDescription>
                  </div>
                  <Dialog
                    open={addObservationOpen}
                    onOpenChange={setAddObservationOpen}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Nova Observação
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Nova Observação</DialogTitle>
                        <DialogDescription>
                          Adicione uma anotação sobre este contato
                        </DialogDescription>
                      </DialogHeader>
                      <Textarea
                        placeholder="Digite sua observação..."
                        value={newObservation}
                        onChange={(e) => setNewObservation(e.target.value)}
                        rows={6}
                      />
                      <DialogFooter>
                        <Button onClick={handleAddObservation}>
                          Adicionar Observação
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  {contact.observations?.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-12">
                      Nenhuma observação adicionada
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {contact.observations?.map((obs) => (
                        <Card key={obs.id}>
                          <CardContent className="pt-4">
                            <p className="text-sm whitespace-pre-wrap">
                              {obs.content}
                            </p>
                            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                              <span>{obs.createdBy}</span>
                              <span>•</span>
                              <span>
                                {formatDistanceToNow(new Date(obs.createdAt), {
                                  addSuffix: true,
                                  locale: ptBR,
                                })}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
