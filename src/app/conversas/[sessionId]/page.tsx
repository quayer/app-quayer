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
  FileText,
  Tag,
  User,
  X,
  CheckCheck,
  Check,
  Clock,
  AlertCircle,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/igniter.client';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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

  // Close session dialog
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closing, setClosing] = useState(false);

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
      // @ts-expect-error - Igniter client type issue with path params
      const response = await api.sessions.get.query({ id: sessionId });

      if (response.data) {
        setSession(response.data as unknown as Session);
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
        query: {
          sessionId,
          limit: 100,
        },
      });

      if (response.data) {
        // Messages are ordered desc by default, reverse for display
        const msgs = [...(response.data.data || response.data)].reverse();
        setMessages(msgs as unknown as Message[]);

        // Marcar como lidas
        if (msgs.length > 0) {
          const lastMessage = msgs[msgs.length - 1] as unknown as Message;
          if (lastMessage.direction === 'INBOUND') {
            // @ts-expect-error - Igniter client type issue with path params
            await api.messages.markAsRead.mutate({ id: lastMessage.id });
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
            // @ts-expect-error - Igniter client type issue with path params
            api.messages.markAsRead.mutate({ id: data.message.id });

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
    audio.play().catch(() => { });
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
        body: {
          sessionId,
          content: messageInput,
          type: 'text',
        },
      });

      if (response.data) {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === tempMessage.id ? (response.data as unknown as Message) : msg))
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
    try {
      setClosing(true);
      // @ts-expect-error - Igniter client type issue with path params
      await api.sessions.close.mutate({ id: sessionId });
      toast.success('Atendimento encerrado');
      router.push('/conversas');
    } catch (error) {
      console.error('Erro ao encerrar sessão:', error);
      toast.error('Erro ao encerrar atendimento');
    } finally {
      setClosing(false);
      setShowCloseDialog(false);
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
        return <Clock className="h-3 w-3 text-white/70" />;
      case 'SENT':
        return <Check className="h-3 w-3 text-white/70" />;
      case 'DELIVERED':
        return <CheckCheck className="h-3 w-3 text-white/70" />;
      case 'READ':
        return <CheckCheck className="h-3 w-3 text-blue-200" />;
      case 'FAILED':
        return <AlertCircle className="h-3 w-3 text-red-300" />;
      default:
        return null;
    }
  };

  const renderMessageContent = (message: Message) => {
    switch (message.type) {
      case 'text':
        return (
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
        );

      case 'concatenated':
        return (
          <div className="space-y-1">
            <p className="text-xs opacity-70 mb-2 flex items-center gap-1">
              <Badge variant="outline" className="h-5 px-1 text-[10px] border-current opacity-60">
                {message.metadata?.originalMessagesCount}
              </Badge>
              mensagens agrupadas
            </p>
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          </div>
        );

      case 'audio':
        return (
          <div className="space-y-2 min-w-[200px]">
            <div className="flex items-center gap-2 p-2 bg-black/5 rounded-lg">
              <Volume2 className="h-4 w-4" />
              <span className="text-xs font-medium">Áudio transcrito</span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words italic opacity-90">
              "{message.content}"
            </p>
            {message.mediaUrl && (
              <audio controls className="w-full mt-2 h-8">
                <source src={message.mediaUrl} />
              </audio>
            )}
          </div>
        );

      case 'image':
        return (
          <div className="space-y-2">
            {message.mediaUrl && (
              <div className="relative group overflow-hidden rounded-lg">
                <img
                  src={message.mediaUrl}
                  alt="Imagem"
                  className="max-w-sm w-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-105"
                  onClick={() => window.open(message.mediaUrl, '_blank')}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
              </div>
            )}
            {message.metadata?.ocr && message.content && (
              <div className="p-2 bg-black/5 rounded text-xs">
                <p className="font-medium mb-1 opacity-70">
                  Texto extraído:
                </p>
                <p className="whitespace-pre-wrap break-words opacity-90">
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
            <div className="flex items-center gap-3 p-3 bg-black/5 rounded-lg border border-black/5">
              <div className="p-2 bg-white rounded-md shadow-sm">
                {message.type === 'video' ? (
                  <Video className="h-5 w-5 text-blue-500" />
                ) : (
                  <FileText className="h-5 w-5 text-orange-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {message.type === 'video' ? 'Vídeo' : 'Documento'}
                </p>
                {message.mediaUrl && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs opacity-80 hover:opacity-100"
                    onClick={() => window.open(message.mediaUrl, '_blank')}
                  >
                    Baixar arquivo
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
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            <Loader2 className="h-10 w-10 animate-spin text-primary relative z-10 mx-auto" />
          </div>
          <p className="text-muted-foreground animate-pulse">Carregando conversa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-1rem)] flex flex-col bg-background/50 backdrop-blur-sm">
      {/* Header Premium */}
      <header className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 bg-background/80 backdrop-blur-md border-b sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/conversas')}
            className="hover:bg-primary/10 hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setSidebarOpen(true)}>
            <div className="relative">
              <Avatar className="h-10 w-10 ring-2 ring-background shadow-md transition-transform group-hover:scale-105">
                <AvatarImage src={session.contact.profilePictureUrl} />
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
            </div>

            <div>
              <h2 className="font-semibold text-base leading-none mb-1 group-hover:text-primary transition-colors">
                {session.contact.name}
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                {session.contact.phoneNumber}
              </p>
            </div>
          </div>

          <div className="flex gap-1 ml-2">
            {session.contact.tabulations?.slice(0, 2).map((tag) => (
              <Badge
                key={tag.id}
                variant="secondary"
                className="text-xs px-2 py-0.5 bg-secondary/50 hover:bg-secondary transition-colors"
                style={{ borderColor: tag.color + '40', color: tag.color }}
              >
                {tag.name}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
            <Search className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
            <Phone className="h-5 w-5" />
          </Button>

          <Separator orientation="vertical" className="h-6 mx-2" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Ações da Conversa</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  router.push(`/crm/contatos/${session.contactId}`)
                }
              >
                <User className="h-4 w-4 mr-2" />
                Ver Perfil
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Archive className="h-4 w-4 mr-2" />
                Arquivar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setShowCloseDialog(true)}
              >
                <X className="h-4 w-4 mr-2" />
                Encerrar Atendimento
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn(
              "ml-2 transition-colors",
              sidebarOpen ? "bg-primary/10 text-primary" : "text-muted-foreground"
            )}
          >
            {sidebarOpen ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <User className="h-5 w-5" />
            )}
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Messages Area */}
        <div className="flex-1 flex flex-col relative z-10">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
              backgroundSize: '24px 24px'
            }}
          />

          {/* Messages List */}
          <ScrollArea className="flex-1 px-4 py-6">
            <div className="space-y-6 max-w-4xl mx-auto pb-4">
              <AnimatePresence initial={false}>
                {messages.map((message, index) => {
                  const isOutbound = message.direction === 'OUTBOUND';
                  const showDate =
                    index === 0 ||
                    !isToday(new Date(messages[index - 1].createdAt)) ||
                    !isToday(new Date(message.createdAt));

                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                      {showDate && (
                        <div className="flex justify-center my-6">
                          <Badge variant="secondary" className="text-xs font-normal bg-muted/50 backdrop-blur-sm border-muted-foreground/10">
                            {format(new Date(message.createdAt), 'PPP', {
                              locale: ptBR,
                            })}
                          </Badge>
                        </div>
                      )}

                      <div
                        className={cn(
                          'flex gap-3 group',
                          isOutbound ? 'justify-end' : 'justify-start'
                        )}
                      >
                        {!isOutbound && (
                          <Avatar className="h-8 w-8 mt-1 ring-2 ring-background shadow-sm">
                            <AvatarImage
                              src={session.contact.profilePictureUrl}
                            />
                            <AvatarFallback className="text-xs">
                              {session.contact.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        )}

                        <div
                          className={cn(
                            'max-w-[75%] rounded-2xl p-4 shadow-sm transition-all duration-200',
                            isOutbound
                              ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-tr-sm'
                              : 'bg-white dark:bg-muted/50 border border-border/50 rounded-tl-sm hover:bg-white/80 dark:hover:bg-muted/80'
                          )}
                        >
                          {renderMessageContent(message)}

                          <div
                            className={cn(
                              'flex items-center justify-end gap-1.5 mt-1.5 select-none',
                              isOutbound
                                ? 'text-primary-foreground/70'
                                : 'text-muted-foreground/70'
                            )}
                          >
                            <span className="text-[10px] font-medium">
                              {formatMessageDate(new Date(message.createdAt))}
                            </span>
                            {isOutbound && getStatusIcon(message.status)}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="p-2 md:p-4 bg-background/80 backdrop-blur-md border-t">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-end gap-3 bg-muted/30 p-2 rounded-3xl border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all">
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-muted">
                    <Smile className="h-5 w-5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-muted">
                    <Paperclip className="h-5 w-5 text-muted-foreground" />
                  </Button>
                </div>

                <Textarea
                  ref={inputRef}
                  placeholder="Digite sua mensagem..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  rows={1}
                  className="min-h-[40px] max-h-32 resize-none border-0 bg-transparent focus-visible:ring-0 py-3 px-2 shadow-none"
                />

                <Button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || sending}
                  size="icon"
                  className={cn(
                    "h-10 w-10 rounded-full transition-all duration-300",
                    messageInput.trim()
                      ? "bg-primary hover:bg-primary/90 scale-100"
                      : "bg-muted text-muted-foreground scale-90 opacity-50"
                  )}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-xs text-center text-muted-foreground mt-2 opacity-50">
                Pressione Enter para enviar
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="border-l bg-background/95 backdrop-blur-xl md:bg-muted/10 flex flex-col overflow-hidden absolute right-0 h-full z-30 md:static shadow-2xl md:shadow-none"
            >
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-6 w-80">
                  {/* Contact Info */}
                  <Card className="border-none shadow-none bg-transparent">
                    <CardHeader className="px-0 pt-0">
                      <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Informações</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 space-y-4">
                      <div className="p-4 rounded-xl bg-background border shadow-sm">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Nome</p>
                          <p className="font-medium">{session.contact.name}</p>
                        </div>
                        <Separator className="my-3" />
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Telefone</p>
                          <p className="font-mono text-sm flex items-center gap-2">
                            {session.contact.phoneNumber}
                            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto">
                              <Phone className="h-3 w-3" />
                            </Button>
                          </p>
                        </div>
                        {session.contact.email && (
                          <>
                            <Separator className="my-3" />
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">Email</p>
                              <p className="text-sm truncate">{session.contact.email}</p>
                            </div>
                          </>
                        )}
                      </div>

                      <Button
                        variant="outline"
                        className="w-full justify-between group"
                        onClick={() =>
                          router.push(`/crm/contatos/${session.contactId}`)
                        }
                      >
                        Ver Perfil Completo
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Tags */}
                  <Card className="border-none shadow-none bg-transparent">
                    <CardHeader className="px-0 pt-0">
                      <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Tags</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0">
                      <div className="flex flex-wrap gap-2">
                        {session.contact.tabulations?.map((tag) => (
                          <Badge
                            key={tag.id}
                            variant="secondary"
                            className="px-2 py-1"
                            style={{ backgroundColor: tag.color + '20', color: tag.color }}
                          >
                            {tag.name}
                          </Badge>
                        ))}
                        <Button variant="outline" size="sm" className="h-6 text-xs border-dashed">
                          <Tag className="h-3 w-3 mr-1" />
                          Adicionar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Quick Actions */}
                  <Card className="border-none shadow-none bg-transparent">
                    <CardHeader className="px-0 pt-0">
                      <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Ações Rápidas</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 space-y-2">
                      <Button variant="outline" size="sm" className="w-full justify-start hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all">
                        <Tag className="h-4 w-4 mr-2" />
                        Gerenciar Tags
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-start hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all">
                        <FileText className="h-4 w-4 mr-2" />
                        Nova Observação
                      </Button>
                      <Separator className="my-2" />
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full justify-start opacity-90 hover:opacity-100"
                        onClick={() => setShowCloseDialog(true)}
                      >
                        <CheckCheck className="h-4 w-4 mr-2" />
                        Encerrar Atendimento
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Close Session AlertDialog */}
      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar Atendimento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja encerrar este atendimento? Esta ação arquivará a conversa e liberará o cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCloseSession}
              disabled={closing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {closing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Encerrando...
                </>
              ) : (
                'Encerrar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
