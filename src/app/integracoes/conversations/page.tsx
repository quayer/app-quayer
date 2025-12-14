'use client'

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  MessageSquare,
  Send,
  Image as ImageIcon,
  Paperclip,
  Search,
  Phone,
  Video,
  MoreVertical,
  Check,
  CheckCheck,
  X,
  Loader2,
  Menu,
  ArrowLeft,
  RefreshCw,
  Radio,
  Filter,
  Smile,
  Mic,
  MapPin,
  User,
  FileText,
  Archive,
  Trash2,
  Ban,
  Clock,
  MessageCircle,
  Users,
  Pin,
  AlertCircle,
} from 'lucide-react'
import { api } from '@/igniter.client'
import { useAuth } from '@/lib/auth/auth-provider'
import { toast } from 'sonner'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

// Common emojis for quick access
const QUICK_EMOJIS = ['😊', '👍', '❤️', '😂', '🙏', '👋', '🎉', '✅', '⭐', '🔥']

// ==================== CONSTANTS ====================
const CHAT_REFRESH_INTERVAL = 10 * 1000 // 10 segundos
const MESSAGE_REFRESH_INTERVAL = 5 * 1000 // 5 segundos

type ChatFilter = 'all' | 'unread' | 'groups' | 'pinned'

const CHAT_FILTERS: { value: ChatFilter; label: string; icon: any }[] = [
  { value: 'all', label: 'Todas', icon: MessageCircle },
  { value: 'unread', label: 'Não lidas', icon: MessageSquare },
  { value: 'groups', label: 'Grupos', icon: Users },
  { value: 'pinned', label: 'Fixadas', icon: Pin },
]

// ==================== TYPES ====================
interface UAZChat {
  wa_chatid: string
  wa_name: string | null
  wa_profilePicUrl: string | null
  wa_lastMsgTimestamp: number
  wa_lastMsgBody: string | null
  wa_unreadCount: number
  wa_isGroup: boolean
  wa_isPinned: boolean
}

interface DBMessage {
  id: string
  sessionId: string
  contactId: string
  waMessageId: string
  direction: 'INBOUND' | 'OUTBOUND'
  type: string
  author: string
  content: string
  status: string
  mediaUrl: string | null
  fileName: string | null
  createdAt: string
  contact: {
    id: string
    phoneNumber: string
    name: string | null
    profilePicUrl: string | null
  }
}

interface Instance {
  id: string
  name: string
  phoneNumber: string | null
  status: string
  profilePictureUrl: string | null
  uazapiToken: string | null
}

