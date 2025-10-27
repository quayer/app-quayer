'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ArrowLeft,
  Send,
  Paperclip,
  Smile,
  MoreVertical,
  Phone,
  Video,
  Search,
  Archive,
  Volume2,
  Image as ImageIcon,
  File,
  Tag,
  User,
  X,
  CheckCheck,
  Check,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/igniter.client';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  content: string;
  type: 'text' | 'audio' | 'image' | 'video' | 'document' | 'concatenated';
  direction: 'INBOUND' | 'OUTBOUND';
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  author: string;
  createdAt: Date;
  mediaUrl?: string;
  metadata?: {
    concatenated?: boolean;
    originalMessagesCount?: number;
    transcribed?: boolean;
    ocr?: boolean;
  };
}

interface Session {
  id: string;
  contactId: string;
  contact: {
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
  };
  status: 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
  unreadCount: number;
  lastMessageAt?: Date;
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageInput, setMessageInput] = useState('');

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Real-time
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    loadSession();
    loadMessages();
    setupRealtime();

    return () => {
      // Cleanup SSE
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadSession = async () => {
    try {
      const response = await api.sessions.getById.query({ id: sessionId });

      if (response.data) {
        setSession(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar sessão:', error);
      toast.error('Erro ao carregar conversa');
    }
  };

  const loadMessages = async () => {
    try {
      setLoading(true);

      const response = await api.messages.list.query({
        sessionId,
        limit: 100,
        sort: 'asc',
      });

      if (response.data) {
        setMessages(response.data);

        // Marcar como lidas
        if (response.data.length > 0) {
          const lastMessage = response.data[response.data.length - 1];
          if (lastMessage.direction === 'INBOUND') {
            await api.messages.markRead.mutate({ id: lastMessage.id });
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
      toast.error('Erro ao carregar mensagens');
    } finally {
      setLoading(false);
    }
  };

  const setupRealtime = () => {
    try {
      const token = localStorage.getItem('accessToken');
      const eventSource = new EventSource(
        `/api/v1/sse/session/${sessionId}?token=${token}`
      );

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'message.received') {
            setMessages((prev) => [...prev, data.message]);

            // Marcar como lida automaticamente
            api.messages.markRead.mutate({ id: data.message.id });

            // Play notification sound
            playNotificationSound();
          } else if (data.type === 'message.status_update') {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === data.messageId
                  ? { ...msg, status: data.status }
                  : msg
              )
            );
          }
        } catch (error) {
          console.error('Erro ao processar evento SSE:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('Erro no SSE:', error);
        eventSource.close();

        // Reconectar após 5 segundos
        setTimeout(setupRealtime, 5000);
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('Erro ao configurar real-time:', error);
    }
  };

  const playNotificationSound = () => {
    // TODO: Implementar som de notificação
    const audio = new Audio('/notification.mp3');
    audio.play().catch(() => {});
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || sending) return;

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      content: messageInput,
      type: 'text',
      direction: 'OUTBOUND',
      status: 'PENDING',
      author: 'Você',
      createdAt: new Date(),
    };

    try {
      setSending(true);
      setMessages((prev) => [...prev, tempMessage]);
      setMessageInput('');

      const response = await api.messages.create.mutate({
        sessionId,
        content: messageInput,
        type: 'text',
      });

      if (response.data) {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === tempMessage.id ? response.data : msg))
        );
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Erro ao enviar mensagem');

      // Marcar como falha
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMessage.id ? { ...msg, status: 'FAILED' } : msg
        )
      );
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCloseSession = async () => {
    if (!confirm('Deseja encerrar este atendimento?')) return;

    try {
      await api.sessions.close.mutate({ id: sessionId });
      toast.success('Atendimento encerrado');
      router.push('/conversas');
    } catch (error) {
      console.error('Erro ao encerrar sessão:', error);
      toast.error('Erro ao encerrar atendimento');
    }
  };

  const formatMessageDate = (date: Date) => {
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return `Ontem ${format(date, 'HH:mm')}`;
    } else {
      return format(date, 'dd/MM/yyyy HH:mm');
    }
  };

  const getStatusIcon = (status: Message['status']) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="h-3 w-3 text-muted-foreground" />;
      case 'SENT':
        return <Check className="h-3 w-3 text-muted-foreground" />;
      case 'DELIVERED':
        return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
      case 'READ':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case 'FAILED':
        return <AlertCircle className="h-3 w-3 text-destructive" />;
      default:
        return null;
    }
  };

  const renderMessageContent = (message: Message) => {
    switch (message.type) {
      case 'text':
        return (
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
        );

      case 'concatenated':
        return (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground mb-2">
              {message.metadata?.originalMessagesCount} mensagens agrupadas
            </p>
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
          </div>
        );

      case 'audio':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
              <Volume2 className="h-4 w-4" />
              <span className="text-xs">Áudio transcrito</span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
            {message.mediaUrl && (
              <audio controls className="w-full mt-2">
                <source src={message.mediaUrl} />
              </audio>
            )}
          </div>
        );

      case 'image':
        return (
          <div className="space-y-2">
            {message.mediaUrl && (
              <img
                src={message.mediaUrl}
                alt="Imagem"
                className="rounded-lg max-w-sm cursor-pointer hover:opacity-90 transition"
                onClick={() => window.open(message.mediaUrl, '_blank')}
              />
            )}
            {message.metadata?.ocr && message.content && (
              <div className="p-2 bg-muted/50 rounded">
                <p className="text-xs text-muted-foreground mb-1">
                  Texto extraído:
                </p>
                <p className="text-sm whitespace-pre-wrap break-words">
                  {message.content}
                </p>
              </div>
            )}
          </div>
        );

      case 'video':
      case 'document':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded">
              <File className="h-5 w-5" />
              <div>
                <p className="text-sm font-medium">
                  {message.type === 'video' ? 'Vídeo' : 'Documento'}
                </p>
                {message.mediaUrl && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => window.open(message.mediaUrl, '_blank')}
                  >
                    Abrir
                  </Button>
                )}
              </div>
            </div>
            {message.content && (
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.content}
              </p>
            )}
          </div>
        );

      default:
        return <p className="text-sm">{message.content}</p>;
    }
  };

  if (loading || !session) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando conversa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-3 bg-background">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/conversas')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <Avatar className="h-10 w-10">
            <AvatarImage src={session.contact.profilePictureUrl} />
            <AvatarFallback>
              <User className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>

          <div>
            <h2 className="font-semibold">{session.contact.name}</h2>
            <p className="text-xs text-muted-foreground">
              {session.contact.phoneNumber}
            </p>
          </div>

          <div className="flex gap-1 ml-2">
            {session.contact.tabulations?.slice(0, 2).map((tag) => (
              <Badge key={tag.id} variant="secondary" className="text-xs">
                {tag.name}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Search className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Video className="h-5 w-5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Ações</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  router.push(`/crm/contatos/${session.contactId}`)
                }
              >
                Ver Detalhes do Contato
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Archive className="h-4 w-4 mr-2" />
                Arquivar Conversa
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={handleCloseSession}
              >
                Encerrar Atendimento
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <User className="h-5 w-5" />
            )}
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages List */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4 max-w-4xl mx-auto">
              {messages.map((message, index) => {
                const isOutbound = message.direction === 'OUTBOUND';
                const showDate =
                  index === 0 ||
                  !isToday(new Date(messages[index - 1].createdAt)) ||
                  !isToday(new Date(message.createdAt));

                return (
                  <div key={message.id}>
                    {showDate && (
                      <div className="flex justify-center my-4">
                        <Badge variant="secondary" className="text-xs">
                          {format(new Date(message.createdAt), 'PPP', {
                            locale: ptBR,
                          })}
                        </Badge>
                      </div>
                    )}

                    <div
                      className={cn(
                        'flex gap-2',
                        isOutbound ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {!isOutbound && (
                        <Avatar className="h-8 w-8 mt-1">
                          <AvatarImage
                            src={session.contact.profilePictureUrl}
                          />
                          <AvatarFallback>
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}

                      <div
                        className={cn(
                          'max-w-[70%] rounded-lg p-3',
                          isOutbound
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        )}
                      >
                        {renderMessageContent(message)}

                        <div
                          className={cn(
                            'flex items-center justify-end gap-2 mt-1',
                            isOutbound
                              ? 'text-primary-foreground/70'
                              : 'text-muted-foreground'
                          )}
                        >
                          <span className="text-xs">
                            {formatMessageDate(new Date(message.createdAt))}
                          </span>
                          {isOutbound && getStatusIcon(message.status)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t p-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-end gap-2">
                <Button variant="ghost" size="icon">
                  <Smile className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon">
                  <Paperclip className="h-5 w-5" />
                </Button>

                <Textarea
                  ref={inputRef}
                  placeholder="Digite uma mensagem..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  rows={1}
                  className="min-h-[44px] max-h-32 resize-none"
                />

                <Button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || sending}
                  size="icon"
                  className="h-11 w-11"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-80 border-l bg-muted/10 flex flex-col">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {/* Contact Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Informações</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Nome</p>
                      <p className="font-medium">{session.contact.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Telefone</p>
                      <p className="font-mono text-sm">
                        {session.contact.phoneNumber}
                      </p>
                    </div>
                    {session.contact.email && (
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="text-sm">{session.contact.email}</p>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        router.push(`/crm/contatos/${session.contactId}`)
                      }
                    >
                      Ver Perfil Completo
                    </Button>
                  </CardContent>
                </Card>

                {/* Tags */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Tags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {session.contact.tabulations?.map((tag) => (
                        <Badge key={tag.id} variant="secondary">
                          {tag.name}
                        </Badge>
                      ))}
                      <Button variant="outline" size="sm">
                        <Tag className="h-3 w-3 mr-1" />
                        Adicionar
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Ações Rápidas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <Tag className="h-4 w-4 mr-2" />
                      Adicionar Tag
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <FileText className="h-4 w-4 mr-2" />
                      Nova Observação
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full justify-start"
                      onClick={handleCloseSession}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Encerrar Atendimento
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
