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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
  Paperclip,
  Search,
  Phone,
  Video,
  MoreVertical,
  Check,
  CheckCheck,
  X,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Radio,
  Smile,
  FileText,
  Archive,
  Trash2,
  Ban,
  Clock,
  MessageCircle,
  Users,
  Pin,
  AlertCircle,
  Smartphone,
  Layers,
  Bot,
  User,
  ArchiveIcon,
  Inbox,
} from 'lucide-react'
import { api } from '@/igniter.client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useQuery, useMutation } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

// Common emojis for quick access
const QUICK_EMOJIS = ['thumbsup', 'heart', 'joy', 'pray', 'wave', 'tada', 'check', 'star', 'fire']
  .map(() => ['👍', '❤️', '😂', '🙏', '👋', '🎉', '✅', '⭐', '🔥'])
  .flat()
  .slice(0, 10)

// ==================== CONSTANTS ====================
const CHAT_REFRESH_INTERVAL = 10 * 1000 // 10 segundos
const MESSAGE_REFRESH_INTERVAL = 5 * 1000 // 5 segundos

type ChatFilter = 'all' | 'unread' | 'groups' | 'pinned'
type AttendanceFilter = 'all' | 'ai' | 'human' | 'archived'

const CHAT_FILTERS: { value: ChatFilter; label: string; icon: any }[] = [
  { value: 'all', label: 'Todas', icon: MessageCircle },
  { value: 'unread', label: 'Nao lidas', icon: MessageSquare },
  { value: 'groups', label: 'Grupos', icon: Users },
  { value: 'pinned', label: 'Fixadas', icon: Pin },
]

