'use client'

/**
 * Conversations Page - WhatsApp Chat Management
 *
 * STATUS FLOW (AI / Human / Closed):
 * ====================================
 *
 * 1. AI ATIVA (Bot respondendo):
 *    - Condição: connectionHasWebhook=true AND aiEnabled=true AND (aiBlockedUntil=null OR expired)
 *    - Ícone: Bot roxo (purple-500)
 *    - Mensagens de entrada são processadas pelo webhook/n8n automaticamente
 *
 * 2. HUMANO (Atendente respondendo):
 *    - Condição: aiEnabled=false OR aiBlockedUntil ainda não expirou OR !connectionHasWebhook
 *    - Ícone: User azul (blue-500)
 *    - Triggers:
 *      a) Humano digita mensagem na interface Quayer (OUTBOUND com author='AGENT')
 *      b) Próprio número da integração digita no WhatsApp (OUTBOUND com author='HUMAN')
 *    - Ao detectar intervenção humana:
 *      - autoPauseOnHumanReply() é chamado
 *      - aiEnabled=false, aiBlockedUntil=now+24h (ou sessionTimeoutHours da org)
 *      - aiBlockReason='AUTO_PAUSED_HUMAN'
 *
 * 3. RESOLVIDOS (Conversa finalizada):
 *    - Condição: status='CLOSED' ou status='PAUSED'
 *    - Ícone: CheckCircle2 verde (green-500)
 *    - Triggers:
 *      a) User clica "Resolver" na interface
 *      b) Timeout automático (closeExpiredSessions worker)
 *      c) Arquivar chat manualmente
 *
 * IMPORTANTE: IA só está disponível quando n8nWebhookUrl está configurado na Connection.
 * Sem webhook, todas as sessões são "Humano" por padrão.
 */

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
  CheckCircle2,
  RotateCcw,
  Wifi,
  WifiOff,
  StickyNote,
  PinOff,
  Plus,
  Play,
  Zap,
  Command,
} from 'lucide-react'
import { api } from '@/igniter.client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { AudioRecorder } from '@/components/chat/AudioRecorder'
import { useInstanceSSE } from '@/hooks/useInstanceSSE'

// Common emojis for quick access
const QUICK_EMOJIS = ['thumbsup', 'heart', 'joy', 'pray', 'wave', 'tada', 'check', 'star', 'fire']
  .map(() => ['👍', '❤️', '😂', '🙏', '👋', '🎉', '✅', '⭐', '🔥'])
  .flat()
  .slice(0, 10)

// ==================== CONSTANTS ====================
// Fallback polling intervals (only used when SSE is not connected)
const CHAT_REFRESH_INTERVAL = 30 * 1000 // 30 segundos (fallback)
const MESSAGE_REFRESH_INTERVAL = 15 * 1000 // 15 segundos (fallback)

// Nova arquitetura: 3 tabs principais por responsabilidade
type MainTab = 'ia' | 'atendente' | 'resolvidos'
type ChatTypeFilter = 'all' | 'direct' | 'groups'

// Tabs principais: IA | Atendente | Resolvidos
const MAIN_TABS: { value: MainTab; label: string; icon: any; color: string; description: string }[] = [
  { value: 'ia', label: 'IA', icon: Bot, color: 'text-purple-500', description: 'IA está respondendo automaticamente' },
  { value: 'atendente', label: 'Atendente', icon: User, color: 'text-blue-500', description: 'Aguardando resposta humana' },
  { value: 'resolvidos', label: 'Resolvidos', icon: CheckCircle2, color: 'text-green-500', description: 'Conversas finalizadas' },
]

// Filtro opcional de tipo de chat
const CHAT_TYPE_FILTERS: { value: ChatTypeFilter; label: string; icon: any }[] = [
  { value: 'all', label: 'Todos', icon: MessageCircle },
  { value: 'direct', label: 'Diretos', icon: Smartphone },
  { value: 'groups', label: 'Grupos', icon: Users },
]