// ==================== COMPONENT ====================
export default function ConversationsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Hydration
  const [isHydrated, setIsHydrated] = useState(false)

  // Selection state
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)

  // Input state
  const [messageText, setMessageText] = useState('')
  const [searchText, setSearchText] = useState('')
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all')

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // UI state
  const [isMobile, setIsMobile] = useState(false)
  const [isChatsDrawerOpen, setIsChatsDrawerOpen] = useState(false)
  const [isInstancesDrawerOpen, setIsInstancesDrawerOpen] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageInputRef = useRef<HTMLInputElement>(null)

  // ==================== EFFECTS ====================
  useEffect(() => {
    setIsHydrated(true)

    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // ==================== QUERIES ====================

  // Fetch instances
  const {
    data: instancesData,
    isLoading: instancesLoading,
    error: instancesError,
    isFetching: instancesFetching,
    refetch: refetchInstances,
  } = useQuery({
    queryKey: ['conversations', 'instances'],
    queryFn: async () => {
      const response = await api.instances.list.query({ query: {} })
      return response
    },
    refetchInterval: CHAT_REFRESH_INTERVAL,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  // Extract connected instances
  const instances = useMemo(() => {
    const response = instancesData as any
    const data = response?.data?.data ?? response?.data ?? []
    return data.filter((i: Instance) => i.status === 'CONNECTED' || i.status === 'connected')
  }, [instancesData])

  // Auto-select first instance
  useEffect(() => {
    if (instances.length > 0 && !selectedInstanceId) {
      setSelectedInstanceId(instances[0].id)
    }
  }, [instances, selectedInstanceId])

  // Fetch chats for selected instance
  const {
    data: chatsData,
    isLoading: chatsLoading,
    error: chatsError,
    isFetching: chatsFetching,
    refetch: refetchChats,
  } = useQuery({
    queryKey: ['conversations', 'chats', selectedInstanceId, chatFilter],
    queryFn: async () => {
      if (!selectedInstanceId) return null
      const response = await api.chats.list.query({
        query: {
          instanceId: selectedInstanceId,
          status: chatFilter,
          limit: 50,
          offset: 0,
        }
      })
      return response
    },
    enabled: !!selectedInstanceId,
    refetchInterval: CHAT_REFRESH_INTERVAL,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  // Extract chats with search filter
  const chats = useMemo(() => {
    const response = chatsData as any
    const data: UAZChat[] = response?.data?.chats ?? response?.chats ?? []

    if (!searchText.trim()) return data

    const search = searchText.toLowerCase()
    return data.filter(chat =>
      chat.wa_name?.toLowerCase().includes(search) ||
      chat.wa_chatid.toLowerCase().includes(search) ||
      chat.wa_lastMsgBody?.toLowerCase().includes(search)
    )
  }, [chatsData, searchText])

  // Fetch messages for selected chat
  const {
    data: messagesData,
    isLoading: messagesLoading,
    isFetching: messagesFetching,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ['conversations', 'messages', selectedChatId],
    queryFn: async () => {
      if (!selectedChatId) return null
      // Use sessions-based API
      const response = await api.messages.list.query({
        query: {
          sessionId: selectedChatId,
          limit: 100,
          page: 1,
        }
      })
      return response
    },
    enabled: !!selectedChatId,
    refetchInterval: MESSAGE_REFRESH_INTERVAL,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  // Extract messages
  const messages = useMemo(() => {
    const response = messagesData as any
    return response?.data?.data ?? response?.data ?? []
  }, [messagesData])

  // Selected items
  const selectedInstance = instances.find((i: Instance) => i.id === selectedInstanceId)
  const selectedChat = chats.find((c: UAZChat) => c.wa_chatid === selectedChatId)

  // ==================== MUTATIONS ====================

  // Send text message
  const sendMessageMutation = useMutation({
    mutationFn: async (data: { sessionId: string; content: string }) => {
      const response = await api.messages.create.mutate({
        body: {
          sessionId: data.sessionId,
          type: 'text',
          direction: 'OUTBOUND',
          author: 'AGENT',
          content: data.content,
          sendExternalMessage: true,
          showTyping: true,
          delayMs: 500,
        }
      })
      return response
    },
    onSuccess: () => {
      setMessageText('')
      refetchMessages()
      toast.success('Mensagem enviada!')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao enviar mensagem')
    }
  })

  // Mark chat as read
  const markAsReadMutation = useMutation({
    mutationFn: async (data: { instanceId: string; chatId: string }) => {
      const response = await api.chats.markAsRead.mutate({
        body: {
          instanceId: data.instanceId,
          chatId: data.chatId,
        }
      })
      return response
    },
    onSuccess: () => {
      refetchChats()
    }
  })

  // Archive chat
  const archiveChatMutation = useMutation({
    mutationFn: async (chatId: string) => {
      if (!selectedInstanceId) throw new Error('Nenhuma instância selecionada')
      const response = await (api.chats as any).archive.mutate({
        params: { chatId },
        body: { instanceId: selectedInstanceId }
      })
      return response
    },
    onSuccess: () => {
      toast.success('Chat arquivado')
      refetchChats()
      if (selectedChatId) setSelectedChatId(null)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao arquivar chat')
    }
  })

  // Block contact
  const blockContactMutation = useMutation({
    mutationFn: async (data: { chatId: string; block: boolean }) => {
      if (!selectedInstanceId) throw new Error('Nenhuma instância selecionada')
      const response = await (api.chats as any).block.mutate({
        params: { chatId: data.chatId },
        body: { instanceId: selectedInstanceId, block: data.block }
      })
      return response
    },
    onSuccess: (_, variables) => {
      toast.success(variables.block ? 'Contato bloqueado' : 'Contato desbloqueado')
      refetchChats()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao bloquear contato')
    }
  })

  // ==================== HANDLERS ====================

  const handleSelectChat = useCallback((chatId: string) => {
    setSelectedChatId(chatId)

    // Mark as read automatically
    if (selectedInstanceId) {
      const chat = chats.find(c => c.wa_chatid === chatId)
      if (chat && chat.wa_unreadCount > 0) {
        markAsReadMutation.mutate({
          instanceId: selectedInstanceId,
          chatId: chatId,
        })
      }
    }

    // Close drawer on mobile
    if (isMobile) {
      setIsChatsDrawerOpen(false)
    }
  }, [selectedInstanceId, chats, isMobile, markAsReadMutation])

  const handleSelectInstance = useCallback((instanceId: string) => {
    setSelectedInstanceId(instanceId)
    setSelectedChatId(null)

    if (isMobile) {
      setIsInstancesDrawerOpen(false)
    }
  }, [isMobile])

  const handleSendMessage = useCallback(() => {
    if (!messageText.trim() || !selectedChatId) return

    sendMessageMutation.mutate({
      sessionId: selectedChatId,
      content: messageText.trim(),
    })
  }, [messageText, selectedChatId, sendMessageMutation])

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate size (16MB max)
    if (file.size > 16 * 1024 * 1024) {
      toast.error('Arquivo muito grande', { description: 'Tamanho máximo: 16MB' })
      return
    }

    setSelectedFile(file)

    // Generate preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onloadend = () => setFilePreview(reader.result as string)
      reader.readAsDataURL(file)
    } else {
      setFilePreview(null)
    }
  }, [])

  const handleSendFile = useCallback(async () => {
    if (!selectedFile || !selectedInstanceId || !selectedChatId) return

    setIsUploading(true)

    try {
      const reader = new FileReader()

      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1]
        const isImage = selectedFile.type.startsWith('image/')

        const endpoint = isImage ? api.media.sendImage : api.media.sendDocument

        await endpoint.mutate({
          body: {
            instanceId: selectedInstanceId,
            chatId: selectedChatId,
            mediaBase64: base64,
            mimeType: selectedFile.type,
            fileName: selectedFile.name,
            caption: messageText || undefined
          }
        })

        setSelectedFile(null)
        setFilePreview(null)
        setMessageText('')
        refetchMessages()

        toast.success('Arquivo enviado!', { description: selectedFile.name })
      }

      reader.onerror = () => toast.error('Erro ao ler arquivo')
      reader.readAsDataURL(selectedFile)
    } catch (error: any) {
      toast.error('Erro ao enviar arquivo', { description: error.message })
    } finally {
      setIsUploading(false)
    }
  }, [selectedFile, selectedInstanceId, selectedChatId, messageText, refetchMessages])

  const handleCancelFile = useCallback(() => {
    setSelectedFile(null)
    setFilePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleManualRefresh = useCallback(async () => {
    await Promise.all([
      refetchInstances(),
      refetchChats(),
      refetchMessages(),
    ])
    toast.success('Dados atualizados')
  }, [refetchInstances, refetchChats, refetchMessages])

  // Auto-scroll to latest message
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // ==================== HELPER FUNCTIONS ====================

  const formatTimestamp = (timestamp: number | string) => {
    const date = typeof timestamp === 'number'
      ? new Date(timestamp * 1000)
      : new Date(timestamp)

    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return format(date, 'HH:mm', { locale: ptBR })
    } else if (diffDays === 1) {
      return 'Ontem'
    } else if (diffDays < 7) {
      return format(date, 'EEEE', { locale: ptBR })
    }
    return format(date, 'dd/MM/yyyy', { locale: ptBR })
  }

  const getStatusIcon = (status: string, direction: string) => {
    if (direction === 'INBOUND') return null

    switch (status) {
      case 'read':
        return <CheckCheck className="h-3 w-3 text-blue-500" />
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-muted-foreground" />
      case 'sent':
        return <Check className="h-3 w-3 text-muted-foreground" />
      case 'pending':
        return <Clock className="h-3 w-3 text-muted-foreground" />
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-destructive" />
      default:
        return <Check className="h-3 w-3 text-muted-foreground" />
    }
  }

  // ==================== RENDER STATES ====================

  if (!isHydrated || instancesLoading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Carregando conversas...</p>
        </div>
      </div>
    )
  }

  if (instancesError) {
    return (
      <div className="pt-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Erro ao carregar instâncias</span>
            <Button variant="outline" size="sm" onClick={() => refetchInstances()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (instances.length === 0) {
    return (
      <div className="pt-6">
        <Alert>
          <MessageSquare className="h-4 w-4" />
          <AlertDescription>
            Nenhuma instância WhatsApp conectada. Conecte pelo menos uma instância para acessar as conversas.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // ==================== RENDER COMPONENTS ====================

  // Instances List Component
  const InstancesList = ({ className }: { className?: string }) => (
    <div className={cn("space-y-2", className)}>
      <div className="px-2 py-1">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Instâncias ({instances.length})
        </h3>
      </div>
      <div className="space-y-1">
        {instances.map((instance: Instance) => (
          <button
            key={instance.id}
            onClick={() => handleSelectInstance(instance.id)}
            className={cn(
              "w-full p-3 rounded-lg text-left transition-all",
              selectedInstanceId === instance.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "hover:bg-muted"
            )}
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border-2 border-background">
                <AvatarImage src={instance.profilePictureUrl || ''} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {instance.name[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{instance.name}</p>
                <p className="text-xs opacity-70 truncate">
                  {instance.phoneNumber || 'Sem número'}
                </p>
              </div>
              <div className="h-2 w-2 rounded-full bg-green-500" title="Conectado" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  // Chats List Component
  const ChatsList = ({ className }: { className?: string }) => (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header with search and filters */}
      <div className="p-4 space-y-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            className="pl-10"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={chatFilter} onValueChange={(v) => setChatFilter(v as ChatFilter)}>
            <SelectTrigger className="flex-1">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHAT_FILTERS.map(filter => (
                <SelectItem key={filter.value} value={filter.value}>
                  <div className="flex items-center gap-2">
                    <filter.icon className="h-4 w-4" />
                    {filter.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={handleManualRefresh}
                disabled={chatsFetching}
              >
                <RefreshCw className={cn("h-4 w-4", chatsFetching && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Atualizar</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Chat list */}
      <ScrollArea className="flex-1">
        {chatsLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : chatsError ? (
          <div className="p-4 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Erro ao carregar conversas</p>
            <Button variant="link" size="sm" onClick={() => refetchChats()}>
              Tentar novamente
            </Button>
          </div>
        ) : chats.length === 0 ? (
          <div className="p-8 text-center">
            <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          <div className="divide-y">
            {chats.map((chat: UAZChat) => (
              <button
                key={chat.wa_chatid}
                onClick={() => handleSelectChat(chat.wa_chatid)}
                className={cn(
                  "w-full p-4 text-left transition-colors hover:bg-muted/50",
                  selectedChatId === chat.wa_chatid && "bg-muted"
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={chat.wa_profilePicUrl || ''} />
                    <AvatarFallback>
                      {chat.wa_isGroup ? (
                        <Users className="h-5 w-5" />
                      ) : (
                        chat.wa_name?.[0]?.toUpperCase() || '#'
                      )}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">
                          {chat.wa_name || chat.wa_chatid.split('@')[0]}
                        </p>
                        {chat.wa_isPinned && (
                          <Pin className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      {chat.wa_lastMsgTimestamp && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTimestamp(chat.wa_lastMsgTimestamp)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground truncate pr-2">
                        {chat.wa_lastMsgBody || 'Sem mensagens'}
                      </p>
                      {chat.wa_unreadCount > 0 && (
                        <Badge className="h-5 min-w-5 flex items-center justify-center">
                          {chat.wa_unreadCount > 99 ? '99+' : chat.wa_unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )

  // Messages Area Component
  const MessagesArea = () => (
    <div className="flex flex-col h-full">
      {selectedChat ? (
        <>
          {/* Chat Header */}
          <div className="p-4 border-b flex items-center justify-between bg-card">
            <div className="flex items-center gap-3">
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsChatsDrawerOpen(true)}
                  className="mr-1"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}

              <Avatar className="h-10 w-10">
                <AvatarImage src={selectedChat.wa_profilePicUrl || ''} />
                <AvatarFallback>
                  {selectedChat.wa_isGroup ? (
                    <Users className="h-5 w-5" />
                  ) : (
                    selectedChat.wa_name?.[0]?.toUpperCase() || '#'
                  )}
                </AvatarFallback>
              </Avatar>

              <div>
                <p className="font-medium">
                  {selectedChat.wa_name || selectedChat.wa_chatid.split('@')[0]}
                </p>
                {selectedChat.wa_isGroup && (
                  <p className="text-xs text-muted-foreground">Grupo</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {messagesFetching && (
                <Badge variant="outline" className="gap-1 mr-2 text-xs">
                  <Radio className="h-3 w-3 animate-pulse" />
                  Sincronizando
                </Badge>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Phone className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Chamada de voz</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Video className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Chamada de vídeo</TooltipContent>
              </Tooltip>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => archiveChatMutation.mutate(selectedChat.wa_chatid)}>
                    <Archive className="h-4 w-4 mr-2" />
                    Arquivar conversa
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => blockContactMutation.mutate({
                      chatId: selectedChat.wa_chatid,
                      block: true
                    })}
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Bloquear contato
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Apagar conversa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            {messagesLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className={cn("h-16", i % 2 === 0 ? "w-3/4" : "w-3/4 ml-auto")} />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">Nenhuma mensagem ainda</p>
                  <p className="text-sm text-muted-foreground/70">Envie a primeira mensagem!</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {[...messages].reverse().map((message: DBMessage) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.direction === 'OUTBOUND' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2 shadow-sm",
                        message.direction === 'OUTBOUND'
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted rounded-bl-md"
                      )}
                    >
                      {/* Media content */}
                      {message.mediaUrl && (
                        <div className="mb-2">
                          {message.type === 'image' && (
                            <img
                              src={message.mediaUrl}
                              alt="Imagem"
                              className="rounded-lg max-w-full"
                            />
                          )}
                          {message.type === 'document' && (
                            <div className="flex items-center gap-2 p-2 bg-background/20 rounded">
                              <FileText className="h-8 w-8" />
                              <span className="text-sm truncate">{message.fileName || 'Documento'}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Text content */}
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                      </p>

                      {/* Timestamp and status */}
                      <div className={cn(
                        "flex items-center justify-end gap-1 mt-1",
                        message.direction === 'OUTBOUND'
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      )}>
                        <span className="text-[10px]">
                          {formatTimestamp(message.createdAt)}
                        </span>
                        {getStatusIcon(message.status, message.direction)}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="p-4 border-t space-y-3 bg-card">
            {/* File Preview */}
            {selectedFile && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                {filePreview ? (
                  <img src={filePreview} alt="Preview" className="h-16 w-16 object-cover rounded" />
                ) : (
                  <div className="h-16 w-16 flex items-center justify-center bg-background rounded">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={handleCancelFile} disabled={isUploading}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Message input bar */}
            <div className="flex items-center gap-2">
              {/* Emoji picker */}
              <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          setMessageText(prev => prev + emoji)
                          setShowEmojiPicker(false)
                          messageInputRef.current?.focus()
                        }}
                        className="text-xl hover:bg-muted p-1.5 rounded transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Attachment button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || !!selectedFile}
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Anexar arquivo (máx 16MB)</TooltipContent>
              </Tooltip>

              {/* Message input */}
              <Input
                ref={messageInputRef}
                placeholder={selectedFile ? "Legenda (opcional)..." : "Digite uma mensagem..."}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    selectedFile ? handleSendFile() : handleSendMessage()
                  }
                }}
                className="flex-1"
                disabled={isUploading || sendMessageMutation.isPending}
              />

              {/* Send button */}
              <Button
                onClick={selectedFile ? handleSendFile : handleSendMessage}
                disabled={
                  isUploading ||
                  sendMessageMutation.isPending ||
                  (!selectedFile && !messageText.trim())
                }
                size="icon"
              >
                {isUploading || sendMessageMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-muted/30">
          <div className="text-center p-8">
            <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-1">Selecione uma conversa</h3>
            <p className="text-sm text-muted-foreground">
              Escolha uma conversa para começar a enviar mensagens
            </p>
          </div>
        </div>
      )}
    </div>
  )

  // ==================== MAIN RENDER ====================
  return (
    <TooltipProvider>
      <div className="h-[calc(100vh-4rem)] flex pt-6" role="main" aria-label="Conversas WhatsApp">
        {/* Mobile Layout */}
        {isMobile ? (
          <>
            {/* Instance selector drawer */}
            <Sheet open={isInstancesDrawerOpen} onOpenChange={setIsInstancesDrawerOpen}>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle>Instâncias</SheetTitle>
                </SheetHeader>
                <div className="p-4">
                  <InstancesList />
                </div>
              </SheetContent>
            </Sheet>

            {/* Chats drawer */}
            <Sheet open={isChatsDrawerOpen} onOpenChange={setIsChatsDrawerOpen}>
              <SheetContent side="left" className="w-full sm:w-96 p-0">
                <SheetHeader className="p-4 border-b flex-row items-center justify-between">
                  <SheetTitle className="flex items-center gap-2">
                    {selectedInstance && (
                      <>
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={selectedInstance.profilePictureUrl || ''} />
                          <AvatarFallback>{selectedInstance.name[0]}</AvatarFallback>
                        </Avatar>
                        {selectedInstance.name}
                      </>
                    )}
                  </SheetTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsInstancesDrawerOpen(true)}
                  >
                    Trocar
                  </Button>
                </SheetHeader>
                <ChatsList />
              </SheetContent>
            </Sheet>

            {/* Main messages area */}
            <Card className="flex-1 rounded-none border-0">
              <CardContent className="p-0 h-full">
                {selectedChat ? (
                  <MessagesArea />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-8">
                    <Button
                      onClick={() => setIsChatsDrawerOpen(true)}
                      className="gap-2"
                    >
                      <Menu className="h-5 w-5" />
                      Ver conversas
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          /* Desktop Layout - 3 columns */
          <>
            {/* Column 1: Instances */}
            <Card className="w-64 flex-shrink-0 mr-4">
              <CardContent className="p-4 h-full">
                <InstancesList />
              </CardContent>
            </Card>

            {/* Column 2: Chats */}
            <Card className="w-80 flex-shrink-0 mr-4">
              <CardContent className="p-0 h-full">
                <ChatsList />
              </CardContent>
            </Card>

            {/* Column 3: Messages */}
            <Card className="flex-1">
              <CardContent className="p-0 h-full">
                <MessagesArea />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