// Filtros de tipo de atendimento
const ATTENDANCE_FILTERS: { value: AttendanceFilter; label: string; icon: any; color: string }[] = [
  { value: 'all', label: 'Todas', icon: Inbox, color: 'text-muted-foreground' },
  { value: 'ai', label: 'IA', icon: Bot, color: 'text-purple-500' },
  { value: 'human', label: 'Humano', icon: User, color: 'text-blue-500' },
  { value: 'archived', label: 'Arquivado', icon: ArchiveIcon, color: 'text-orange-500' },
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
  instanceId?: string
  instanceName?: string
  // Campos de sessão (do DB)
  id?: string // session ID
  status?: 'QUEUED' | 'ACTIVE' | 'PAUSED' | 'CLOSED'
  aiEnabled?: boolean
  aiBlockedUntil?: string | null
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
  // Hydration
  const [isHydrated, setIsHydrated] = useState(false)

  // Selection state - 'all' means all instances
  const [selectedInstanceFilter, setSelectedInstanceFilter] = useState<string>('all')
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [selectedChatInstanceId, setSelectedChatInstanceId] = useState<string | null>(null)

  // Input state
  const [messageText, setMessageText] = useState('')
  const [searchText, setSearchText] = useState('')
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all')
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('all')

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // UI state
  const [isMobile, setIsMobile] = useState(false)
  const [isChatsDrawerOpen, setIsChatsDrawerOpen] = useState(false)
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

  // Determine which instance IDs to fetch chats for
  const instanceIdsToFetch = useMemo(() => {
    if (selectedInstanceFilter === 'all') {
      return instances.map((i: Instance) => i.id)
    }
    return [selectedInstanceFilter]
  }, [selectedInstanceFilter, instances])

  // Fetch chats for selected instance(s)
  const {
    data: chatsData,
    isLoading: chatsLoading,
    error: chatsError,
    isFetching: chatsFetching,
    refetch: refetchChats,
  } = useQuery({
    queryKey: ['conversations', 'chats', instanceIdsToFetch, chatFilter, attendanceFilter],
    queryFn: async () => {
      if (instanceIdsToFetch.length === 0) return { chats: [] }

      // Fetch chats from all selected instances in parallel
      const results = await Promise.all(
        instanceIdsToFetch.map(async (instanceId: string) => {
          try {
            const response = await api.chats.list.query({
              query: {
                instanceId,
                status: chatFilter,
                attendanceType: attendanceFilter,
                limit: 50,
                offset: 0,
              }
            })
            const chats = (response as any)?.data?.chats ?? (response as any)?.chats ?? []
            const instance = instances.find((i: Instance) => i.id === instanceId)
            // Add instance info to each chat
            return chats.map((chat: UAZChat) => ({
              ...chat,
              instanceId,
              instanceName: instance?.name || 'Instancia',
            }))
          } catch (error) {
            console.error(`Error fetching chats for instance ${instanceId}:`, error)
            return []
          }
        })
      )

      // Flatten and sort by timestamp
      const allChats = results.flat().sort((a, b) =>
        (b.wa_lastMsgTimestamp || 0) - (a.wa_lastMsgTimestamp || 0)
      )

      return { chats: allChats }
    },
    enabled: instanceIdsToFetch.length > 0,
    refetchInterval: CHAT_REFRESH_INTERVAL,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  // Extract chats with search filter
  const chats = useMemo(() => {
    const data: UAZChat[] = (chatsData as any)?.chats ?? []

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
  const selectedInstance = selectedChatInstanceId
    ? instances.find((i: Instance) => i.id === selectedChatInstanceId)
    : null
  const selectedChat = chats.find((c: UAZChat) => c.id === selectedChatId || c.wa_chatid === selectedChatId)

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
      if (!selectedChatInstanceId) throw new Error('Nenhuma instancia selecionada')
      const response = await (api.chats as any).archive.mutate({
        params: { chatId },
        body: { instanceId: selectedChatInstanceId }
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
      if (!selectedChatInstanceId) throw new Error('Nenhuma instancia selecionada')
      const response = await (api.chats as any).block.mutate({
        params: { chatId: data.chatId },
        body: { instanceId: selectedChatInstanceId, block: data.block }
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

  const handleSelectChat = useCallback((chat: UAZChat) => {
    // Use session ID for messages API, fallback to wa_chatid if no session ID
    const sessionId = chat.id || chat.wa_chatid
    setSelectedChatId(sessionId)
    setSelectedChatInstanceId(chat.instanceId || null)

    // Mark as read automatically
    if (chat.instanceId && chat.wa_unreadCount > 0) {
      markAsReadMutation.mutate({
        instanceId: chat.instanceId,
        chatId: chat.wa_chatid,
      })
    }

    // Close drawer on mobile
    if (isMobile) {
      setIsChatsDrawerOpen(false)
    }
  }, [isMobile, markAsReadMutation])

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
      toast.error('Arquivo muito grande', { description: 'Tamanho maximo: 16MB' })
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
    if (!selectedFile || !selectedChatInstanceId || !selectedChatId) return

    setIsUploading(true)

    try {
      const reader = new FileReader()

      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1]
        const isImage = selectedFile.type.startsWith('image/')

        const endpoint = isImage ? api.media.sendImage : api.media.sendDocument

        await endpoint.mutate({
          body: {
            instanceId: selectedChatInstanceId,
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
  }, [selectedFile, selectedChatInstanceId, selectedChatId, messageText, refetchMessages])

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
      ? new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000)
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
            <span>Erro ao carregar instancias</span>
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
            Nenhuma instancia WhatsApp conectada. Conecte pelo menos uma instancia para acessar as conversas.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // ==================== RENDER COMPONENTS ====================

  // Instance Filter Dropdown
  const InstanceFilter = () => (
    <Select value={selectedInstanceFilter} onValueChange={setSelectedInstanceFilter}>
      <SelectTrigger className="w-full">
        <div className="flex items-center gap-2">
          {selectedInstanceFilter === 'all' ? (
            <>
              <Layers className="h-4 w-4" />
              <span>Todas as integracoes ({instances.length})</span>
            </>
          ) : (
            <>
              <Smartphone className="h-4 w-4" />
              <span className="truncate">
                {instances.find((i: Instance) => i.id === selectedInstanceFilter)?.name || 'Selecionar'}
              </span>
            </>
          )}
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span>Todas as integracoes ({instances.length})</span>
          </div>
        </SelectItem>
        {instances.map((instance: Instance) => (
          <SelectItem key={instance.id} value={instance.id}>
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage src={instance.profilePictureUrl || ''} />
                <AvatarFallback className="text-[10px]">
                  {instance.name[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{instance.name}</span>
              <span className="text-xs text-muted-foreground">
                {instance.phoneNumber || ''}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  // Chats List Component
  const ChatsList = ({ className }: { className?: string }) => (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header with instance filter and search */}
      <div className="p-4 space-y-3 border-b">
        {/* Instance filter */}
        <InstanceFilter />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            className="pl-10"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        {/* Attendance type filter - Buttons */}
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
          {ATTENDANCE_FILTERS.map(filter => (
            <Tooltip key={filter.value}>
              <TooltipTrigger asChild>
                <Button
                  variant={attendanceFilter === filter.value ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "flex-1 gap-1.5",
                    attendanceFilter === filter.value && filter.color
                  )}
                  onClick={() => setAttendanceFilter(filter.value)}
                >
                  <filter.icon className={cn("h-4 w-4", filter.color)} />
                  <span className="text-xs hidden sm:inline">{filter.label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {filter.value === 'ai' && 'Conversas com IA ativa'}
                {filter.value === 'human' && 'Conversas com atendente humano'}
                {filter.value === 'archived' && 'Conversas arquivadas/encerradas'}
                {filter.value === 'all' && 'Todas as conversas'}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Chat type filter + refresh */}
        <div className="flex items-center gap-2">
          <Select value={chatFilter} onValueChange={(v) => setChatFilter(v as ChatFilter)}>
            <SelectTrigger className="flex-1">
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
            <p className="text-sm text-muted-foreground/70 mt-1">
              As conversas aparecerao aqui quando voce receber mensagens
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {chats.map((chat: UAZChat) => (
              <button
                key={`${chat.instanceId}-${chat.wa_chatid}`}
                onClick={() => handleSelectChat(chat)}
                className={cn(
                  "w-full p-4 text-left transition-colors hover:bg-muted/50",
                  (selectedChatId === chat.id || selectedChatId === chat.wa_chatid) && "bg-muted"
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
                        {/* Indicador de status IA/Humano/Arquivado */}
                        {chat.status === 'CLOSED' || chat.status === 'PAUSED' ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <ArchiveIcon className="h-3 w-3 text-orange-500" />
                            </TooltipTrigger>
                            <TooltipContent>Arquivado</TooltipContent>
                          </Tooltip>
                        ) : chat.aiEnabled && (!chat.aiBlockedUntil || new Date(chat.aiBlockedUntil) < new Date()) ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <Bot className="h-3 w-3 text-purple-500" />
                            </TooltipTrigger>
                            <TooltipContent>IA ativa</TooltipContent>
                          </Tooltip>
                        ) : chat.aiEnabled === false || (chat.aiBlockedUntil && new Date(chat.aiBlockedUntil) >= new Date()) ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <User className="h-3 w-3 text-blue-500" />
                            </TooltipTrigger>
                            <TooltipContent>Atendimento humano</TooltipContent>
                          </Tooltip>
                        ) : null}
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

                    {/* Show instance name when viewing all */}
                    {selectedInstanceFilter === 'all' && chat.instanceName && (
                      <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                        <Smartphone className="h-3 w-3" />
                        {chat.instanceName}
                      </p>
                    )}
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
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {selectedChat.wa_isGroup && <span>Grupo</span>}
                  {selectedInstance && (
                    <>
                      <Smartphone className="h-3 w-3 ml-1" />
                      {selectedInstance.name}
                    </>
                  )}
                </p>
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
                <TooltipContent>Chamada de video</TooltipContent>
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
                    {QUICK_EMOJIS.map((emoji, idx) => (
                      <button
                        key={idx}
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
                <TooltipContent>Anexar arquivo (max 16MB)</TooltipContent>
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
              Escolha uma conversa para comecar a enviar mensagens
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
            {/* Chats drawer */}
            <Sheet open={isChatsDrawerOpen} onOpenChange={setIsChatsDrawerOpen}>
              <SheetContent side="left" className="w-full sm:w-96 p-0">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle>Conversas</SheetTitle>
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
                      <MessageCircle className="h-5 w-5" />
                      Ver conversas
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          /* Desktop Layout - 2 columns (chats + messages) */
          <>
            {/* Column 1: Chats with integrated instance filter */}
            <Card className="w-96 flex-shrink-0 mr-4">
              <CardContent className="p-0 h-full">
                <ChatsList />
              </CardContent>
            </Card>

            {/* Column 2: Messages */}
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
