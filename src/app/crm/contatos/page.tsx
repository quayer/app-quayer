'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
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
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  Users,
  Tag,
  MessageSquare,
  Phone,
  Mail,
  Edit,
  Trash2,
  UserPlus,
  RefreshCw,
  Download,
  Upload,
  ArrowUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/igniter.client';
import { formatDistanceToNow } from 'date-fns';
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
  lastMessageAt?: Date;
  messagesCount?: number;
  createdAt: Date;
}

interface ContactsStats {
  total: number;
  vip: number;
  leads: number;
  new: number;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string>('recent');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<ContactsStats>({
    total: 0,
    vip: 0,
    leads: 0,
    new: 0,
  });

  // Carregar contatos da API
  useEffect(() => {
    loadContacts();
  }, [page, searchTerm, selectedTags, sortBy]);

  const loadContacts = async () => {
    try {
      setLoading(true);

      const response = await api.contacts.list.query({
        page,
        limit: 20,
        search: searchTerm || undefined,
        tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined,
        sort: sortBy,
      });

      if (response.data) {
        setContacts(response.data);
        setTotalPages(response.pagination?.total_pages || 1);

        // Calcular stats
        const vipContacts = response.data.filter((c: Contact) =>
          c.tabulations?.some((t) => t.name.toLowerCase().includes('vip'))
        );
        const leadContacts = response.data.filter((c: Contact) =>
          c.tabulations?.some((t) => t.name.toLowerCase().includes('lead'))
        );
        const newContacts = response.data.filter((c: Contact) => {
          const daysSinceCreated =
            (Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24);
          return daysSinceCreated <= 7;
        });

        setStats({
          total: response.pagination?.total_data || 0,
          vip: vipContacts.length,
          leads: leadContacts.length,
          new: newContacts.length,
        });
      }
    } catch (error) {
      console.error('Erro ao carregar contatos:', error);
      toast.error('Erro ao carregar contatos');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContacts(contacts.map((c) => c.id));
    } else {
      setSelectedContacts([]);
    }
  };

  const handleSelectContact = (contactId: string, checked: boolean) => {
    if (checked) {
      setSelectedContacts([...selectedContacts, contactId]);
    } else {
      setSelectedContacts(selectedContacts.filter((id) => id !== contactId));
    }
  };

  const handleDeleteContacts = async () => {
    if (selectedContacts.length === 0) return;

    if (!confirm(`Deseja realmente excluir ${selectedContacts.length} contato(s)?`)) {
      return;
    }

    try {
      // API não tem delete em massa, fazer individual
      await Promise.all(
        selectedContacts.map((id) =>
          fetch(`/api/v1/contacts/${id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
            },
          })
        )
      );

      toast.success(`${selectedContacts.length} contato(s) excluído(s)`);
      setSelectedContacts([]);
      loadContacts();
    } catch (error) {
      console.error('Erro ao excluir contatos:', error);
      toast.error('Erro ao excluir contatos');
    }
  };

  const handleExportContacts = async () => {
    toast.info('Exportando contatos...');
    // TODO: Implementar exportação CSV/Excel
  };

  if (loading && contacts.length === 0) {
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
                <BreadcrumbPage>Contatos</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex-1 space-y-4 p-8 pt-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-32" />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
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
              <BreadcrumbPage>Contatos</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 space-y-4 p-8 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Users className="h-8 w-8" />
              Contatos CRM
            </h2>
            <p className="text-muted-foreground">
              Gerencie seus contatos e clientes
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportContacts}>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
            <Button size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Novo Contato
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Contatos
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                contatos cadastrados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">VIP</CardTitle>
              <Tag className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.vip}</div>
              <p className="text-xs text-muted-foreground">
                contatos prioritários
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Leads</CardTitle>
              <UserPlus className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.leads}</div>
              <p className="text-xs text-muted-foreground">
                potenciais clientes
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Novos (7d)</CardTitle>
              <Plus className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.new}</div>
              <p className="text-xs text-muted-foreground">últimos 7 dias</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Actions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar contatos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-48">
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Ordenar por" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Mais recentes</SelectItem>
                    <SelectItem value="name">Nome (A-Z)</SelectItem>
                    <SelectItem value="messages">Mais mensagens</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant="outline" size="icon" onClick={loadContacts}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              {selectedContacts.length > 0 && (
                <div className="flex items-center gap-2 ml-4">
                  <Badge variant="secondary">
                    {selectedContacts.length} selecionado(s)
                  </Badge>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteContacts}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        selectedContacts.length === contacts.length &&
                        contacts.length > 0
                      }
                      onCheckedChange={handleSelectAll}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Última Mensagem</TableHead>
                  <TableHead>Mensagens</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">
                        Nenhum contato encontrado
                      </h3>
                      <p className="text-muted-foreground mb-6">
                        {searchTerm
                          ? 'Tente ajustar os filtros de pesquisa'
                          : 'Comece adicionando seu primeiro contato'}
                      </p>
                      {!searchTerm && (
                        <Button>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Adicionar Contato
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedContacts.includes(contact.id)}
                          onCheckedChange={(checked) =>
                            handleSelectContact(contact.id, checked as boolean)
                          }
                          aria-label={`Selecionar ${contact.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            {contact.profilePictureUrl ? (
                              <img
                                src={contact.profilePictureUrl}
                                alt={contact.name}
                                className="h-10 w-10 rounded-full"
                              />
                            ) : (
                              <Users className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{contact.name}</p>
                            {contact.email && (
                              <p className="text-xs text-muted-foreground">
                                {contact.email}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm">
                            {contact.phoneNumber}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {contact.tabulations?.slice(0, 3).map((tag) => (
                            <Badge
                              key={tag.id}
                              variant="secondary"
                              className="text-xs"
                            >
                              {tag.name}
                            </Badge>
                          ))}
                          {(contact.tabulations?.length || 0) > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{(contact.tabulations?.length || 0) - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {contact.lastMessageAt ? (
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(
                              new Date(contact.lastMessageAt),
                              {
                                addSuffix: true,
                                locale: ptBR,
                              }
                            )}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Nunca
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          <span>{contact.messagesCount || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Abrir menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuItem>
                              <MessageSquare className="h-4 w-4 mr-2" />
                              Ver Conversa
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Tag className="h-4 w-4 mr-2" />
                              Gerenciar Tags
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Página {page} de {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