// ==================== TYPES ====================
interface UAZChat {
  wa_chatid: string
  wa_name: string | null
  wa_phoneNumber?: string // Número limpo para exibição
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
  // Indica se a conexão tem IA disponível (webhook configurado)
  connectionHasWebhook?: boolean
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

// Optimistic message for immediate UI feedback
interface OptimisticMessage {
  id: string
  content: string
  status: 'pending' | 'sent' | 'failed'
  createdAt: string
  direction: 'OUTBOUND'
  type: 'text'
  author: 'AGENT'
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
  // Nova arquitetura: tab principal (IA/Atendente/Resolvidos) + filtro opcional de tipo
  const [mainTab, setMainTab] = useState<MainTab>('atendente') // Foco no que precisa de ação
  const [chatTypeFilter, setChatTypeFilter] = useState<ChatTypeFilter>('all')

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // UI state
  const [isMobile, setIsMobile] = useState(false)
  const [isChatsDrawerOpen, setIsChatsDrawerOpen] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showNotesPanel, setShowNotesPanel] = useState(false)
  const [newNoteText, setNewNoteText] = useState('')
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [quickReplySearch, setQuickReplySearch] = useState('')
  const [showMessageSearch, setShowMessageSearch] = useState(false)
  const [messageSearchText, setMessageSearchText] = useState('')
  const [messageSearchResults, setMessageSearchResults] = useState<number[]>([]) // indices of matching messages
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0)

  // Optimistic messages for immediate UI feedback
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([])

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageInputRef = useRef<HTMLInputElement>(null)
  const isInputFocusedRef = useRef(false)
  const previousScrollHeightRef = useRef<number>(0)
  const isNearBottomRef = useRef(true)
  const previousMessageCountRef = useRef<number>(0)

  // ==================== EFFECTS ====================
  useEffect(() => {
    setIsHydrated(true)

    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Restore focus after data refetch if user was typing
  useEffect(() => {
    if (isInputFocusedRef.current && messageInputRef.current) {
      // Small delay to ensure DOM is updated
      requestAnimationFrame(() => {
        messageInputRef.current?.focus()
      })
    }
  })

  // ==================== QUERIES ====================

  // Fetch instances
  const {
    data: instancesData,
    isLoading: instancesLoading,
    error: instancesError,
    refetch: refetchInstances,
  } = useQuery({
    queryKey: ['conversations', 'instances'],
    queryFn: async () => {
      const response = await api.instances.list.query({ query: {} })
      return response
    },
    refetchInterval: 60000, // Instances don't need frequent updates
    refetchOnWindowFocus: false, // Disable to prevent constant updates
    staleTime: 60000, // Cache for 60 seconds
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

  // SSE for real-time updates (use first instance for now, later can support multiple)
  const sseInstanceId = instanceIdsToFetch.length === 1 ? instanceIdsToFetch[0] : instances[0]?.id
  const {
    connected: sseConnected,
    reconnect: sseReconnect,
  } = useInstanceSSE({
    instanceId: sseInstanceId,
    enabled: !!sseInstanceId && isHydrated,
    autoInvalidate: true, // Auto-invalidate React Query on SSE events
    onEvent: (event) => {
      // Handle specific events for optimistic message updates
      if (event.type === 'message.sent' && event.data?.waMessageId) {
        // Mark optimistic message as sent when confirmed
        setOptimisticMessages(prev =>
          prev.filter(m => m.id !== event.data.tempId)
        )
      }
    },
    onConnect: () => {
      console.log('[SSE] Connected to real-time updates')
    },
    onDisconnect: () => {
      console.log('[SSE] Disconnected from real-time updates')
    },
  })

  // Fetch chats for selected instance(s)
  // Nova arquitetura: busca todos e filtra no cliente para ter contagens corretas
  const {
    data: chatsData,
    isLoading: chatsLoading,
    error: chatsError,
    isFetching: chatsFetching,
    refetch: refetchChats,
  } = useQuery({
    queryKey: ['conversations', 'chats', instanceIdsToFetch],
    queryFn: async () => {
      if (instanceIdsToFetch.length === 0) return { chats: [] }

      // Fetch chats from all selected instances in parallel
      const results = await Promise.all(
        instanceIdsToFetch.map(async (instanceId: string) => {
          try {
            const response = await api.chats.list.query({
              query: {
                instanceId,
                limit: 100, // Busca mais para ter todos os dados
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

      // Flatten and sort by timestamp (temporal - mais recente primeiro)
      const allChats = results.flat().sort((a, b) =>
        (b.wa_lastMsgTimestamp || 0) - (a.wa_lastMsgTimestamp || 0)
      )

      return { chats: allChats }
    },
    enabled: instanceIdsToFetch.length > 0,
    // Reduce polling when SSE is connected (SSE handles real-time updates)
    refetchInterval: sseConnected ? false : CHAT_REFRESH_INTERVAL,
    refetchOnWindowFocus: false, // Disable to prevent constant updates
    staleTime: 15000, // Cache for 15 seconds
  })

  // Helper functions para categorizar chats
  const isAIActive = useCallback((chat: UAZChat) => {
    const now = new Date()
    if (!chat.connectionHasWebhook) return false
    const aiEnabled = chat.aiEnabled === true
    const aiNotBlocked = !chat.aiBlockedUntil || new Date(chat.aiBlockedUntil) < now
    const notArchived = chat.status !== 'CLOSED' && chat.status !== 'PAUSED'
    return aiEnabled && aiNotBlocked && notArchived
  }, [])

  const isHumanAttending = useCallback((chat: UAZChat) => {
    const now = new Date()
    const isArchived = chat.status === 'CLOSED' || chat.status === 'PAUSED'
    if (isArchived) return false
    // Se conexão não tem webhook, todas são humanas
    if (!chat.connectionHasWebhook) return true
    // Se tem webhook, verificar se IA está bloqueada ou desabilitada
    const isAIBlocked = chat.aiBlockedUntil && new Date(chat.aiBlockedUntil) >= now
    const isAIDisabled = chat.aiEnabled === false
    return isAIBlocked || isAIDisabled
  }, [])

  const isResolved = useCallback((chat: UAZChat) => {
    return chat.status === 'CLOSED' || chat.status === 'PAUSED'
  }, [])

  // Calculate tab counts
  const tabCounts = useMemo(() => {
    const data: UAZChat[] = (chatsData as any)?.chats ?? []

    return {
      ia: data.filter(isAIActive).length,
      atendente: data.filter(isHumanAttending).length,
      resolvidos: data.filter(isResolved).length,
      // Contagens extras para o filtro de tipo
      groups: data.filter(chat => chat.wa_isGroup && !isResolved(chat)).length,
      direct: data.filter(chat => !chat.wa_isGroup && !isResolved(chat)).length,
    }
  }, [chatsData, isAIActive, isHumanAttending, isResolved])

  // Extract and filter chats based on mainTab, chatTypeFilter and search
  const chats = useMemo(() => {
    const data: UAZChat[] = (chatsData as any)?.chats ?? []

    // 1. Filtrar por tab principal (IA / Atendente / Resolvidos)
    let filtered = data.filter(chat => {
      switch (mainTab) {
        case 'ia':
          return isAIActive(chat)
        case 'atendente':
          return isHumanAttending(chat)
        case 'resolvidos':
          return isResolved(chat)
        default:
          return true
      }
    })

    // 2. Filtrar por tipo de chat (Todos / Diretos / Grupos)
    if (chatTypeFilter === 'direct') {
      filtered = filtered.filter(chat => !chat.wa_isGroup)
    } else if (chatTypeFilter === 'groups') {
      filtered = filtered.filter(chat => chat.wa_isGroup)
    }

    // 3. Filtrar por busca
    if (searchText.trim()) {
      const search = searchText.toLowerCase()
      filtered = filtered.filter(chat =>
        chat.wa_name?.toLowerCase().includes(search) ||
        chat.wa_chatid.toLowerCase().includes(search) ||
        chat.wa_lastMsgBody?.toLowerCase().includes(search)
      )
    }

    return filtered
  }, [chatsData, mainTab, chatTypeFilter, searchText, isAIActive, isHumanAttending, isResolved])

  // Format count for display (99+ for large numbers)
  const formatCount = (count: number) => count > 99 ? '99+' : count.toString()

  // Fetch messages for selected chat with infinite scroll
  const MESSAGES_PER_PAGE = 50
  const {
    data: messagesData,
    isLoading: messagesLoading,
    isFetching: messagesFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchMessages,
  } = useInfiniteQuery({
    queryKey: ['conversations', 'messages', selectedChatId],
    queryFn: async ({ pageParam = 1 }) => {
      if (!selectedChatId) return null
      const response = await api.messages.list.query({
        query: {
          sessionId: selectedChatId,
          limit: MESSAGES_PER_PAGE,
          page: pageParam,
        }
      })
      return response
    },
    getNextPageParam: (lastPage: any) => {
      const pagination = lastPage?.data?.pagination
      if (pagination?.has_next_page) {
        return pagination.page + 1
      }
      return undefined
    },
    initialPageParam: 1,
    enabled: !!selectedChatId,
    // Reduce polling when SSE is connected (SSE handles real-time updates)
    refetchInterval: sseConnected ? false : MESSAGE_REFRESH_INTERVAL,
    refetchOnWindowFocus: false, // Disable to prevent scroll jumps
    staleTime: 10000, // Cache for 10 seconds
  })

  // Extract messages from all pages and merge with optimistic messages
  const messages = useMemo(() => {
    const pages = messagesData?.pages ?? []
    const allServerMessages: DBMessage[] = []

    // Flatten all pages into single array
    for (const page of pages) {
      const pageData = (page as any)?.data?.data ?? (page as any)?.data ?? []
      allServerMessages.push(...pageData)
    }

    // Sort all messages by createdAt ascending (oldest first)
    // Backend returns desc order, but with pagination we need to re-sort
    allServerMessages.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      return dateA - dateB // Ascending order (oldest to newest)
    })

    // Filter optimistic messages for current session
    const sessionOptimistic = optimisticMessages.filter(
      m => m.id.startsWith(`optimistic-${selectedChatId}`)
    )

    // Merge: add optimistic messages that aren't yet in server response
    const serverIds = new Set(allServerMessages.map((m: DBMessage) => m.waMessageId || m.id))
    const newOptimistic = sessionOptimistic.filter(m => !serverIds.has(m.id))

    // Return sorted messages with optimistic ones at the end (they are the newest)
    return [...allServerMessages, ...newOptimistic]
  }, [messagesData, optimisticMessages, selectedChatId])

  // Handle scroll to load more messages (scroll to top = older messages)
  const handleMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement

    // Track if user is near bottom (within 150px) for smart auto-scroll
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight
    isNearBottomRef.current = distanceFromBottom < 150

    // Load more when scrolled near top (within 100px)
    if (target.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      // Save current scroll position to restore after loading
      previousScrollHeightRef.current = target.scrollHeight
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Restore scroll position after loading more messages
  useEffect(() => {
    if (!isFetchingNextPage && previousScrollHeightRef.current > 0 && messagesContainerRef.current) {
      const container = messagesContainerRef.current
      const newScrollHeight = container.scrollHeight
      const scrollDiff = newScrollHeight - previousScrollHeightRef.current
      container.scrollTop = scrollDiff
      previousScrollHeightRef.current = 0
    }
  }, [isFetchingNextPage])

  // Selected items
  const selectedInstance = selectedChatInstanceId
    ? instances.find((i: Instance) => i.id === selectedChatInstanceId)
    : null
  const selectedChat = chats.find((c: UAZChat) => c.id === selectedChatId || c.wa_chatid === selectedChatId)

  // ==================== SESSION NOTES ====================

  // Fetch notes for selected session
  const {
    data: notesData,
    isLoading: notesLoading,
    refetch: refetchNotes,
  } = useQuery({
    queryKey: ['session-notes', selectedChatId],
    queryFn: async () => {
      if (!selectedChatId) return []
      const response = await api.notes.list.query({
        query: { sessionId: selectedChatId }
      })
      return (response as any)?.data ?? []
    },
    enabled: !!selectedChatId && showNotesPanel,
  })

  const notes = notesData ?? []

  // ==================== QUICK REPLIES ====================

  // Fetch quick replies
  const {
    data: quickRepliesData,
    isLoading: quickRepliesLoading,
  } = useQuery({
    queryKey: ['quick-replies', quickReplySearch],
    queryFn: async () => {
      const response = await (api['quick-replies'] as any).list.query({
        query: { search: quickReplySearch || undefined, limit: 20 }
      })
      return (response as any)?.data ?? { quickReplies: [], categories: [] }
    },
    enabled: showQuickReplies,
    staleTime: 60000, // Cache for 1 minute
  })

  const quickReplies = quickRepliesData?.quickReplies ?? []

  // Handle quick reply selection
  const handleSelectQuickReply = useCallback((qr: any) => {
    setMessageText(qr.content)
    setShowQuickReplies(false)
    setQuickReplySearch('')
    messageInputRef.current?.focus()

    // Increment usage count
    ;(api['quick-replies'] as any).use.mutate({ params: { id: qr.id } }).catch(() => {})
  }, [])

  // Detect shortcut typing (e.g., /ola)
  const handleMessageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setMessageText(value)

    // Detect shortcut pattern
    if (value.startsWith('/') && value.length > 1 && !value.includes(' ')) {
      setQuickReplySearch(value)
      setShowQuickReplies(true)
    } else if (showQuickReplies && !value.startsWith('/')) {
      setShowQuickReplies(false)
      setQuickReplySearch('')
    }
  }, [showQuickReplies])

  // ==================== MESSAGE SEARCH ====================

  // Search messages within current conversation
  const handleMessageSearch = useCallback((searchTerm: string) => {
    setMessageSearchText(searchTerm)

    if (!searchTerm.trim()) {
      setMessageSearchResults([])
      setCurrentSearchIndex(0)
      return
    }

    const term = searchTerm.toLowerCase()
    const results: number[] = []

    messages.forEach((msg: any, index: number) => {
      if (msg.content?.toLowerCase().includes(term)) {
        results.push(index)
      }
    })

    setMessageSearchResults(results)
    setCurrentSearchIndex(results.length > 0 ? 0 : -1)

    // Scroll to first result
    if (results.length > 0) {
      scrollToMessage(results[0])
    }
  }, [messages])

  // Navigate to next search result
  const goToNextResult = useCallback(() => {
    if (messageSearchResults.length === 0) return
    const next = (currentSearchIndex + 1) % messageSearchResults.length
    setCurrentSearchIndex(next)
    scrollToMessage(messageSearchResults[next])
  }, [messageSearchResults, currentSearchIndex])

  // Navigate to previous search result
  const goToPrevResult = useCallback(() => {
    if (messageSearchResults.length === 0) return
    const prev = currentSearchIndex === 0 ? messageSearchResults.length - 1 : currentSearchIndex - 1
    setCurrentSearchIndex(prev)
    scrollToMessage(messageSearchResults[prev])
  }, [messageSearchResults, currentSearchIndex])

  // Scroll to specific message
  const scrollToMessage = useCallback((index: number) => {
    const messageElements = messagesContainerRef.current?.querySelectorAll('[data-message-index]')
    if (messageElements && messageElements[index]) {
      messageElements[index].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  // Close search
  const closeMessageSearch = useCallback(() => {
    setShowMessageSearch(false)
    setMessageSearchText('')
    setMessageSearchResults([])
    setCurrentSearchIndex(0)
  }, [])

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedChatId) throw new Error('Sessão não selecionada')
      return api.notes.create.mutate({
        body: { sessionId: selectedChatId, content }
      })
    },
    onSuccess: () => {
      setNewNoteText('')
      refetchNotes()
      toast.success('Nota adicionada!')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar nota')
    },
  })

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return (api.notes.delete as any).mutate({ params: { id: noteId } })
    },
    onSuccess: () => {
      refetchNotes()
      toast.success('Nota removida')
    },
  })

  // Toggle pin mutation
  const togglePinMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return (api.notes.togglePin as any).mutate({ params: { id: noteId } })
    },
    onSuccess: () => {
      refetchNotes()
    },
  })

  // ==================== MUTATIONS ====================

  // Send text message with optimistic updates
  const sendMessageMutation = useMutation({
    mutationFn: async (data: { sessionId: string; content: string; tempId: string }) => {
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
      return { ...response, tempId: data.tempId }
    },
    onMutate: async (data) => {
      // Add optimistic message immediately
      const optimisticMsg: OptimisticMessage = {
        id: data.tempId,
        content: data.content,
        status: 'pending',
        createdAt: new Date().toISOString(),
        direction: 'OUTBOUND',
        type: 'text',
        author: 'AGENT',
      }
      setOptimisticMessages(prev => [...prev, optimisticMsg])
    },
    onSuccess: (_, variables) => {
      // Remove optimistic message on success (server message will appear via SSE/refetch)
      setOptimisticMessages(prev => prev.filter(m => m.id !== variables.tempId))
      refetchMessages()
    },
    onError: (error: any, variables) => {
      // Mark optimistic message as failed
      setOptimisticMessages(prev =>
        prev.map(m => m.id === variables.tempId ? { ...m, status: 'failed' as const } : m)
      )
      toast.error(error.message || 'Erro ao enviar mensagem')
    }
  })

  // Retry failed message
  const retryMessageMutation = useMutation({
    mutationFn: async (data: { tempId: string; sessionId: string; content: string }) => {
      // Mark as pending again
      setOptimisticMessages(prev =>
        prev.map(m => m.id === data.tempId ? { ...m, status: 'pending' as const } : m)
      )

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
      return { ...response, tempId: data.tempId }
    },
    onSuccess: (_, variables) => {
      // Remove optimistic message on success
      setOptimisticMessages(prev => prev.filter(m => m.id !== variables.tempId))
      refetchMessages()
      toast.success('Mensagem reenviada!')
    },
    onError: (error: any, variables) => {
      // Keep as failed
      setOptimisticMessages(prev =>
        prev.map(m => m.id === variables.tempId ? { ...m, status: 'failed' as const } : m)
      )
      toast.error(error.message || 'Erro ao reenviar mensagem')
    }
  })

  // Delete failed optimistic message
  const deleteOptimisticMessage = useCallback((tempId: string) => {
    setOptimisticMessages(prev => prev.filter(m => m.id !== tempId))
  }, [])

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

  // Resolve/Close session
  const resolveSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await (api.sessions as any).updateStatus.mutate({
        params: { id: sessionId },
        body: { status: 'CLOSED' }
      })
      return response
    },
    onSuccess: () => {
      toast.success('Conversa encerrada com sucesso!')
      refetchChats()
      setSelectedChatId(null)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao encerrar conversa')
    }
  })

  // Reopen session (CLOSED -> ACTIVE)
  const reopenSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await (api.sessions as any).updateStatus.mutate({
        params: { id: sessionId },
        body: { status: 'ACTIVE' }
      })
      return response
    },
    onSuccess: () => {
      toast.success('Conversa reaberta!')
      refetchChats()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao reabrir conversa')
    }
  })

  // Delete session/conversation
  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await (api.sessions as any).delete.mutate({
        params: { id: sessionId }
      })
      return response
    },
    onSuccess: () => {
      toast.success('Conversa apagada!')
      refetchChats()
      setSelectedChatId(null)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao apagar conversa')
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

    const textToSend = messageText.trim()
    const tempId = `optimistic-${selectedChatId}-${Date.now()}`

    // Clear input optimistically for better UX
    setMessageText('')

    sendMessageMutation.mutate({
      sessionId: selectedChatId,
      content: textToSend,
      tempId,
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

  // Handle audio message
  const handleSendAudio = useCallback(async (audioBase64: string, mimeType: string, duration: number) => {
    if (!selectedChatInstanceId || !selectedChatId) return

    try {
      await api.media.sendAudio.mutate({
        body: {
          instanceId: selectedChatInstanceId,
          chatId: selectedChatId,
          mediaBase64: audioBase64,
          mimeType: mimeType,
          duration: duration,
        }
      })

      refetchMessages()
      toast.success('Audio enviado!')
    } catch (error: any) {
      console.error('[ConversationsPage] Error sending audio:', error)
      toast.error('Erro ao enviar audio', { description: error.message })
      throw error // Re-throw so AudioRecorder knows it failed
    }
  }, [selectedChatInstanceId, selectedChatId, refetchMessages])

  const handleManualRefresh = useCallback(async () => {
    await Promise.all([
      refetchInstances(),
      refetchChats(),
      refetchMessages(),
    ])
    toast.success('Dados atualizados')
  }, [refetchInstances, refetchChats, refetchMessages])

  // Reset scroll state when switching chats - always scroll to bottom on new chat
  useEffect(() => {
    if (selectedChatId) {
      // Reset state for new chat
      isNearBottomRef.current = true
      previousMessageCountRef.current = 0
    }
  }, [selectedChatId])

  // Smart auto-scroll: only scroll to bottom when user was near bottom or sent a new message
  useEffect(() => {
    const currentCount = messages.length
    const previousCount = previousMessageCountRef.current
    const hasNewMessages = currentCount > previousCount

    // Update previous count
    previousMessageCountRef.current = currentCount

    // Only auto-scroll if:
    // 1. User was near bottom (not scrolling through history)
    // 2. OR there are new messages and optimistic messages exist (user sent a message)
    // 3. OR this is the initial load (previousCount was 0)
    const isInitialLoad = previousCount === 0 && currentCount > 0
    const shouldScroll =
      (hasNewMessages && (isNearBottomRef.current || optimisticMessages.length > 0)) ||
      isInitialLoad

    if (shouldScroll && messages.length > 0) {
      // Use instant scroll for initial load, smooth for subsequent updates
      messagesEndRef.current?.scrollIntoView({
        behavior: isInitialLoad ? 'instant' : 'smooth'
      })
    }
  }, [messages, optimisticMessages.length])

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
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {/* Header with total count and instance filter */}
      <div className="p-4 space-y-3 border-b flex-shrink-0">
        {/* Total conversations header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Conversas</h2>
          <Badge variant="secondary" className="text-xs">
            {chats.length} {chats.length === 1 ? 'conversa' : 'conversas'}
          </Badge>
        </div>

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

        {/* Main tabs: IA | Atendente | Resolvidos - WCAG 2.1 compliant */}
        <div
          className="grid grid-cols-3 gap-1 p-1 bg-muted/50 rounded-lg"
          role="tablist"
          aria-label="Filtrar conversas por status"
        >
          {MAIN_TABS.map(tab => {
            const count = tabCounts[tab.value] ?? 0
            const isActive = mainTab === tab.value
            return (
              <Tooltip key={tab.value}>
                <TooltipTrigger asChild>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`${tab.label}: ${count} conversas. ${tab.description}`}
                    className={cn(
                      // WCAG 2.1: min 44px height for touch targets
                      "flex items-center justify-center gap-1.5 px-2 py-2 min-h-[44px] transition-all",
                      // Focus ring for keyboard navigation
                      "focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-neutral-400",
                      // Active state styling
                      isActive && [
                        "shadow-sm",
                        tab.value === 'ia' && "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
                        tab.value === 'atendente' && "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
                        tab.value === 'resolvidos' && "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
                      ]
                    )}
                    onClick={() => setMainTab(tab.value)}
                  >
                    <tab.icon className={cn(
                      "h-4 w-4 flex-shrink-0",
                      isActive ? "" : tab.color
                    )} />
                    <span className="text-xs sm:text-sm font-medium truncate">{tab.label}</span>
                    <Badge
                      variant={isActive ? "default" : "secondary"}
                      className={cn(
                        "h-5 min-w-5 px-1 text-[10px] font-semibold",
                        isActive
                          ? tab.value === 'ia' ? "bg-purple-600 text-white" :
                            tab.value === 'atendente' ? "bg-blue-600 text-white" :
                            "bg-green-600 text-white"
                          : "bg-muted-foreground/20 text-muted-foreground"
                      )}
                    >
                      {formatCount(count)}
                    </Badge>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{tab.description}</TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        {/* Chat type filter (Todos/Diretos/Grupos) + refresh */}
        <div className="flex items-center gap-2">
          <Select value={chatTypeFilter} onValueChange={(v) => setChatTypeFilter(v as ChatTypeFilter)}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHAT_TYPE_FILTERS.map(filter => (
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
      <ScrollArea className="flex-1 min-h-0">
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
            {chats.map((chat: UAZChat) => {
              // Determinar nome para exibição
              const displayName = chat.wa_name || 'Contato'
              // Usar helper functions para categorização
              const chatIsAIActive = isAIActive(chat)
              const chatIsResolved = isResolved(chat)

              return (
                <button
                  key={`${chat.instanceId}-${chat.wa_chatid}`}
                  onClick={() => handleSelectChat(chat)}
                  className={cn(
                    "w-full p-3 text-left transition-colors hover:bg-muted/50",
                    (selectedChatId === chat.id || selectedChatId === chat.wa_chatid) && "bg-muted"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-11 w-11 flex-shrink-0">
                      <AvatarImage src={chat.wa_profilePicUrl || ''} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {chat.wa_isGroup ? (
                          <Users className="h-5 w-5" />
                        ) : (
                          displayName[0]?.toUpperCase() || '?'
                        )}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <p className="font-medium truncate text-sm">
                            {displayName}
                          </p>
                          {chat.wa_isPinned && (
                            <Pin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          )}
                          {/* Indicador de status IA/Humano/Resolvido */}
                          {chatIsResolved ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>Resolvido</TooltipContent>
                            </Tooltip>
                          ) : chatIsAIActive ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Bot className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>IA ativa</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <User className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>Atendente</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        {chat.wa_lastMsgTimestamp && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                            {formatTimestamp(chat.wa_lastMsgTimestamp)}
                          </span>
                        )}
                      </div>

                      {/* Número de telefone ou indicador de grupo */}
                      {!chat.wa_isGroup && chat.wa_phoneNumber && (
                        <p className="text-xs text-muted-foreground/70 mb-0.5 truncate">
                          {chat.wa_phoneNumber}
                        </p>
                      )}
                      {chat.wa_isGroup && (
                        <p className="text-xs text-muted-foreground/70 mb-0.5 flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Grupo
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground truncate flex-1">
                          {chat.wa_lastMsgBody || 'Sem mensagens'}
                        </p>
                        {chat.wa_unreadCount > 0 && (
                          <Badge className="h-5 min-w-5 flex items-center justify-center text-xs flex-shrink-0">
                            {chat.wa_unreadCount > 99 ? '99+' : chat.wa_unreadCount}
                          </Badge>
                        )}
                      </div>

                      {/* Show instance name when viewing all */}
                      {selectedInstanceFilter === 'all' && chat.instanceName && (
                        <p className="text-xs text-muted-foreground/60 mt-1 flex items-center gap-1 truncate">
                          <Smartphone className="h-3 w-3 flex-shrink-0" />
                          {chat.instanceName}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )

  // Messages Area Component
  const MessagesArea = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {selectedChat ? (
        <>
          {/* Chat Header */}
          <div className="p-4 border-b flex items-center justify-between bg-card flex-shrink-0">
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
                <AvatarFallback className="bg-primary/10 text-primary">
                  {selectedChat.wa_isGroup ? (
                    <Users className="h-5 w-5" />
                  ) : (
                    (selectedChat.wa_name || 'C')[0]?.toUpperCase()
                  )}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {selectedChat.wa_name || 'Contato'}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                  {selectedChat.wa_isGroup ? (
                    <>
                      <Users className="h-3 w-3 flex-shrink-0" />
                      <span>Grupo</span>
                    </>
                  ) : selectedChat.wa_phoneNumber ? (
                    <span>{selectedChat.wa_phoneNumber}</span>
                  ) : null}
                  {selectedInstance && (
                    <>
                      <span className="mx-1">•</span>
                      <Smartphone className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{selectedInstance.name}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* SSE connection status */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1 mr-2 text-xs cursor-pointer",
                      sseConnected ? "text-green-600 border-green-200" : "text-muted-foreground"
                    )}
                    onClick={() => !sseConnected && sseReconnect()}
                  >
                    {sseConnected ? (
                      <>
                        <Wifi className="h-3 w-3" />
                        Ao vivo
                      </>
                    ) : messagesFetching ? (
                      <>
                        <Radio className="h-3 w-3 animate-pulse" />
                        Sincronizando
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-3 w-3" />
                        Offline
                      </>
                    )}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {sseConnected
                    ? 'Recebendo atualizacoes em tempo real'
                    : 'Clique para reconectar'}
                </TooltipContent>
              </Tooltip>

              {/* Search button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showMessageSearch ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowMessageSearch(!showMessageSearch)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Buscar na conversa</TooltipContent>
              </Tooltip>

              {/* Notes button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showNotesPanel ? "secondary" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setShowNotesPanel(!showNotesPanel)}
                  >
                    <StickyNote className="h-4 w-4" />
                    <span className="hidden sm:inline">Notas</span>
                    {notes.length > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                        {notes.length}
                      </Badge>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Notas internas do atendente</TooltipContent>
              </Tooltip>

              {/* Resolve/Close session button OR Reopen button */}
              {selectedChat.status === 'CLOSED' || selectedChat.status === 'PAUSED' ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                      onClick={() => {
                        if (!selectedChat.id) {
                          toast.error('Esta conversa não possui sessão ativa no sistema')
                          return
                        }
                        reopenSessionMutation.mutate(selectedChat.id)
                      }}
                      disabled={reopenSessionMutation.isPending || !selectedChat.id}
                    >
                      {reopenSessionMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">Reabrir</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Reabrir conversa e mover para Atendente
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700"
                      onClick={() => {
                        if (!selectedChat.id) {
                          toast.error('Esta conversa não possui sessão ativa no sistema')
                          return
                        }
                        resolveSessionMutation.mutate(selectedChat.id)
                      }}
                      disabled={resolveSessionMutation.isPending || !selectedChat.id}
                    >
                      {resolveSessionMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">Resolver</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Encerrar conversa e mover para Resolvidos
                  </TooltipContent>
                </Tooltip>
              )}

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
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      if (!selectedChat.id) {
                        toast.error('Esta conversa não possui sessão ativa no sistema')
                        return
                      }
                      // Confirmar antes de apagar
                      if (window.confirm('Tem certeza que deseja apagar esta conversa? Esta ação não pode ser desfeita.')) {
                        deleteSessionMutation.mutate(selectedChat.id)
                      }
                    }}
                    disabled={deleteSessionMutation.isPending}
                  >
                    {deleteSessionMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Apagar conversa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Search panel */}
          {showMessageSearch && (
            <div className="p-3 border-b bg-muted/30 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar mensagens..."
                  value={messageSearchText}
                  onChange={(e) => handleMessageSearch(e.target.value)}
                  className="pl-9 h-9"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      goToNextResult()
                    }
                    if (e.key === 'Escape') {
                      closeMessageSearch()
                    }
                  }}
                />
              </div>
              {messageSearchResults.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {currentSearchIndex + 1} de {messageSearchResults.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={goToPrevResult}
                    disabled={messageSearchResults.length <= 1}
                  >
                    <ArrowLeft className="h-4 w-4 rotate-90" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={goToNextResult}
                    disabled={messageSearchResults.length <= 1}
                  >
                    <ArrowLeft className="h-4 w-4 -rotate-90" />
                  </Button>
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={closeMessageSearch}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Messages */}
          <ScrollArea
            className="flex-1 min-h-0 p-4"
            ref={messagesContainerRef}
            onScrollCapture={handleMessagesScroll}
          >
            {/* Loading indicator for older messages */}
            {isFetchingNextPage && (
              <div className="flex justify-center py-2 mb-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando mensagens anteriores...
                </div>
              </div>
            )}

            {/* Show "Load more" button if there are more pages */}
            {hasNextPage && !isFetchingNextPage && (
              <div className="flex justify-center py-2 mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  className="text-xs text-muted-foreground"
                >
                  Carregar mensagens anteriores
                </Button>
              </div>
            )}

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
                {/* Messages already sorted ascending by createdAt (oldest to newest) */}
                {messages.map((message: DBMessage | OptimisticMessage, msgIndex: number) => {
                  const isOptimistic = message.id.startsWith('optimistic-')
                  const isFailed = message.status === 'failed'
                  const isPending = message.status === 'pending'
                  const isSearchMatch = messageSearchResults.includes(msgIndex)
                  const isCurrentMatch = messageSearchResults[currentSearchIndex] === msgIndex

                  // Highlight search matches in content
                  const highlightContent = (content: string) => {
                    if (!messageSearchText || !isSearchMatch) return content
                    const regex = new RegExp(`(${messageSearchText})`, 'gi')
                    const parts = content.split(regex)
                    return parts.map((part, i) =>
                      regex.test(part) ? (
                        <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 rounded px-0.5">
                          {part}
                        </mark>
                      ) : part
                    )
                  }

                  return (
                    <div
                      key={message.id}
                      data-message-index={msgIndex}
                      className={cn(
                        "flex transition-all duration-300",
                        message.direction === 'OUTBOUND' ? "justify-end" : "justify-start",
                        isCurrentMatch && "scale-[1.02]"
                      )}
                    >
                      <div className="flex flex-col items-end gap-1">
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-4 py-2 shadow-sm transition-all",
                            message.direction === 'OUTBOUND'
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted rounded-bl-md",
                            // Failed messages get faded styling
                            isFailed && "opacity-50 border-2 border-destructive/50",
                            // Search highlight
                            isCurrentMatch && "ring-2 ring-yellow-400 ring-offset-2"
                          )}
                        >
                          {/* Media content */}
                          {'mediaUrl' in message && message.mediaUrl && (
                            <div className="mb-2">
                              {/* Image */}
                              {message.type === 'image' && (
                                <img
                                  src={message.mediaUrl}
                                  alt="Imagem"
                                  className="rounded-lg max-w-full cursor-pointer hover:opacity-90 transition-opacity"
                                  loading="lazy"
                                />
                              )}
                              {/* Video */}
                              {message.type === 'video' && (
                                <video
                                  src={message.mediaUrl}
                                  controls
                                  preload="metadata"
                                  className="rounded-lg max-w-full max-h-64"
                                >
                                  Seu navegador não suporta vídeo.
                                </video>
                              )}
                              {/* Audio & Voice (PTT) */}
                              {(message.type === 'audio' || message.type === 'voice') && (
                                <audio
                                  src={message.mediaUrl}
                                  controls
                                  preload="metadata"
                                  className="w-full max-w-[240px] h-10"
                                >
                                  Seu navegador não suporta áudio.
                                </audio>
                              )}
                              {/* Document */}
                              {message.type === 'document' && (
                                <a
                                  href={message.mediaUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2 bg-background/20 rounded hover:bg-background/30 transition-colors"
                                >
                                  <FileText className="h-8 w-8 flex-shrink-0" />
                                  <span className="text-sm truncate">{message.fileName || 'Documento'}</span>
                                </a>
                              )}
                              {/* Sticker (treated as image) */}
                              {message.type === 'sticker' && (
                                <img
                                  src={message.mediaUrl}
                                  alt="Sticker"
                                  className="max-w-32 max-h-32"
                                  loading="lazy"
                                />
                              )}
                            </div>
                          )}

                          {/* Text content with search highlighting */}
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {highlightContent(message.content)}
                          </p>

                          {/* Timestamp and status */}
                          <div className={cn(
                            "flex items-center justify-end gap-1 mt-1",
                            message.direction === 'OUTBOUND'
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          )}>
                            <span className="text-xs">
                              {formatTimestamp(message.createdAt)}
                            </span>
                            {isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              getStatusIcon(message.status, message.direction)
                            )}
                          </div>
                        </div>

                        {/* Failed message actions */}
                        {isFailed && isOptimistic && (
                          <div className="flex items-center gap-1 px-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                                  onClick={() => {
                                    if (selectedChatId) {
                                      retryMessageMutation.mutate({
                                        tempId: message.id,
                                        sessionId: selectedChatId,
                                        content: message.content,
                                      })
                                    }
                                  }}
                                  disabled={retryMessageMutation.isPending}
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Reenviar
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Tentar enviar novamente</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                                  onClick={() => deleteOptimisticMessage(message.id)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Descartar mensagem</TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Notes Panel (Collapsible) */}
          {showNotesPanel && (
            <div className="border-t bg-amber-50/50 dark:bg-amber-900/10 p-4 max-h-64 overflow-auto">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-amber-600" />
                  Notas internas
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNotesPanel(false)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Add note form */}
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Adicionar nota..."
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newNoteText.trim()) {
                      createNoteMutation.mutate(newNoteText.trim())
                    }
                  }}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => newNoteText.trim() && createNoteMutation.mutate(newNoteText.trim())}
                  disabled={!newNoteText.trim() || createNoteMutation.isPending}
                >
                  {createNoteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Notes list */}
              {notesLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : notes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma nota adicionada
                </p>
              ) : (
                <div className="space-y-2">
                  {notes.map((note: any) => (
                    <div
                      key={note.id}
                      className={cn(
                        "p-2 rounded-lg text-sm bg-white dark:bg-neutral-800 border",
                        note.isPinned && "border-amber-400 bg-amber-50 dark:bg-amber-900/20"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex-1 whitespace-pre-wrap">{note.content}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => togglePinMutation.mutate(note.id)}
                          >
                            {note.isPinned ? (
                              <PinOff className="h-3 w-3 text-amber-600" />
                            ) : (
                              <Pin className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteNoteMutation.mutate(note.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{note.author?.name || 'Agente'}</span>
                        <span>•</span>
                        <span>{format(new Date(note.createdAt), "dd/MM HH:mm")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Input Area */}
          <div className="p-4 border-t space-y-3 bg-card flex-shrink-0">
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

              {/* Quick Replies button */}
              <Popover open={showQuickReplies} onOpenChange={setShowQuickReplies}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Zap className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start" side="top">
                  <div className="p-3 border-b">
                    <div className="flex items-center gap-2">
                      <Command className="h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar ou digite /atalho..."
                        value={quickReplySearch}
                        onChange={(e) => setQuickReplySearch(e.target.value)}
                        className="h-8 text-sm"
                        autoFocus
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Digite / no chat para ativar atalhos
                    </p>
                  </div>
                  <ScrollArea className="max-h-64">
                    {quickRepliesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : quickReplies.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground text-sm">
                        {quickReplySearch ? 'Nenhum atalho encontrado' : 'Nenhuma resposta rápida'}
                      </div>
                    ) : (
                      <div className="p-1">
                        {quickReplies.map((qr: any) => (
                          <button
                            key={qr.id}
                            onClick={() => handleSelectQuickReply(qr)}
                            className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-sm">{qr.title}</span>
                              <Badge variant="outline" className="text-xs font-mono">
                                {qr.shortcut}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {qr.content}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
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

              {/* Message input with quick reply detection */}
              <div className="relative flex-1">
                <Input
                  ref={messageInputRef}
                  placeholder={selectedFile ? "Legenda (opcional)..." : "Digite / para atalhos ou mensagem..."}
                  value={messageText}
                  onChange={handleMessageChange}
                  onFocus={() => { isInputFocusedRef.current = true }}
                  onBlur={() => { isInputFocusedRef.current = false }}
                  onKeyDown={(e) => {
                    // Handle quick reply selection with Enter
                    if (e.key === 'Enter' && showQuickReplies && quickReplies.length > 0) {
                      e.preventDefault()
                      handleSelectQuickReply(quickReplies[0])
                      return
                    }
                    // Handle Escape to close quick replies
                    if (e.key === 'Escape' && showQuickReplies) {
                      setShowQuickReplies(false)
                      setQuickReplySearch('')
                      return
                    }
                    // Normal message send
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      selectedFile ? handleSendFile() : handleSendMessage()
                    }
                  }}
                  className="w-full"
                  disabled={isUploading || sendMessageMutation.isPending}
                />
                {/* Quick reply suggestions dropdown */}
                {showQuickReplies && quickReplies.length > 0 && messageText.startsWith('/') && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                    {quickReplies.slice(0, 5).map((qr: any, idx: number) => (
                      <button
                        key={qr.id}
                        onClick={() => handleSelectQuickReply(qr)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between",
                          idx === 0 && "bg-muted/50"
                        )}
                      >
                        <span className="truncate">{qr.title}</span>
                        <span className="text-xs font-mono text-muted-foreground ml-2">{qr.shortcut}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Audio recorder - show when no text and no file */}
              {!messageText.trim() && !selectedFile && (
                <AudioRecorder
                  onSend={handleSendAudio}
                  disabled={isUploading || sendMessageMutation.isPending}
                />
              )}

              {/* Send button - show when there's text or file */}
              {(messageText.trim() || selectedFile) && (
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
              )}
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
      <div className="h-[calc(100vh-5rem)] flex flex-col lg:flex-row gap-4 p-4" role="main" aria-label="Conversas WhatsApp">
        {/* Mobile Layout */}
        {isMobile ? (
          <>
            {/* Chats drawer */}
            <Sheet open={isChatsDrawerOpen} onOpenChange={setIsChatsDrawerOpen}>
              <SheetContent side="left" className="w-full sm:w-96 p-0 flex flex-col">
                <SheetHeader className="p-4 border-b flex-shrink-0">
                  <SheetTitle>Conversas</SheetTitle>
                </SheetHeader>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ChatsList />
                </div>
              </SheetContent>
            </Sheet>

            {/* Main messages area */}
            <Card className="flex-1 h-full min-h-0 overflow-hidden">
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
            <Card className="w-96 flex-shrink-0 h-full overflow-hidden">
              <CardContent className="p-0 h-full">
                <ChatsList />
              </CardContent>
            </Card>

            {/* Column 2: Messages */}
            <Card className="flex-1 min-w-0 h-full overflow-hidden">
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
