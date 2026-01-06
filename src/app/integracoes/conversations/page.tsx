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
import { LazyAvatar } from '@/components/ui/lazy-avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Play,
  Zap,
  Command,
  Mic,
  Download,
  ChevronDown,
  VolumeX,
  ExternalLink,
  Languages,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react'
import { api } from '@/igniter.client'
import { toast } from 'sonner'
import { format, isSameDay, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { AudioRecorder } from '@/components/chat/AudioRecorder'
import { AIMessageInput } from '@/components/chat/AIMessageInput'
import { useInstanceSSE } from '@/hooks/useInstanceSSE'
import { useDebounce } from '@/hooks/useDebounce'
import { useVirtualizer } from '@tanstack/react-virtual'

// Common emojis for quick access
const QUICK_EMOJIS = ['thumbsup', 'heart', 'joy', 'pray', 'wave', 'tada', 'check', 'star', 'fire']
  .map(() => ['👍', '❤️', '😂', '🙏', '👋', '🎉', '✅', '⭐', '🔥'])
  .flat()
  .slice(0, 10)

// ==================== CONSTANTS ====================
// Fallback polling intervals (only used when SSE is not connected)
const CHAT_REFRESH_INTERVAL = 30 * 1000 // 30 segundos (fallback)
const MESSAGE_REFRESH_INTERVAL = 15 * 1000 // 15 segundos (fallback)

/**
 * Helper para renderizar conteúdo de forma segura
 * Previne React Error #310 (Objects are not valid as React child)
 * ao garantir que o valor sempre seja uma string
 */
function safeRenderContent(content: unknown): string {
  // Fast path for strings
  if (typeof content === 'string') {
    return content
  }
  // Handle null/undefined
  if (content === null || content === undefined) {
    return ''
  }
  // Handle numbers and booleans
  if (typeof content === 'number' || typeof content === 'boolean') {
    return String(content)
  }
  // Handle arrays - join elements
  if (Array.isArray(content)) {
    return content.map(safeRenderContent).filter(Boolean).join(', ')
  }
  // Handle objects - try to extract text from known properties
  if (typeof content === 'object') {
    const obj = content as Record<string, unknown>
    // Try common text properties in order of priority
    const textValue = obj?.text ?? obj?.body ?? obj?.caption ?? obj?.title ??
                      obj?.name ?? obj?.message ?? obj?.content ?? obj?.value ??
                      obj?.label ?? obj?.description
    if (textValue !== undefined && textValue !== null) {
      return safeRenderContent(textValue) // Recursively ensure it's safe
    }
    // Last resort: empty string (don't JSON.stringify to avoid exposing data)
    return ''
  }
  // Fallback for any other type
  return String(content)
}

/**
 * Helper para formatar datas de forma segura
 * Previne erros quando createdAt é um objeto ao invés de string
 */
function safeFormatDate(dateValue: unknown, formatStr: string): string {
  try {
    if (dateValue === null || dateValue === undefined) {
      return ''
    }
    // Handle objects - try to extract date value
    if (typeof dateValue === 'object' && !(dateValue instanceof Date)) {
      const obj = dateValue as Record<string, unknown>
      dateValue = obj?.createdAt ?? obj?.date ?? obj?.timestamp ?? ''
    }
    const date = dateValue instanceof Date ? dateValue : new Date(String(dateValue))
    if (isNaN(date.getTime())) {
      return ''
    }
    return format(date, formatStr, { locale: ptBR })
  } catch {
    return ''
  }
}

// Format date for date separator between messages
function formatDateSeparator(dateValue: unknown): string {
  try {
    if (dateValue === null || dateValue === undefined) return ''
    const date = dateValue instanceof Date ? dateValue : new Date(String(dateValue))
    if (isNaN(date.getTime())) return ''

    if (isToday(date)) return 'Hoje'
    if (isYesterday(date)) return 'Ontem'
    return format(date, "EEEE, d 'de' MMMM", { locale: ptBR })
  } catch {
    return ''
  }
}

// Check if two dates are on different days
function shouldShowDateSeparator(currentDate: unknown, previousDate: unknown): boolean {
  try {
    if (!previousDate) return true // First message always shows date
    const current = currentDate instanceof Date ? currentDate : new Date(String(currentDate))
    const previous = previousDate instanceof Date ? previousDate : new Date(String(previousDate))
    if (isNaN(current.getTime()) || isNaN(previous.getTime())) return false
    return !isSameDay(current, previous)
  } catch {
    return false
  }
}

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
  mimeType: string | null
  transcription: string | null
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
  sessionId: string // Store sessionId for correct retry
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
  const [focusedChatIndex, setFocusedChatIndex] = useState<number>(-1) // Para navegação por teclado

  // Input state
  const [messageText, setMessageText] = useState('')
  const [searchText, setSearchText] = useState('')
  const debouncedSearchText = useDebounce(searchText, 300) // 300ms debounce for search
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
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [quickReplySearch, setQuickReplySearch] = useState('')
  const [showMessageSearch, setShowMessageSearch] = useState(false)
  const [messageSearchText, setMessageSearchText] = useState('')
  const [messageSearchResults, setMessageSearchResults] = useState<number[]>([]) // indices of matching messages
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0)

  // Estados para diálogos de confirmação de ações destrutivas
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [showBlockDialog, setShowBlockDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [pendingBlockAction, setPendingBlockAction] = useState<{ chatId: string; block: boolean } | null>(null)

  // Optimistic messages for immediate UI feedback
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([])

  // Cache de URLs de áudio carregados via API (para áudios que não têm mediaUrl direto)
  const [loadedAudioUrls, setLoadedAudioUrls] = useState<Map<string, string>>(new Map())
  const [loadingAudioIds, setLoadingAudioIds] = useState<Set<string>>(new Set())

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageInputRef = useRef<HTMLInputElement>(null)
  const chatListRef = useRef<HTMLDivElement>(null)
  const isInputFocusedRef = useRef(false)
  const previousScrollHeightRef = useRef<number>(0)
  const isNearBottomRef = useRef(true)
  const previousMessageCountRef = useRef<number>(0)
  const isFetchingRef = useRef(false) // Protege contra race conditions
  const [hasUnseenMessages, setHasUnseenMessages] = useState(false) // Indicador de novas mensagens

  // ==================== EFFECTS ====================
  useEffect(() => {
    setIsHydrated(true)

    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Restore focus after data refetch if user was typing
  // Note: This effect intentionally has an empty dep array - it only needs to run once on mount
  // The ref values are checked at runtime, not as dependencies
  useEffect(() => {
    const restoreFocus = () => {
      if (isInputFocusedRef.current && messageInputRef.current) {
        messageInputRef.current?.focus()
      }
    }
    // Only restore focus on initial mount
    restoreFocus()
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement
      const isInInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // Ctrl+K or Cmd+K to focus search (works even when typing)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        const searchInput = document.querySelector('input[placeholder*="Buscar conversas"]') as HTMLInputElement
        searchInput?.focus()
        return
      }

      // Escape to close search/deselect
      if (e.key === 'Escape') {
        if (showMessageSearch) {
          setShowMessageSearch(false)
          setMessageSearchText('')
          setMessageSearchResults([])
          return
        }
        if (searchText) {
          setSearchText('')
          return
        }
      }

      // Skip shortcuts if user is typing in input
      if (isInInput) return

      // / to focus search
      if (e.key === '/') {
        e.preventDefault()
        const searchInput = document.querySelector('input[placeholder*="Buscar conversas"]') as HTMLInputElement
        searchInput?.focus()
        return
      }

      // 1, 2, 3 to switch tabs
      if (e.key === '1') {
        setMainTab('ia')
        return
      }
      if (e.key === '2') {
        setMainTab('atendente')
        return
      }
      if (e.key === '3') {
        setMainTab('resolvidos')
        return
      }

      // Ctrl+F or Cmd+F to search in messages (when chat selected)
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && selectedChatId) {
        e.preventDefault()
        setShowMessageSearch(true)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchText, showMessageSearch, selectedChatId, setMainTab, setSearchText, setShowMessageSearch, setMessageSearchText, setMessageSearchResults])

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

  // Extract connected instances with sanitized data
  const instances = useMemo(() => {
    const response = instancesData as any
    const data = response?.data?.data ?? response?.data ?? []
    const connected = data
      .filter((i: Instance) => i.status === 'CONNECTED' || i.status === 'connected')
      .map((i: any) => ({
        ...i,
        // Ensure all potentially rendered fields are strings
        name: safeRenderContent(i.name),
        phoneNumber: safeRenderContent(i.phoneNumber),
        profilePictureUrl: typeof i.profilePictureUrl === 'string' ? i.profilePictureUrl : '',
      }))
    return connected
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
    selectedSessionId: selectedChatId ?? undefined, // Only invalidate messages for the selected chat
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

  // Fetch chats for selected instance(s) with infinite scroll
  // OTIMIZADO: Usa endpoint unificado /api/v1/chats/all com cursor-based pagination
  const CHATS_PER_PAGE = 50
  const {
    data: chatsInfiniteData,
    isLoading: chatsLoading,
    error: chatsError,
    isFetching: chatsFetching,
    refetch: refetchChats,
    fetchNextPage: fetchNextChatsPage,
    hasNextPage: hasMoreChats,
    isFetchingNextPage: isFetchingMoreChats,
  } = useInfiniteQuery({
    queryKey: ['conversations', 'chats', 'all', instanceIdsToFetch],
    queryFn: async ({ pageParam }) => {
      if (instanceIdsToFetch.length === 0) {
        return { chats: [], counts: { ai: 0, human: 0, archived: 0, groups: 0 }, pagination: { hasMore: false } }
      }

      try {
        // Endpoint unificado com cursor-based pagination
        const response = await api.chats.all.query({
          query: {
            instanceIds: instanceIdsToFetch,
            limit: CHATS_PER_PAGE,
            cursor: pageParam || undefined,
          }
        })

        const data = (response as any)?.data ?? response

        return {
          chats: data?.chats ?? [],
          counts: data?.counts ?? { ai: 0, human: 0, archived: 0, groups: 0 },
          instances: data?.instances ?? [],
          pagination: data?.pagination ?? { total: 0, limit: CHATS_PER_PAGE, hasMore: false, cursor: null },
        }
      } catch (error) {
        console.error('[Conversations] Erro ao buscar chats:', error)
        return { chats: [], counts: { ai: 0, human: 0, archived: 0, groups: 0 }, pagination: { hasMore: false } }
      }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      // Usar cursor do backend para próxima página
      if (lastPage.pagination?.hasMore && lastPage.pagination?.cursor) {
        return lastPage.pagination.cursor
      }
      return undefined
    },
    enabled: instanceIdsToFetch.length > 0,
    // Reduce polling when SSE is connected (SSE handles real-time updates)
    refetchInterval: sseConnected ? false : CHAT_REFRESH_INTERVAL,
    refetchOnWindowFocus: false, // Disable to prevent constant updates
    staleTime: 60000, // Cache for 60 seconds (SSE garante real-time)
    gcTime: 120000, // Manter em cache por 2 minutos
  })

  // Flatten infinite query pages into single chatsData object
  const chatsData = useMemo(() => {
    if (!chatsInfiniteData?.pages?.length) {
      return { chats: [], counts: { ai: 0, human: 0, archived: 0, groups: 0 } }
    }

    // Merge all pages - use first page counts (most accurate)
    const allChats: UAZChat[] = []
    for (const page of chatsInfiniteData.pages) {
      allChats.push(...(page.chats || []))
    }

    return {
      chats: allChats,
      counts: chatsInfiniteData.pages[0]?.counts ?? { ai: 0, human: 0, archived: 0, groups: 0 },
      instances: chatsInfiniteData.pages[0]?.instances ?? [],
      pagination: chatsInfiniteData.pages[chatsInfiniteData.pages.length - 1]?.pagination,
    }
  }, [chatsInfiniteData])

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
  // OTIMIZADO: Usa contagens do servidor quando disponíveis
  // Safety: ensure all counts are valid numbers to prevent React Error #310
  const toNumber = (value: unknown): number => {
    if (typeof value === 'number' && !isNaN(value)) return value
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10)
      return isNaN(parsed) ? 0 : parsed
    }
    return 0
  }

  const tabCounts = useMemo(() => {
    const serverCounts = (chatsData as any)?.counts
    const data: UAZChat[] = (chatsData as any)?.chats ?? []

    // Usar contagens do servidor se disponíveis (mais eficiente)
    if (serverCounts) {
      const ai = toNumber(serverCounts.ai)
      const human = toNumber(serverCounts.human)
      const archived = toNumber(serverCounts.archived)
      const groups = toNumber(serverCounts.groups)
      return {
        ia: ai,
        atendente: human,
        resolvidos: archived,
        groups: groups,
        direct: (human + ai) - groups,
      }
    }

    // Fallback para cálculo no cliente (compatibilidade)
    // Helper para verificar se é grupo (pode vir como boolean ou string)
    const checkIsGroup = (chat: any) => chat.wa_isGroup === true || chat.wa_isGroup === 'true'
    return {
      ia: data.filter(isAIActive).length,
      atendente: data.filter(isHumanAttending).length,
      resolvidos: data.filter(isResolved).length,
      groups: data.filter(chat => checkIsGroup(chat) && !isResolved(chat)).length,
      direct: data.filter(chat => !checkIsGroup(chat) && !isResolved(chat)).length,
    }
  }, [chatsData, isAIActive, isHumanAttending, isResolved])

  // Extract and filter chats based on mainTab, chatTypeFilter and search
  const chats = useMemo(() => {
    const rawData: UAZChat[] = (chatsData as any)?.chats ?? []

    // Sanitize all chat fields that might be rendered
    const data = rawData.map(chat => ({
      ...chat,
      wa_name: safeRenderContent(chat.wa_name),
      wa_lastMsgBody: safeRenderContent(chat.wa_lastMsgBody),
      wa_phoneNumber: safeRenderContent((chat as any).wa_phoneNumber),
      instanceName: safeRenderContent((chat as any).instanceName),
    }))

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
    // Nota: wa_isGroup pode vir como string "true"/"false" ou boolean
    if (chatTypeFilter === 'direct') {
      filtered = filtered.filter(chat => {
        const isGroup = chat.wa_isGroup === true || String(chat.wa_isGroup) === 'true'
        return !isGroup
      })
    } else if (chatTypeFilter === 'groups') {
      filtered = filtered.filter(chat => {
        const isGroup = chat.wa_isGroup === true || String(chat.wa_isGroup) === 'true'
        return isGroup
      })
    }

    // 3. Filtrar por busca (usando valor debounced para evitar re-renders excessivos)
    if (debouncedSearchText.trim()) {
      const search = debouncedSearchText.toLowerCase()
      filtered = filtered.filter(chat =>
        chat.wa_name?.toLowerCase().includes(search) ||
        chat.wa_chatid.toLowerCase().includes(search) ||
        chat.wa_lastMsgBody?.toLowerCase().includes(search)
      )
    }

    return filtered
  }, [chatsData, mainTab, chatTypeFilter, debouncedSearchText, isAIActive, isHumanAttending, isResolved])

  // Virtualização da lista de chats para performance
  // Aumentamos a altura para acomodar casos onde há nome de instância mostrado
  const CHAT_ITEM_HEIGHT = 105 // altura para acomodar: avatar, nome/hora, telefone, preview, instância

  // Memoize getItemKey to prevent infinite re-renders
  const getItemKey = useCallback((index: number) => {
    const chat = chats[index] as any
    return chat?.id || chat?.wa_chatid || `chat-${index}`
  }, [chats])

  const chatListVirtualizer = useVirtualizer({
    count: chats.length,
    getScrollElement: () => chatListRef.current,
    estimateSize: () => CHAT_ITEM_HEIGHT,
    overscan: 8, // renderizar 8 itens extras acima/abaixo para scroll suave
    getItemKey,
  })

  // Infinite scroll para chats - carregar mais quando chegar perto do final
  // NOTA: Usamos chatListVirtualizer como dependência estável ao invés de getVirtualItems()
  // porque getVirtualItems() retorna novo array a cada chamada, causando loop infinito
  const virtualItems = chatListVirtualizer.getVirtualItems()
  const lastVirtualItem = virtualItems[virtualItems.length - 1]
  const lastItemIndex = lastVirtualItem?.index ?? -1

  useEffect(() => {
    // Se o último item visível está próximo do fim da lista (últimos 5 items)
    if (
      lastItemIndex >= 0 &&
      lastItemIndex >= chats.length - 5 &&
      hasMoreChats &&
      !isFetchingMoreChats
    ) {
      fetchNextChatsPage()
    }
  }, [
    lastItemIndex,
    chats.length,
    hasMoreChats,
    isFetchingMoreChats,
    fetchNextChatsPage,
  ])

  // Format count for display (99+ for large numbers)
  // Safety: ensure count is a valid number to prevent React Error #310
  const formatCount = (count: unknown): string => {
    const num = typeof count === 'number' ? count : (typeof count === 'string' ? parseInt(count, 10) : 0)
    if (isNaN(num)) return '0'
    return num > 99 ? '99+' : String(num)
  }

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

    // Flatten all pages into single array and sanitize content
    for (const page of pages) {
      const pageData = (page as any)?.data?.data ?? (page as any)?.data ?? []
      // Sanitize each message's content field
      const sanitizedMessages = pageData.map((msg: any) => ({
        ...msg,
        content: safeRenderContent(msg.content),
      }))
      allServerMessages.push(...sanitizedMessages)
    }

    // DEDUPE: Remove duplicates by id (can happen with pagination during updates)
    const seenIds = new Set<string>()
    const dedupedMessages = allServerMessages.filter((msg) => {
      const msgId = msg.id || msg.waMessageId
      if (seenIds.has(msgId)) {
        return false
      }
      seenIds.add(msgId)
      return true
    })

    // Sort all messages by createdAt ascending (oldest first)
    // Backend returns desc order, but with pagination we need to re-sort
    dedupedMessages.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      return dateA - dateB // Ascending order (oldest to newest)
    })

    // Filter optimistic messages for current session
    const sessionOptimistic = optimisticMessages.filter(
      m => m.id.startsWith(`optimistic-${selectedChatId}`)
    )

    // Merge: add optimistic messages that aren't yet in server response
    const serverIds = new Set(dedupedMessages.map((m: DBMessage) => m.waMessageId || m.id))
    const newOptimistic = sessionOptimistic.filter(m => !serverIds.has(m.id))

    // Return sorted messages with optimistic ones at the end (they are the newest)
    return [...dedupedMessages, ...newOptimistic]
  }, [messagesData, optimisticMessages, selectedChatId])

  // Handle scroll to load more messages (scroll to top = older messages)
  // Debounced com proteção contra race conditions
  const handleMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    // ScrollArea dispara eventos do viewport interno
    const target = e.target as HTMLDivElement

    // Verificar se é o viewport do ScrollArea (não o wrapper)
    if (!target.hasAttribute('data-radix-scroll-area-viewport')) {
      return // Ignorar eventos do wrapper externo
    }

    // Track if user is near bottom (within 150px) for smart auto-scroll
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight
    isNearBottomRef.current = distanceFromBottom < 150

    // Se usuário voltou para o final, limpar indicador de novas mensagens
    if (isNearBottomRef.current && hasUnseenMessages) {
      setHasUnseenMessages(false)
    }

    // Load more when scrolled near top (within 100px)
    // Proteção: só carrega se não estiver já carregando (debounce implícito)
    if (target.scrollTop < 100 && hasNextPage && !isFetchingNextPage && !isFetchingRef.current) {
      // Save current scroll position to restore after loading
      previousScrollHeightRef.current = target.scrollHeight
      isFetchingRef.current = true // Marca como carregando
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, hasUnseenMessages])

  // Restore scroll position after loading more messages
  // Usa requestAnimationFrame para garantir que o DOM foi atualizado
  useEffect(() => {
    if (!isFetchingNextPage && previousScrollHeightRef.current > 0 && messagesContainerRef.current) {
      const savedScrollHeight = previousScrollHeightRef.current
      previousScrollHeightRef.current = 0 // Reset imediatamente para evitar re-execução

      // Usar requestAnimationFrame para garantir que o DOM foi atualizado
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          // ScrollArea usa um viewport interno - precisamos acessá-lo
          const viewport = messagesContainerRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement
          const container = viewport || messagesContainerRef.current
          const newScrollHeight = container.scrollHeight
          const scrollDiff = newScrollHeight - savedScrollHeight

          // Restaurar posição do scroll
          container.scrollTop = scrollDiff

          // Double-check com segundo frame para garantir estabilidade
          requestAnimationFrame(() => {
            const checkContainer = viewport || messagesContainerRef.current
            if (checkContainer && checkContainer.scrollTop !== scrollDiff) {
              checkContainer.scrollTop = scrollDiff
            }
            // Reset flag de fetching após restaurar posição
            isFetchingRef.current = false
          })
        }
      })
    } else if (!isFetchingNextPage) {
      // Reset flag mesmo se não precisou restaurar posição
      isFetchingRef.current = false
    }
  }, [isFetchingNextPage])

  // Selected items
  const selectedInstance = selectedChatInstanceId
    ? instances.find((i: Instance) => i.id === selectedChatInstanceId)
    : null
  const selectedChat = chats.find((c: UAZChat) => c.id === selectedChatId || c.wa_chatid === selectedChatId)

  // ==================== QUICK REPLIES ====================

  // Fetch quick replies
  const {
    data: quickRepliesData,
    isLoading: quickRepliesLoading,
  } = useQuery({
    queryKey: ['quick-replies', quickReplySearch],
    queryFn: async () => {
      try {
        const response = await (api['quick-replies'] as any).list.query({
          query: { search: quickReplySearch || undefined, limit: 20 }
        })
        // Handle different response formats from Igniter
        const raw = response as any
        let result = raw
        if (result?.data) result = result.data
        if (result?.data) result = result.data

        return {
          quickReplies: Array.isArray(result?.quickReplies) ? result.quickReplies : [],
          categories: Array.isArray(result?.categories) ? result.categories : [],
        }
      } catch (err) {
        console.error('[Conversations] Quick replies fetch error:', err)
        return { quickReplies: [], categories: [] }
      }
    },
    enabled: showQuickReplies,
    staleTime: 60000, // Cache for 1 minute
  })

  const quickReplies = quickRepliesData?.quickReplies ?? []

  // Handle quick reply selection
  const handleSelectQuickReply = useCallback((qr: any) => {
    // Safely extract content as string
    const content = safeRenderContent(qr.content)
    setMessageText(content)
    setShowQuickReplies(false)
    setQuickReplySearch('')
    messageInputRef.current?.focus()

    // Increment usage count
    ;(api['quick-replies'] as any).use.mutate({ params: { id: qr.id } }).catch(() => {})
  }, [])

  // Detect shortcut typing (e.g., /ola)
  const handleMessageChange = useCallback((value: string) => {
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

  // Scroll para o final da lista de mensagens
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setHasUnseenMessages(false)
    isNearBottomRef.current = true
  }, [])

  // Close search
  const closeMessageSearch = useCallback(() => {
    setShowMessageSearch(false)
    setMessageSearchText('')
    setMessageSearchResults([])
    setCurrentSearchIndex(0)
  }, [])

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
        sessionId: data.sessionId, // Store for retry
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
      console.error('[Conversations] Send message error:', error)

      // Extrair código de erro para mensagens específicas
      const errorCode = error?.data?.code || error?.code
      let errorMessage = 'Erro ao enviar mensagem'
      let errorDescription = ''

      switch (errorCode) {
        case 'INSTANCE_DISCONNECTED':
          errorMessage = 'WhatsApp desconectado'
          errorDescription = 'Reconecte a instância para enviar mensagens'
          break
        case 'RATE_LIMITED':
          errorMessage = 'Limite de mensagens atingido'
          errorDescription = 'Aguarde alguns segundos e tente novamente'
          break
        case 'SESSION_CLOSED':
          errorMessage = 'Conversa encerrada'
          errorDescription = 'Reabra a conversa para continuar'
          break
        case 'CIRCUIT_OPEN':
          errorMessage = 'Serviço temporariamente indisponível'
          errorDescription = 'Aguarde 30 segundos e tente novamente'
          break
        default: {
          // Safely extract error message as string
          const msgCandidate = error?.message ?? error?.data?.message
          errorMessage = typeof msgCandidate === 'string' ? msgCandidate : 'Falha ao enviar mensagem'
          // Safely extract error description as string
          const descCandidate = error?.data?.error ?? error?.response?.data?.error
          errorDescription = typeof descCandidate === 'string' ? descCandidate : ''
        }
      }

      toast.error(errorMessage, { description: errorDescription || undefined })
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
      // Usar mesmo tratamento de erros do sendMessageMutation
      const errorCode = error?.data?.code || error?.code
      let errorMessage = 'Erro ao reenviar mensagem'

      switch (errorCode) {
        case 'INSTANCE_DISCONNECTED':
          errorMessage = 'WhatsApp desconectado - reconecte para reenviar'
          break
        case 'RATE_LIMITED':
          errorMessage = 'Limite atingido - aguarde e tente novamente'
          break
        case 'CIRCUIT_OPEN':
          errorMessage = 'Serviço indisponível - aguarde 30s'
          break
        default:
          errorMessage = typeof error?.message === 'string' ? error.message : 'Erro ao reenviar mensagem'
      }

      toast.error(errorMessage)
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
      const message = typeof error?.message === 'string' ? error.message : 'Erro ao arquivar chat'
      toast.error(message)
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
      const message = typeof error?.message === 'string' ? error.message : 'Erro ao bloquear contato'
      toast.error(message)
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
      const message = typeof error?.message === 'string' ? error.message : 'Erro ao encerrar conversa'
      toast.error(message)
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
      const message = typeof error?.message === 'string' ? error.message : 'Erro ao reabrir conversa'
      toast.error(message)
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
      const message = typeof error?.message === 'string' ? error.message : 'Erro ao apagar conversa'
      toast.error(message)
    }
  })

  // Sync chats from UAZapi (manual import)
  const syncChatsMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      // Direct fetch to sync endpoint (schema may not be regenerated yet)
      const response = await fetch('/api/v1/chats/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ instanceId }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Erro ao sincronizar' }))
        throw new Error(error.message || 'Erro ao sincronizar chats')
      }

      return response.json()
    },
    onSuccess: (data: any) => {
      const result = data?.data ?? data
      const message = typeof result?.message === 'string' ? result.message : 'Chats sincronizados!'
      toast.success(message)
      refetchChats()
    },
    onError: (error: any) => {
      const message = typeof error?.message === 'string' ? error.message : 'Erro ao sincronizar chats'
      toast.error(message)
    }
  })

  // ==================== HANDLERS ====================

  const handleSelectChat = useCallback((chat: UAZChat) => {
    // Use session ID for messages API - chat.id should be a UUID from the database
    const sessionId = chat.id

    // Validate session ID is present and is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!sessionId || !uuidRegex.test(sessionId)) {
      console.error('[Conversations] Invalid or missing session ID for chat:', {
        id: chat.id,
        wa_chatid: chat.wa_chatid,
        wa_name: chat.wa_name
      })
      toast.error('Sessão não encontrada', { description: 'Esta conversa não possui uma sessão válida' })
      return
    }

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

    // Focus management: mover foco para o input de mensagem após selecionar chat
    setTimeout(() => {
      messageInputRef.current?.focus()
    }, 100)
  }, [isMobile, markAsReadMutation])

  const handleSendMessage = useCallback(() => {
    if (!messageText.trim() || !selectedChatId) return

    // Validate that selectedChatId is a valid UUID (not a wa_chatid)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(selectedChatId)) {
      console.error('[Conversations] Invalid session ID:', selectedChatId)
      toast.error('Erro: ID de sessão inválido', { description: 'Selecione outra conversa' })
      return
    }

    const textToSend = messageText.trim()
    const tempId = `optimistic-${selectedChatId}-${Date.now()}`

    // Clear input optimistically for better UX
    setMessageText('')

    sendMessageMutation.mutate({
      sessionId: selectedChatId,
      content: textToSend,
      tempId,
    })

    // Manter foco no input após enviar
    messageInputRef.current?.focus()
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
    // Use wa_chatid (WhatsApp chat ID) for UAZapi, not session UUID
    const waChatId = selectedChat?.wa_chatid
    if (!selectedFile || !selectedChatInstanceId || !waChatId) return

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
            chatId: waChatId, // Use WhatsApp chat ID for UAZapi
            mediaBase64: base64,
            mimeType: selectedFile.type,
            fileName: selectedFile.name,
            caption: messageText || undefined,
            sessionId: selectedChatId || undefined, // ⭐ CRITICAL: Pass session ID to ensure file appears in correct chat
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
      const description = typeof error?.message === 'string' ? error.message : undefined
      toast.error('Erro ao enviar arquivo', { description })
    } finally {
      setIsUploading(false)
    }
  }, [selectedFile, selectedChatInstanceId, selectedChat?.wa_chatid, messageText, refetchMessages])

  const handleCancelFile = useCallback(() => {
    setSelectedFile(null)
    setFilePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // Handle audio message
  const handleSendAudio = useCallback(async (audioBase64: string, mimeType: string, duration: number) => {
    // Use wa_chatid (WhatsApp chat ID) for UAZapi, not session UUID
    const waChatId = selectedChat?.wa_chatid
    if (!selectedChatInstanceId || !waChatId || !selectedChatId) return

    try {
      await api.media.sendAudio.mutate({
        body: {
          instanceId: selectedChatInstanceId,
          chatId: waChatId, // Use WhatsApp chat ID for UAZapi
          mediaBase64: audioBase64,
          mimeType: mimeType,
          duration: duration,
          sessionId: selectedChatId, // ⭐ CRITICAL: Pass session ID to ensure audio appears in correct chat
        }
      })

      refetchMessages()
      toast.success('Audio enviado!')
    } catch (error: any) {
      console.error('[ConversationsPage] Error sending audio:', error)
      const description = typeof error?.message === 'string' ? error.message : undefined
      toast.error('Erro ao enviar audio', { description })
      throw error // Re-throw so AudioRecorder knows it failed
    }
  }, [selectedChatInstanceId, selectedChat?.wa_chatid, selectedChatId, refetchMessages])

  // Cache de áudios que falharam ao carregar (não tentar novamente)
  const [failedAudioIds, setFailedAudioIds] = useState<Set<string>>(new Set())

  // Transcrição de áudio
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set())
  const [transcriptions, setTranscriptions] = useState<Map<string, string>>(new Map())

  // PDF Fullscreen Modal
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [pdfModalUrl, setPdfModalUrl] = useState<string | null>(null)
  const [pdfModalFileName, setPdfModalFileName] = useState<string>('Documento')
  const [pdfZoom, setPdfZoom] = useState(100)

  // Handle opening PDF in fullscreen modal
  const handleOpenPdfModal = useCallback((url: string, fileName: string) => {
    setPdfModalUrl(url)
    setPdfModalFileName(fileName)
    setPdfZoom(100)
    setPdfModalOpen(true)
  }, [])

  // Handle closing PDF modal
  const handleClosePdfModal = useCallback(() => {
    setPdfModalOpen(false)
    setPdfModalUrl(null)
    setPdfModalFileName('Documento')
    setPdfZoom(100)
  }, [])

  // Handle loading audio from API when mediaUrl is not available
  const handleLoadAudio = useCallback(async (messageId: string) => {
    // Already loading, loaded, or failed
    if (loadingAudioIds.has(messageId) || loadedAudioUrls.has(messageId) || failedAudioIds.has(messageId)) {
      return
    }

    setLoadingAudioIds(prev => new Set(prev).add(messageId))

    try {
      // Use fetch directly for path param endpoint
      const response = await fetch(`/api/v1/messages/${messageId}/download`, {
        method: 'GET',
        credentials: 'include',
      })

      const result = await response.json()

      // Check for error in response
      if (!response.ok || result?.error) {
        throw new Error(result?.error?.message || `HTTP ${response.status}`)
      }

      const data = result?.data

      if (data?.mediaUrl) {
        // API returned a direct URL
        setLoadedAudioUrls(prev => new Map(prev).set(messageId, data.mediaUrl))
      } else if (data?.data) {
        // API returned base64 data - convert to data URL
        const mimeType = data.mimeType || 'audio/ogg'
        const dataUrl = `data:${mimeType};base64,${data.data}`
        setLoadedAudioUrls(prev => new Map(prev).set(messageId, dataUrl))
      } else {
        throw new Error('Áudio não disponível')
      }
    } catch (error: any) {
      console.error('[ConversationsPage] Error loading audio:', error)
      // Mark as failed so we don't retry automatically
      setFailedAudioIds(prev => new Set(prev).add(messageId))
    } finally {
      setLoadingAudioIds(prev => {
        const next = new Set(prev)
        next.delete(messageId)
        return next
      })
    }
  }, [loadingAudioIds, loadedAudioUrls, failedAudioIds])

  // Handle audio transcription using AI
  const handleTranscribeAudio = useCallback(async (messageId: string) => {
    // Skip if already transcribing
    if (transcribingIds.has(messageId)) {
      return
    }

    // If already has transcription in local state, skip
    const existingLocal = transcriptions.get(messageId)
    if (existingLocal) {
      return
    }

    setTranscribingIds(prev => new Set(prev).add(messageId))

    try {
      const response = await fetch(`/api/v1/messages/media/transcribe/${messageId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      })

      const result = await response.json()
      console.log('[Transcription] API Response:', result)

      if (!response.ok) {
        throw new Error(result.error?.message || result.message || 'Erro ao transcrever')
      }

      // Handle both direct data and nested data structure
      const transcriptionText = result.data?.transcription || result.transcription || ''

      console.log('[Transcription] Extracted text:', transcriptionText)

      if (transcriptionText) {
        // Update local state immediately
        setTranscriptions(prev => {
          const newMap = new Map(prev)
          newMap.set(messageId, transcriptionText)
          console.log('[Transcription] Updated state for message:', messageId)
          return newMap
        })
        toast.success('Áudio transcrito!')
      } else {
        toast.warning('Transcrição vazia retornada')
      }
    } catch (error: any) {
      console.error('[Transcription] Error:', error)
      toast.error(error.message || 'Erro ao transcrever áudio')
    } finally {
      setTranscribingIds(prev => {
        const next = new Set(prev)
        next.delete(messageId)
        return next
      })
    }
  }, [transcribingIds, transcriptions])

  // Auto-load audio messages that don't have mediaUrl
  // This provides better UX - audio is ready to play when user sees it
  useEffect(() => {
    if (!messages || messages.length === 0) return

    // Find audio messages without mediaUrl that haven't been loaded or failed yet
    // Only process DBMessage (not OptimisticMessage which doesn't have audio)
    const audioMessagesToLoad = messages.filter((msg) => {
      // Skip OptimisticMessage (only has type 'text')
      if (!('mediaUrl' in msg)) return false
      const dbMsg = msg as DBMessage
      const isAudio = dbMsg.type === 'audio' || dbMsg.type === 'voice' || dbMsg.type === 'ptt'
      const needsLoad = !dbMsg.mediaUrl && !loadedAudioUrls.has(dbMsg.id) && !loadingAudioIds.has(dbMsg.id) && !failedAudioIds.has(dbMsg.id)
      return isAudio && needsLoad
    }) as DBMessage[]

    // Load up to 5 audio messages at a time to avoid overwhelming the API
    const toLoad = audioMessagesToLoad.slice(0, 5)
    toLoad.forEach((msg) => {
      handleLoadAudio(msg.id)
    })
  }, [messages, loadedAudioUrls, loadingAudioIds, failedAudioIds, handleLoadAudio])

  const handleManualRefresh = useCallback(async () => {
    // Fazer sync forçado com UAZapi para buscar novos chats
    try {
      toast.loading('Sincronizando com WhatsApp...', { id: 'sync' })

      // Chamar API com forceSync=true para sincronizar novos chats do UAZapi
      await api.chats.all.query({
        query: {
          instanceIds: instanceIdsToFetch,
          limit: 100,
          forceSync: true, // Força sync com UAZapi
        }
      })

      // Refetch todos os dados
      await Promise.all([
        refetchInstances(),
        refetchChats(),
        refetchMessages(),
      ])

      toast.success('Sincronizado com sucesso!', { id: 'sync' })
    } catch (error: any) {
      console.error('[Conversations] Force sync error:', error)
      const description = typeof error?.message === 'string' ? error.message : undefined
      toast.error('Erro ao sincronizar', { id: 'sync', description })
    }
  }, [refetchInstances, refetchChats, refetchMessages, instanceIdsToFetch])

  // Navegação por teclado na lista de chats (WCAG 2.1.1)
  const handleChatListKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (chats.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedChatIndex(prev => {
          const next = prev < chats.length - 1 ? prev + 1 : 0
          // Scroll para o item focado
          chatListVirtualizer.scrollToIndex(next, { align: 'auto' })
          return next
        })
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedChatIndex(prev => {
          const next = prev > 0 ? prev - 1 : chats.length - 1
          chatListVirtualizer.scrollToIndex(next, { align: 'auto' })
          return next
        })
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (focusedChatIndex >= 0 && focusedChatIndex < chats.length) {
          handleSelectChat(chats[focusedChatIndex] as UAZChat)
        }
        break
      case 'Home':
        e.preventDefault()
        setFocusedChatIndex(0)
        chatListVirtualizer.scrollToIndex(0, { align: 'start' })
        break
      case 'End':
        e.preventDefault()
        setFocusedChatIndex(chats.length - 1)
        chatListVirtualizer.scrollToIndex(chats.length - 1, { align: 'end' })
        break
    }
  }, [chats, focusedChatIndex, handleSelectChat, chatListVirtualizer])

  // Reset scroll state when switching chats - always scroll to bottom on new chat
  useEffect(() => {
    if (selectedChatId) {
      // Reset state for new chat
      isNearBottomRef.current = true
      previousMessageCountRef.current = 0
      setHasUnseenMessages(false) // Reset indicador de novas mensagens
    }
  }, [selectedChatId])

  // Smart auto-scroll: only scroll to bottom when user was near bottom or sent a new message
  useEffect(() => {
    const currentCount = messages.length
    const previousCount = previousMessageCountRef.current
    const hasNewMessages = currentCount > previousCount && previousCount > 0 // Não contar load inicial

    // Update previous count
    previousMessageCountRef.current = currentCount

    // Only auto-scroll if:
    // 1. User was near bottom (not scrolling through history)
    // 2. OR there are new messages and optimistic messages exist (user sent a message)
    // 3. OR this is the initial load (previousCount was 0)
    const isInitialLoad = previousCount === 0 && currentCount > 0
    const userSentMessage = optimisticMessages.length > 0
    const shouldScroll =
      (hasNewMessages && (isNearBottomRef.current || userSentMessage)) ||
      isInitialLoad

    if (shouldScroll && messages.length > 0) {
      // Use instant scroll for initial load, smooth for subsequent updates
      messagesEndRef.current?.scrollIntoView({
        behavior: isInitialLoad ? 'instant' : 'smooth'
      })
      setHasUnseenMessages(false)
    } else if (hasNewMessages && !isNearBottomRef.current && !userSentMessage) {
      // Usuário está lendo histórico e chegaram novas mensagens
      // Mostrar indicador "Novas mensagens ↓"
      setHasUnseenMessages(true)
    }
  }, [messages, optimisticMessages.length])

  // ==================== HELPER FUNCTIONS ====================

  /**
   * Normaliza texto removendo caracteres Unicode problemáticos
   * que causam espaçamentos estranhos em mensagens do WhatsApp
   */
  const normalizeTextContent = (text: string): string => {
    if (!text) return ''

    let normalized = text
      // Substituir zero-width spaces e caracteres invisíveis
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Substituir non-breaking space por espaço normal
      .replace(/\u00A0/g, ' ')
      // Substituir múltiplos espaços consecutivos por um
      .replace(/ {2,}/g, ' ')

    // Detectar e corrigir texto "vertical" (ex: "T\nb\no\nm" → "Tbom")
    // Se a maioria das linhas tem apenas 1-2 caracteres, provavelmente é texto quebrado
    const lines = normalized.split('\n')
    if (lines.length > 2) {
      const shortLines = lines.filter(line => line.trim().length <= 2 && line.trim().length > 0)
      const ratio = shortLines.length / lines.length

      // Se mais de 60% das linhas são curtas (1-2 chars), juntar tudo
      if (ratio > 0.6) {
        normalized = lines.map(line => line.trim()).join('')
      }
    }

    // Limpar linhas
    return normalized
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      // Remover linhas vazias consecutivas (máximo 1 linha vazia)
      .replace(/\n{3,}/g, '\n\n')
  }

  // Memoizado para evitar recriação em cada render
  // Safety: handle potential object values to prevent React Error #310
  const formatTimestamp = useCallback((timestamp: unknown): string => {
    try {
      // Handle null/undefined
      if (timestamp === null || timestamp === undefined) {
        return ''
      }

      // Handle objects - try to extract timestamp value
      if (typeof timestamp === 'object') {
        const obj = timestamp as Record<string, unknown>
        const extracted = obj?.timestamp ?? obj?.date ?? obj?.time ?? obj?.createdAt
        if (extracted === undefined) return ''
        timestamp = extracted
      }

      // Now handle number or string
      const date = typeof timestamp === 'number'
        ? new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000)
        : new Date(String(timestamp))

      // Check for invalid date
      if (isNaN(date.getTime())) {
        return ''
      }

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
    } catch {
      return ''
    }
  }, [])

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

  // ==================== RENDER STATES (computed, not early returns) ====================
  // Note: We use conditional rendering instead of early returns to ensure all hooks are called
  // This prevents "Rendered more hooks than during the previous render" errors

  const isLoading = !isHydrated || instancesLoading
  const hasError = !!instancesError
  const hasNoInstances = instances.length === 0

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
                {safeRenderContent(instances.find((i: Instance) => i.id === selectedInstanceFilter)?.name) || 'Selecionar'}
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
                  {safeRenderContent(instance.name)?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{safeRenderContent(instance.name)}</span>
              <span className="text-xs text-muted-foreground">
                {safeRenderContent(instance.phoneNumber)}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  // Chats List Content - Memoized JSX (NOT a component function)
  // IMPORTANT: Return JSX directly, not a component function, to prevent DOM remounting
  // which would reset scroll position every time dependencies change
  const chatsListContent = useMemo(() => (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
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

        {/* Search with keyboard hint */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            className="pl-10 pr-12"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            /
          </kbd>
        </div>

        {/* Main tabs: IA | Atendente | Resolvidos - WCAG 2.1 compliant */}
        <div
          className="flex gap-1.5 p-1.5 bg-muted/40 rounded-xl border border-border/50"
          role="tablist"
          aria-label="Filtrar conversas por status"
          onKeyDown={(e) => {
            const tabs = MAIN_TABS.map(t => t.value)
            const currentIndex = tabs.indexOf(mainTab)
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault()
              const nextIndex = (currentIndex + 1) % tabs.length
              setMainTab(tabs[nextIndex])
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault()
              const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length
              setMainTab(tabs[prevIndex])
            } else if (e.key === 'Home') {
              e.preventDefault()
              setMainTab(tabs[0])
            } else if (e.key === 'End') {
              e.preventDefault()
              setMainTab(tabs[tabs.length - 1])
            }
          }}
        >
          {MAIN_TABS.map(tab => {
            const count = tabCounts[tab.value] ?? 0
            const isActive = mainTab === tab.value
            return (
              <Tooltip key={tab.value}>
                <TooltipTrigger asChild>
                  <Button
                    id={`tab-${tab.value}`}
                    variant={isActive ? "secondary" : "ghost"}
                    role="tab"
                    tabIndex={isActive ? 0 : -1}
                    aria-selected={isActive}
                    aria-controls={`tabpanel-${tab.value}`}
                    aria-label={`${tab.label}: ${count} conversas. ${tab.description}`}
                    className={cn(
                      // Base styles with smooth transitions
                      "flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 min-h-[42px] rounded-lg",
                      "transition-all duration-200 ease-out",
                      // Focus ring for keyboard navigation (WCAG 2.1)
                      "focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring",
                      // Inactive state - subtle hover
                      !isActive && "hover:bg-muted/80 text-muted-foreground hover:text-foreground",
                      // Active state styling with elevation
                      isActive && [
                        "shadow-sm bg-background",
                        tab.value === 'ia' && "ring-1 ring-purple-200 dark:ring-purple-800 text-purple-700 dark:text-purple-300",
                        tab.value === 'atendente' && "ring-1 ring-blue-200 dark:ring-blue-800 text-blue-700 dark:text-blue-300",
                        tab.value === 'resolvidos' && "ring-1 ring-green-200 dark:ring-green-800 text-green-700 dark:text-green-300",
                      ]
                    )}
                    onClick={() => setMainTab(tab.value)}
                  >
                    <tab.icon className={cn(
                      "h-4 w-4 flex-shrink-0",
                      isActive ? "" : tab.color
                    )} aria-hidden="true" />
                    <span className="text-xs sm:text-sm font-medium whitespace-nowrap">{tab.label}</span>
                    <Badge
                      variant={isActive ? "default" : "secondary"}
                      className={cn(
                        "h-5 min-w-[20px] px-1.5 text-[10px] font-semibold flex-shrink-0",
                        isActive
                          ? tab.value === 'ia' ? "bg-purple-600 text-white" :
                            tab.value === 'atendente' ? "bg-blue-600 text-white" :
                            "bg-green-600 text-white"
                          : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
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
                aria-label="Atualizar lista de conversas"
              >
                <RefreshCw className={cn("h-4 w-4", chatsFetching && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Atualizar</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Chat list - Virtualizado para performance */}
      <div
        id={`tabpanel-${mainTab}`}
        ref={chatListRef}
        className="flex-1 min-h-0 overflow-auto"
        role="listbox"
        aria-label={`Lista de conversas - ${mainTab === 'ia' ? 'IA ativa' : mainTab === 'atendente' ? 'Atendente' : 'Resolvidos'}`}
        aria-labelledby={`tab-${mainTab}`}
        tabIndex={0}
        onKeyDown={handleChatListKeyDown}
      >
        {chatsLoading ? (
          <div className="p-4 space-y-2" aria-busy="true" aria-label="Carregando conversas">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-11 w-11 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        ) : chatsError ? (
          <div className="p-4 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
            <p className="text-sm text-slate-600 dark:text-slate-300">Erro ao carregar conversas</p>
            <Button variant="link" size="sm" onClick={() => refetchChats()}>
              Tentar novamente
            </Button>
          </div>
        ) : chats.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center h-full min-h-[200px]">
            {/* Contextual empty state based on active tab and search */}
            {debouncedSearchText ? (
              // Search found no results
              <>
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Search className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground mb-1">Nenhum resultado encontrado</p>
                <p className="text-sm text-muted-foreground max-w-[240px]">
                  Nenhuma conversa corresponde a "{debouncedSearchText}"
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  onClick={() => setSearchText('')}
                >
                  Limpar busca
                </Button>
              </>
            ) : mainTab === 'ia' ? (
              // No conversations in IA tab
              <>
                <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-4 mb-4">
                  <Bot className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                </div>
                <p className="font-medium text-foreground mb-1">Nenhuma conversa com IA ativa</p>
                <p className="text-sm text-muted-foreground max-w-[280px]">
                  Conversas atendidas automaticamente pela IA aparecerão aqui
                </p>
              </>
            ) : mainTab === 'atendente' ? (
              // No conversations in Atendente tab
              <>
                <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-4 mb-4">
                  <User className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="font-medium text-foreground mb-1">Nenhuma conversa aguardando</p>
                <p className="text-sm text-muted-foreground max-w-[280px]">
                  Conversas que precisam de atendimento humano aparecerão aqui
                </p>
              </>
            ) : mainTab === 'resolvidos' ? (
              // No conversations in Resolvidos tab
              <>
                <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4 mb-4">
                  <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <p className="font-medium text-foreground mb-1">Nenhuma conversa resolvida</p>
                <p className="text-sm text-muted-foreground max-w-[280px]">
                  Conversas finalizadas aparecerão aqui para consulta
                </p>
              </>
            ) : (
              // Default empty state
              <>
                <div className="rounded-full bg-muted p-4 mb-4">
                  <MessageCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground mb-1">Nenhuma conversa encontrada</p>
                <p className="text-sm text-muted-foreground max-w-[280px] mb-4">
                  As conversas aparecerão aqui quando você receber mensagens
                </p>
              </>
            )}
            {/* Sync button - only show when not searching and has instances */}
            {!debouncedSearchText && instanceIdsToFetch.length > 0 && (
              <div className="space-y-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    instanceIdsToFetch.forEach((instanceId: string) => {
                      syncChatsMutation.mutate(instanceId)
                    })
                  }}
                  disabled={syncChatsMutation.isPending}
                  className="gap-2"
                >
                  {syncChatsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Importar chats existentes
                </Button>
                <p className="text-xs text-muted-foreground">
                  Clique para importar conversas existentes do WhatsApp
                </p>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              height: `${chatListVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {chatListVirtualizer.getVirtualItems().map((virtualItem) => {
              const chat = chats[virtualItem.index] as UAZChat
              if (!chat) return null // Proteção contra índice inválido

              // Determinar nome para exibição (usar safeRenderContent para evitar objetos)
              // Para grupos, se o nome parece ser um ID (sem espaços, parece hash), mostrar "Grupo"
              const rawName = safeRenderContent(chat.wa_name)
              const looksLikeId = rawName && /^[a-z0-9]{10,}$/i.test(rawName) && !rawName.includes(' ')
              const isGroup = chat.wa_isGroup === true || String(chat.wa_isGroup) === 'true'
              const displayName = isGroup && (!rawName || looksLikeId)
                ? 'Grupo'
                : rawName || 'Contato'
              // Usar helper functions para categorização
              const chatIsAIActive = isAIActive(chat)
              const chatIsResolved = isResolved(chat)

              const isSelected = selectedChatId === chat.id || selectedChatId === chat.wa_chatid
              const isFocused = focusedChatIndex === virtualItem.index

              return (
                <button
                  key={`${chat.instanceId}-${chat.wa_chatid}`}
                  onClick={() => handleSelectChat(chat)}
                  role="option"
                  aria-selected={isSelected}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className={cn(
                    "w-full py-2.5 px-3 text-left transition-all duration-150 hover:bg-muted/60 border-b border-border/50 overflow-hidden",
                    isSelected && "bg-muted/80 border-l-2 border-l-primary",
                    isFocused && "ring-2 ring-primary ring-inset"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <LazyAvatar
                      src={chat.wa_profilePicUrl}
                      phoneNumber={chat.wa_chatid}
                      instanceId={chat.instanceId}
                      name={displayName}
                      isGroup={chat.wa_isGroup}
                      size="md"
                      className="flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
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
                          <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap flex-shrink-0">
                            {formatTimestamp(chat.wa_lastMsgTimestamp)}
                          </span>
                        )}
                      </div>

                      {/* Número de telefone ou indicador de grupo */}
                      {!chat.wa_isGroup && chat.wa_phoneNumber && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5 truncate">
                          {safeRenderContent(chat.wa_phoneNumber)}
                        </p>
                      )}
                      {chat.wa_isGroup && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5 flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Grupo
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-600 dark:text-slate-400 truncate flex-1">
                          {safeRenderContent(chat.wa_lastMsgBody) || 'Sem mensagens'}
                        </p>
                        {toNumber(chat.wa_unreadCount) > 0 && (
                          <Badge className="h-5 min-w-5 flex items-center justify-center text-xs flex-shrink-0">
                            {formatCount(chat.wa_unreadCount)}
                          </Badge>
                        )}
                      </div>

                      {/* Show instance name when viewing all */}
                      {selectedInstanceFilter === 'all' && chat.instanceName && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 truncate">
                          <Smartphone className="h-3 w-3 flex-shrink-0" />
                          {safeRenderContent(chat.instanceName)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}

            {/* Loading indicator para infinite scroll */}
            {isFetchingMoreChats && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${chatListVirtualizer.getTotalSize()}px)`,
                }}
                className="flex items-center justify-center p-4 gap-2"
              >
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Carregando mais...</span>
              </div>
            )}

            {/* Indicator de "mais conversas disponíveis" */}
            {hasMoreChats && !isFetchingMoreChats && chats.length >= CHATS_PER_PAGE && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${chatListVirtualizer.getTotalSize()}px)`,
                }}
                className="flex items-center justify-center p-3"
              >
                <span className="text-xs text-muted-foreground">
                  Role para carregar mais conversas
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  ), [
    chats,
    chatsLoading,
    chatsError,
    chatsFetching,
    isFetchingMoreChats,
    hasMoreChats,
    mainTab,
    chatTypeFilter,
    searchText,
    selectedInstanceFilter,
    instances,
    selectedChatId,
    focusedChatIndex,
    tabCounts,
    instancesLoading,
    syncChatsMutation.isPending,
    // Callbacks - must be included to avoid stale closures
    handleSelectChat,
    handleManualRefresh,
    handleChatListKeyDown,
    refetchChats,
    setMainTab,
    setChatTypeFilter,
    setSearchText,
    setSelectedInstanceFilter,
  ])

  // Messages Area Content - Memoized JSX (NOT a component function)
  // IMPORTANT: Return JSX directly, not a component function, to prevent DOM remounting
  // which would reset scroll position every time dependencies change
  const messagesAreaContent = useMemo(() => (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
      role="region"
      aria-label={selectedChat ? `Conversa com ${safeRenderContent(selectedChat.wa_name) || 'Contato'}` : 'Selecione uma conversa'}
    >
      {selectedChat ? (
        <>
          {/* Chat Header */}
          <header className="p-4 border-b flex items-center justify-between bg-card flex-shrink-0" role="banner">
            <div className="flex items-center gap-3">
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsChatsDrawerOpen(true)}
                  className="mr-1"
                  aria-label="Voltar para lista de conversas"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}

              <LazyAvatar
                src={selectedChat.wa_profilePicUrl}
                phoneNumber={selectedChat.wa_chatid}
                instanceId={selectedChat.instanceId}
                name={safeRenderContent(selectedChat.wa_name)}
                isGroup={selectedChat.wa_isGroup}
                size="md"
              />

              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {safeRenderContent(selectedChat.wa_name) || 'Contato'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                  {selectedChat.wa_isGroup ? (
                    <>
                      <Users className="h-3 w-3 flex-shrink-0" />
                      <span>Grupo</span>
                    </>
                  ) : selectedChat.wa_phoneNumber ? (
                    <span>{safeRenderContent(selectedChat.wa_phoneNumber)}</span>
                  ) : null}
                  {selectedInstance && (
                    <>
                      <span className="mx-1">•</span>
                      <Smartphone className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{safeRenderContent(selectedInstance.name)}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Session status badge (IA/Humano/Resolvido) */}
              {selectedChat && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={cn(
                        "gap-1 mr-2 text-xs",
                        isResolved(selectedChat) && "text-green-600 border-green-200 bg-green-50",
                        isAIActive(selectedChat) && "text-purple-600 border-purple-200 bg-purple-50",
                        isHumanAttending(selectedChat) && "text-blue-600 border-blue-200 bg-blue-50"
                      )}
                    >
                      {isResolved(selectedChat) ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          Resolvido
                        </>
                      ) : isAIActive(selectedChat) ? (
                        <>
                          <Bot className="h-3 w-3" />
                          IA ativa
                        </>
                      ) : (
                        <>
                          <User className="h-3 w-3" />
                          Atendente
                        </>
                      )}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isResolved(selectedChat)
                      ? 'Conversa resolvida/arquivada'
                      : isAIActive(selectedChat)
                      ? 'Atendimento automatizado por IA'
                      : 'Atendimento por humano'}
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Search button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showMessageSearch ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowMessageSearch(!showMessageSearch)}
                    aria-label="Buscar na conversa"
                    aria-pressed={showMessageSearch}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Buscar na conversa</TooltipContent>
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
                  <Button variant="ghost" size="icon" aria-label="Mais opções">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowArchiveDialog(true)}>
                    <Archive className="h-4 w-4 mr-2" />
                    Arquivar conversa
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setPendingBlockAction({ chatId: selectedChat.wa_chatid, block: true })
                      setShowBlockDialog(true)
                    }}
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
                      setShowDeleteDialog(true)
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
          </header>

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
                  <span className="text-sm text-muted-foreground whitespace-nowrap" aria-live="polite">
                    {currentSearchIndex + 1} de {messageSearchResults.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={goToPrevResult}
                    disabled={messageSearchResults.length <= 1}
                    aria-label="Resultado anterior"
                  >
                    <ArrowLeft className="h-4 w-4 rotate-90" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={goToNextResult}
                    disabled={messageSearchResults.length <= 1}
                    aria-label="Próximo resultado"
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
                aria-label="Fechar busca"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Messages */}
          <ScrollArea
            id="messages-area"
            className="flex-1 min-h-0 p-4 relative"
            ref={messagesContainerRef}
            onScrollCapture={handleMessagesScroll}
            role="log"
            aria-label="Histórico de mensagens"
            aria-live="polite"
            aria-relevant="additions"
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
              <div className="space-y-3" aria-busy="true" aria-label="Carregando mensagens">
                {[...Array(5)].map((_, i) => {
                  const isOutbound = i % 2 === 1
                  const widthClass = i === 0 ? 'w-2/3' : i === 2 ? 'w-1/2' : i === 4 ? 'w-3/5' : 'w-2/5'
                  return (
                    <div key={i} className={cn("flex", isOutbound && "justify-end")}>
                      <div className={cn(
                        "space-y-1.5",
                        widthClass,
                        isOutbound ? "items-end" : "items-start"
                      )}>
                        <Skeleton className={cn(
                          "h-12 rounded-2xl",
                          isOutbound ? "rounded-br-sm bg-emerald-200/30 dark:bg-emerald-900/30" : "rounded-bl-sm"
                        )} />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground mb-1">Nenhuma mensagem ainda</p>
                <p className="text-sm text-muted-foreground text-center max-w-[240px]">
                  Envie uma mensagem para iniciar a conversa com este contato
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Messages already sorted ascending by createdAt (oldest to newest) */}
                {messages.map((message: DBMessage | OptimisticMessage, msgIndex: number) => {
                  const isOptimistic = message.id.startsWith('optimistic-')
                  const isFailed = message.status === 'failed'
                  const isPending = message.status === 'pending'
                  const isSearchMatch = messageSearchResults.includes(msgIndex)
                  const isCurrentMatch = messageSearchResults[currentSearchIndex] === msgIndex

                  // Check if we need a date separator
                  const previousMessage = msgIndex > 0 ? messages[msgIndex - 1] : null
                  const showDateSeparator = shouldShowDateSeparator(
                    message.createdAt,
                    previousMessage?.createdAt
                  )
                  const dateSeparatorLabel = showDateSeparator ? formatDateSeparator(message.createdAt) : null

                  // Highlight search matches in content (after normalizing)
                  const highlightContent = (content: unknown) => {
                    // Ensure content is a string - handle objects/arrays from template/interactive messages
                    let textContent: string
                    if (typeof content === 'string') {
                      textContent = content
                    } else if (content === null || content === undefined) {
                      textContent = ''
                    } else if (typeof content === 'object') {
                      // Try to extract text from object (template messages, etc)
                      const obj = content as any
                      textContent = obj?.text ?? obj?.body ?? obj?.caption ?? JSON.stringify(content)
                    } else {
                      textContent = String(content)
                    }

                    // Primeiro normaliza o texto para remover caracteres problemáticos
                    const normalizedContent = normalizeTextContent(textContent)

                    if (!messageSearchText || !isSearchMatch) return normalizedContent
                    const regex = new RegExp(`(${messageSearchText})`, 'gi')
                    const parts = normalizedContent.split(regex)
                    return parts.map((part, i) =>
                      regex.test(part) ? (
                        <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 rounded px-0.5">
                          {part}
                        </mark>
                      ) : part
                    )
                  }

                  return (
                    <div key={message.id}>
                      {/* Date separator */}
                      {dateSeparatorLabel && (
                        <div className="flex items-center justify-center my-4">
                          <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/60 rounded-full">
                            <span className="text-xs font-medium text-muted-foreground capitalize">
                              {dateSeparatorLabel}
                            </span>
                          </div>
                        </div>
                      )}

                      <div
                        data-message-index={msgIndex}
                        className={cn(
                          "flex transition-all duration-200",
                          message.direction === 'OUTBOUND' ? "justify-end" : "justify-start",
                          isCurrentMatch && "scale-[1.02]"
                        )}
                        role={isFailed ? "alert" : undefined}
                        aria-label={isFailed ? "Falha ao enviar mensagem" : undefined}
                      >
                        <div className={cn(
                          "flex flex-col gap-0.5",
                          message.direction === 'OUTBOUND' ? "items-end" : "items-start"
                        )}>
                          {/* Failed message indicator badge */}
                          {isFailed && (
                            <div className="flex items-center gap-1 text-destructive text-xs font-medium mb-1">
                              <AlertCircle className="h-3.5 w-3.5" />
                              <span>Falha no envio</span>
                            </div>
                          )}
                          <div
                            className={cn(
                              "max-w-[80%] min-w-[80px] rounded-2xl px-3 py-2 transition-all relative",
                              message.direction === 'OUTBOUND'
                                ? "bg-emerald-500 dark:bg-emerald-600 text-white rounded-br-sm"
                                : "bg-white dark:bg-slate-800 text-foreground rounded-bl-sm shadow-sm border border-slate-100 dark:border-slate-700",
                              // Failed messages get error styling
                              isFailed && "bg-destructive/10 border-2 border-destructive text-destructive-foreground",
                            // Search highlight
                            isCurrentMatch && "ring-2 ring-yellow-400 ring-offset-2"
                          )}
                        >
                          {/* Media content */}
                          {'mediaUrl' in message && message.mediaUrl && (
                            <div className="mb-2">
                              {/* Image with skeleton loading */}
                              {message.type === 'image' && (
                                <div className="relative rounded-lg overflow-hidden bg-muted animate-pulse min-h-[100px] min-w-[100px]">
                                  <img
                                    src={message.mediaUrl}
                                    alt={`Imagem ${message.direction === 'OUTBOUND' ? 'enviada' : 'recebida'} às ${safeFormatDate(message.createdAt, "HH:mm")}`}
                                    className="rounded-lg max-w-full cursor-pointer hover:opacity-90 transition-all duration-300"
                                    loading="lazy"
                                    onLoad={(e) => {
                                      const parent = e.currentTarget.parentElement
                                      if (parent) {
                                        parent.classList.remove('animate-pulse', 'bg-muted', 'min-h-[100px]', 'min-w-[100px]')
                                      }
                                    }}
                                    onError={(e) => {
                                      const parent = e.currentTarget.parentElement
                                      if (parent) {
                                        parent.classList.remove('animate-pulse')
                                        parent.classList.add('bg-destructive/10')
                                      }
                                    }}
                                  />
                                </div>
                              )}
                              {/* Video */}
                              {message.type === 'video' && (
                                <video
                                  src={message.mediaUrl}
                                  controls
                                  preload="metadata"
                                  className="rounded-lg max-w-full max-h-64"
                                  aria-label={`Vídeo ${message.direction === 'OUTBOUND' ? 'enviado' : 'recebido'} às ${safeFormatDate(message.createdAt, "HH:mm")}`}
                                >
                                  Seu navegador não suporta vídeo.
                                </video>
                              )}
                              {/* Audio & Voice (PTT) - Redesigned UI/UX */}
                              {(message.type === 'audio' || message.type === 'voice' || message.type === 'ptt') && (() => {
                                const audioUrl = loadedAudioUrls.get(message.id) || message.mediaUrl
                                const isLoading = loadingAudioIds.has(message.id)
                                const isTranscribing = transcribingIds.has(message.id)
                                const existingTranscription = transcriptions.get(message.id) || ('transcription' in message ? message.transcription : null)

                                return (
                                  <div className="flex flex-col gap-2 min-w-[280px] max-w-[320px]" role="group" aria-label="Mensagem de áudio">
                                    {/* Audio Player Container */}
                                    <div className={cn(
                                      "flex items-center gap-3 p-3 rounded-xl",
                                      message.direction === 'OUTBOUND'
                                        ? "bg-emerald-600/20"
                                        : "bg-slate-200/50 dark:bg-slate-700/50"
                                    )}>
                                      {/* Mic Icon */}
                                      <div className={cn(
                                        "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
                                        message.direction === 'OUTBOUND'
                                          ? "bg-emerald-500/30"
                                          : "bg-slate-300/50 dark:bg-slate-600/50"
                                      )}>
                                        <Mic className="h-5 w-5 text-current" aria-hidden="true" />
                                      </div>

                                      {/* Audio Content */}
                                      <div className="flex-1 min-w-0">
                                        {audioUrl ? (
                                          <audio
                                            src={audioUrl}
                                            controls
                                            preload="metadata"
                                            className="w-full h-8"
                                            style={{
                                              filter: 'hue-rotate(0deg)',
                                              maxWidth: '200px'
                                            }}
                                            aria-label={`Áudio ${message.direction === 'OUTBOUND' ? 'enviado' : 'recebido'}`}
                                          >
                                            Seu navegador não suporta áudio.
                                          </audio>
                                        ) : isLoading ? (
                                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Carregando...</span>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => handleLoadAudio(message.id)}
                                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                                          >
                                            <Play className="h-4 w-4" />
                                            <span>Carregar áudio</span>
                                          </button>
                                        )}
                                      </div>

                                      {/* Action Buttons */}
                                      {audioUrl && (
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          {/* Transcribe Button */}
                                          <button
                                            onClick={() => handleTranscribeAudio(message.id)}
                                            disabled={isTranscribing || !!existingTranscription}
                                            className={cn(
                                              "p-2 rounded-lg transition-all",
                                              existingTranscription
                                                ? "text-emerald-500 bg-emerald-500/10"
                                                : isTranscribing
                                                  ? "text-muted-foreground"
                                                  : "hover:bg-black/10 dark:hover:bg-white/10"
                                            )}
                                            title={existingTranscription ? "Transcrito" : isTranscribing ? "Transcrevendo..." : "Transcrever"}
                                            aria-label="Transcrever áudio"
                                          >
                                            {isTranscribing ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <Languages className="h-4 w-4" />
                                            )}
                                          </button>

                                          {/* Download Button */}
                                          <a
                                            href={audioUrl}
                                            download
                                            className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                                            title="Baixar"
                                            aria-label="Baixar áudio"
                                          >
                                            <Download className="h-4 w-4" />
                                          </a>
                                        </div>
                                      )}
                                    </div>

                                    {/* Transcription Display */}
                                    {existingTranscription && (
                                      <div className={cn(
                                        "text-xs px-3 py-2 rounded-lg border-l-2",
                                        message.direction === 'OUTBOUND'
                                          ? "bg-emerald-500/10 border-emerald-500 text-emerald-800 dark:text-emerald-200"
                                          : "bg-slate-100 dark:bg-slate-800 border-slate-400 text-slate-700 dark:text-slate-300"
                                      )}>
                                        <div className="flex items-start gap-2">
                                          <Languages className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 opacity-60" />
                                          <p className="leading-relaxed">{existingTranscription}</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}
                              {/* Document - with inline PDF preview */}
                              {message.type === 'document' && (() => {
                                const fileName = safeRenderContent(message.fileName) || 'Documento'
                                const isPdf = message.mimeType?.includes('pdf') ||
                                             fileName.toLowerCase().endsWith('.pdf') ||
                                             message.mediaUrl?.includes('application/pdf')

                                return (
                                  <div className="flex flex-col gap-2">
                                    {/* PDF Preview - Clickable to open fullscreen */}
                                    {isPdf && message.mediaUrl && (
                                      <div
                                        className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white cursor-pointer group"
                                        onClick={() => handleOpenPdfModal(message.mediaUrl!, fileName)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            handleOpenPdfModal(message.mediaUrl!, fileName)
                                          }
                                        }}
                                        aria-label="Clique para abrir PDF em tela cheia"
                                      >
                                        <embed
                                          src={message.mediaUrl}
                                          type="application/pdf"
                                          className="w-full h-[300px] min-w-[250px] pointer-events-none"
                                          title={fileName}
                                        />
                                        {/* Fullscreen overlay on hover */}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                          <div className="bg-white/90 dark:bg-slate-800/90 rounded-full p-3 shadow-lg">
                                            <Maximize2 className="h-6 w-6 text-slate-700 dark:text-slate-200" />
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* Document info with actions */}
                                    <div className="flex items-center gap-2 p-2 bg-background/20 rounded">
                                      <FileText className="h-6 w-6 flex-shrink-0 text-red-500" aria-hidden="true" />
                                      <span className="text-sm truncate flex-1">{fileName}</span>

                                      {/* Fullscreen button for PDF */}
                                      {isPdf && message.mediaUrl && (
                                        <button
                                          onClick={() => handleOpenPdfModal(message.mediaUrl!, fileName)}
                                          className="p-1.5 hover:bg-background/30 rounded transition-colors"
                                          title="Abrir em tela cheia"
                                          aria-label="Abrir PDF em tela cheia"
                                        >
                                          <Maximize2 className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                      )}

                                      {/* Download button */}
                                      <a
                                        href={message.mediaUrl}
                                        download={fileName}
                                        className="p-1.5 hover:bg-background/30 rounded transition-colors"
                                        title="Baixar documento"
                                        aria-label="Baixar documento"
                                      >
                                        <Download className="h-4 w-4" aria-hidden="true" />
                                      </a>

                                      {/* Open in new tab */}
                                      <a
                                        href={message.mediaUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 hover:bg-background/30 rounded transition-colors"
                                        title="Abrir em nova aba"
                                        aria-label="Abrir documento em nova aba"
                                      >
                                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                      </a>
                                    </div>
                                  </div>
                                )
                              })()}
                              {/* Sticker (treated as image) */}
                              {message.type === 'sticker' && (
                                <img
                                  src={message.mediaUrl}
                                  alt={`Sticker ${message.direction === 'OUTBOUND' ? 'enviado' : 'recebido'}`}
                                  className="max-w-32 max-h-32"
                                  loading="lazy"
                                />
                              )}
                            </div>
                          )}

                          {/* Audio sem mediaUrl - carrega automaticamente via API */}
                          {'mediaUrl' in message && !message.mediaUrl && (message.type === 'audio' || message.type === 'voice' || message.type === 'ptt') && (() => {
                            const audioUrl = loadedAudioUrls.get(message.id)
                            const isLoading = loadingAudioIds.has(message.id)
                            const hasFailed = failedAudioIds.has(message.id)
                            const isTranscribing = transcribingIds.has(message.id)
                            const existingTranscription = transcriptions.get(message.id) || ('transcription' in message ? message.transcription : null)

                            return (
                              <div className="flex flex-col gap-2 min-w-[280px] max-w-[320px]" role="group" aria-label="Mensagem de áudio">
                                {/* Audio Player Container */}
                                <div className={cn(
                                  "flex items-center gap-3 p-3 rounded-xl",
                                  message.direction === 'OUTBOUND'
                                    ? "bg-emerald-600/20"
                                    : "bg-slate-200/50 dark:bg-slate-700/50"
                                )}>
                                  {/* Mic Icon */}
                                  <div className={cn(
                                    "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
                                    hasFailed
                                      ? "bg-red-500/20"
                                      : message.direction === 'OUTBOUND'
                                        ? "bg-emerald-500/30"
                                        : "bg-slate-300/50 dark:bg-slate-600/50"
                                  )}>
                                    {hasFailed ? (
                                      <VolumeX className="h-5 w-5 text-red-500" aria-hidden="true" />
                                    ) : (
                                      <Mic className="h-5 w-5 text-current" aria-hidden="true" />
                                    )}
                                  </div>

                                  {/* Audio Content */}
                                  <div className="flex-1 min-w-0">
                                    {audioUrl ? (
                                      <audio
                                        src={audioUrl}
                                        controls
                                        preload="metadata"
                                        className="w-full h-8"
                                        style={{ maxWidth: '200px' }}
                                        aria-label={`Áudio ${message.direction === 'OUTBOUND' ? 'enviado' : 'recebido'}`}
                                      >
                                        Seu navegador não suporta áudio.
                                      </audio>
                                    ) : hasFailed ? (
                                      <div className="flex flex-col gap-1">
                                        <span className="text-sm text-red-500 dark:text-red-400">Áudio indisponível</span>
                                        <button
                                          onClick={() => {
                                            // Remove from failed and retry
                                            setFailedAudioIds(prev => {
                                              const next = new Set(prev)
                                              next.delete(message.id)
                                              return next
                                            })
                                            handleLoadAudio(message.id)
                                          }}
                                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                        >
                                          <RefreshCw className="h-3 w-3" />
                                          Tentar novamente
                                        </button>
                                      </div>
                                    ) : isLoading ? (
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>Carregando...</span>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => handleLoadAudio(message.id)}
                                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                                      >
                                        <Play className="h-4 w-4" />
                                        <span>Carregar áudio</span>
                                      </button>
                                    )}
                                  </div>

                                  {/* Action Buttons */}
                                  {audioUrl && (
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {/* Transcribe Button */}
                                      <button
                                        onClick={() => handleTranscribeAudio(message.id)}
                                        disabled={isTranscribing || !!existingTranscription}
                                        className={cn(
                                          "p-2 rounded-lg transition-all",
                                          existingTranscription
                                            ? "text-emerald-500 bg-emerald-500/10"
                                            : isTranscribing
                                              ? "text-muted-foreground"
                                              : "hover:bg-black/10 dark:hover:bg-white/10"
                                        )}
                                        title={existingTranscription ? "Transcrito" : isTranscribing ? "Transcrevendo..." : "Transcrever"}
                                        aria-label="Transcrever áudio"
                                      >
                                        {isTranscribing ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Languages className="h-4 w-4" />
                                        )}
                                      </button>

                                      {/* Download Button */}
                                      <a
                                        href={audioUrl}
                                        download
                                        className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                                        title="Baixar"
                                        aria-label="Baixar áudio"
                                      >
                                        <Download className="h-4 w-4" />
                                      </a>
                                    </div>
                                  )}
                                </div>

                                {/* Transcription Display */}
                                {existingTranscription && (
                                  <div className={cn(
                                    "text-xs px-3 py-2 rounded-lg border-l-2",
                                    message.direction === 'OUTBOUND'
                                      ? "bg-emerald-500/10 border-emerald-500 text-emerald-800 dark:text-emerald-200"
                                      : "bg-slate-100 dark:bg-slate-800 border-slate-400 text-slate-700 dark:text-slate-300"
                                  )}>
                                    <div className="flex items-start gap-2">
                                      <Languages className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 opacity-60" />
                                      <p className="leading-relaxed">{existingTranscription}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })()}

                          {/* Text content with search highlighting */}
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {highlightContent(message.content)}
                          </p>

                          {/* Timestamp and status */}
                          <div className={cn(
                            "flex items-center justify-end gap-1 mt-1",
                            message.direction === 'OUTBOUND'
                              ? "text-emerald-100"
                              : "text-slate-600 dark:text-slate-300"
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
                                    // Use stored sessionId from optimistic message for correct retry
                                    const optMsg = message as OptimisticMessage
                                    if (optMsg.sessionId) {
                                      retryMessageMutation.mutate({
                                        tempId: message.id,
                                        sessionId: optMsg.sessionId,
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
                                  className="h-6 px-2 text-xs text-slate-500 dark:text-slate-400 hover:text-destructive"
                                  onClick={() => deleteOptimisticMessage(message.id)}
                                  aria-label="Descartar mensagem"
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
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Indicador de novas mensagens quando usuário está lendo histórico */}
            {hasUnseenMessages && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
                <Button
                  onClick={scrollToBottom}
                  size="sm"
                  className="rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground gap-1 px-4"
                >
                  <ChevronDown className="h-4 w-4" />
                  Novas mensagens
                </Button>
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="p-4 border-t space-y-3 bg-card flex-shrink-0">
            {/* File Preview */}
            {selectedFile && (
              <div
                className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                role="region"
                aria-label={`Arquivo selecionado: ${selectedFile.name}`}
              >
                {filePreview ? (
                  <img src={filePreview} alt={`Preview do arquivo ${selectedFile?.name || 'selecionado'}`} className="h-16 w-16 object-cover rounded" />
                ) : (
                  <div className="h-16 w-16 flex items-center justify-center bg-background rounded" aria-hidden="true">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={handleCancelFile} disabled={isUploading} aria-label="Remover arquivo selecionado">
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
              aria-label="Selecionar arquivo para enviar"
              aria-hidden="true"
            />

            {/* Message input bar */}
            <div className="flex items-center gap-2">
              {/* Emoji picker */}
              <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Abrir seletor de emojis">
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
                  <Button variant="ghost" size="icon" aria-label="Abrir respostas rápidas">
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
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      Digite / no chat para ativar atalhos
                    </p>
                  </div>
                  <ScrollArea className="max-h-64">
                    {quickRepliesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    ) : quickReplies.length === 0 ? (
                      <div className="py-8 text-center text-slate-600 dark:text-slate-300 text-sm">
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
                              <span className="font-medium text-sm">{safeRenderContent(qr.title)}</span>
                              <Badge variant="outline" className="text-xs font-mono">
                                {safeRenderContent(qr.shortcut)}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                              {safeRenderContent(qr.content)}
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
                    aria-label="Anexar arquivo"
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Anexar arquivo (max 16MB)</TooltipContent>
              </Tooltip>

              {/* Message input com sugestões de IA e detecção de quick replies */}
              <div id="message-input" className="relative flex-1">
                <AIMessageInput
                  value={messageText}
                  onChange={handleMessageChange}
                  onSend={() => selectedFile ? handleSendFile() : handleSendMessage()}
                  placeholder={selectedFile ? "Legenda (opcional)..." : "Digite / para atalhos ou mensagem..."}
                  disabled={isUploading || sendMessageMutation.isPending}
                  aiEnabled={!messageText.startsWith('/') && !selectedFile} // Desabilitar IA quando usando quick replies ou com arquivo
                  conversationContext={messages.slice(-5).map((m: any) => safeRenderContent(m.content)).filter(Boolean)}
                  className="w-full"
                />
                {/* Quick reply suggestions dropdown - sobrepõe sugestões de IA */}
                {showQuickReplies && quickReplies.length > 0 && messageText.startsWith('/') && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto z-50">
                    {quickReplies.slice(0, 5).map((qr: any, idx: number) => (
                      <button
                        key={qr.id}
                        onClick={() => handleSelectQuickReply(qr)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between",
                          idx === 0 && "bg-muted/50"
                        )}
                      >
                        <span className="truncate">{safeRenderContent(qr.title)}</span>
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 ml-2">{safeRenderContent(qr.shortcut)}</span>
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
                  aria-label={isUploading || sendMessageMutation.isPending ? "Enviando..." : "Enviar mensagem"}
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
            <MessageSquare className="h-16 w-16 mx-auto text-slate-400 dark:text-slate-500 mb-4" />
            <h3 className="text-lg font-medium mb-1">Selecione uma conversa</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Escolha uma conversa para comecar a enviar mensagens
            </p>
          </div>
        </div>
      )}
    </div>
  ), [
    selectedChat,
    selectedInstance,
    messages,
    messagesLoading,
    messagesFetching,
    isFetchingNextPage,
    hasNextPage,
    messageText,
    selectedFile,
    filePreview,
    isUploading,
    sseConnected,
    showMessageSearch,
    messageSearchText,
    messageSearchResults,
    currentSearchIndex,
    showQuickReplies,
    quickReplies,
    quickRepliesLoading,
    quickReplySearch,
    hasUnseenMessages,
    optimisticMessages,
    // Callbacks - must be included to avoid stale closures
    handleMessageChange,
    handleSendMessage,
    handleSendFile,
    handleSelectQuickReply,
    handleMessagesScroll,
    scrollToBottom,
    fetchNextPage,
  ])

  // ==================== MAIN RENDER ====================
  // Conditional rendering for loading, error, and empty states (instead of early returns)
  if (isLoading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Carregando conversas...</p>
        </div>
      </div>
    )
  }

  if (hasError) {
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

  if (hasNoInstances) {
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

  return (
    <TooltipProvider>
      {/* Skip links para acessibilidade */}
      <a
        href="#messages-area"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-primary focus:text-primary-foreground focus:rounded"
      >
        Pular para mensagens
      </a>
      <a
        href="#message-input"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-primary focus:text-primary-foreground focus:rounded focus:top-8"
      >
        Pular para campo de mensagem
      </a>

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
                  {chatsListContent}
                </div>
              </SheetContent>
            </Sheet>

            {/* Main messages area */}
            <Card className="flex-1 h-full min-h-0 overflow-hidden py-0 gap-0">
              <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
                {selectedChat ? (
                  messagesAreaContent
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
            {/* py-0 remove padding default do Card para permitir scroll correto */}
            <Card className="w-[480px] flex-shrink-0 h-full overflow-hidden py-0 gap-0">
              <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
                {chatsListContent}
              </CardContent>
            </Card>

            {/* Column 2: Messages */}
            <Card className="flex-1 min-w-0 h-full overflow-hidden py-0 gap-0">
              <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
                {messagesAreaContent}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Diálogo de confirmação para arquivar */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar conversa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja arquivar esta conversa? Ela será movida para os arquivados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedChat?.wa_chatid) {
                  archiveChatMutation.mutate(selectedChat.wa_chatid)
                }
                setShowArchiveDialog(false)
              }}
            >
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de confirmação para bloquear */}
      <AlertDialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bloquear contato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja bloquear este contato? Você não receberá mais mensagens dele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingBlockAction(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingBlockAction) {
                  blockContactMutation.mutate(pendingBlockAction)
                }
                setPendingBlockAction(null)
                setShowBlockDialog(false)
              }}
            >
              Bloquear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de confirmação para apagar */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar conversa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja apagar esta conversa? Esta ação não pode ser desfeita e todas as mensagens serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (selectedChat?.id) {
                  deleteSessionMutation.mutate(selectedChat.id)
                }
                setShowDeleteDialog(false)
              }}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PDF Fullscreen Modal */}
      <Dialog open={pdfModalOpen} onOpenChange={(open) => !open && handleClosePdfModal()}>
        <DialogContent
          className="max-w-[95vw] max-h-[95vh] w-full h-full p-0 gap-0"
          showCloseButton={false}
        >
          <DialogHeader className="p-4 border-b flex-row items-center justify-between space-y-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-red-500" />
              <span className="truncate max-w-[300px] sm:max-w-[500px]">{pdfModalFileName}</span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              {/* Zoom controls */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <button
                  onClick={() => setPdfZoom(prev => Math.max(25, prev - 25))}
                  className="p-1.5 hover:bg-background rounded transition-colors disabled:opacity-50"
                  disabled={pdfZoom <= 25}
                  title="Diminuir zoom"
                  aria-label="Diminuir zoom"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium min-w-[50px] text-center">{pdfZoom}%</span>
                <button
                  onClick={() => setPdfZoom(prev => Math.min(200, prev + 25))}
                  className="p-1.5 hover:bg-background rounded transition-colors disabled:opacity-50"
                  disabled={pdfZoom >= 200}
                  title="Aumentar zoom"
                  aria-label="Aumentar zoom"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPdfZoom(100)}
                  className="p-1.5 hover:bg-background rounded transition-colors"
                  title="Resetar zoom"
                  aria-label="Resetar zoom para 100%"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
              </div>

              {/* External actions */}
              {pdfModalUrl && (
                <>
                  <a
                    href={pdfModalUrl}
                    download={pdfModalFileName}
                    className="p-2 hover:bg-muted rounded transition-colors"
                    title="Baixar PDF"
                    aria-label="Baixar PDF"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <a
                    href={pdfModalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-muted rounded transition-colors"
                    title="Abrir em nova aba"
                    aria-label="Abrir PDF em nova aba"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </>
              )}

              {/* Close button */}
              <button
                onClick={handleClosePdfModal}
                className="p-2 hover:bg-muted rounded transition-colors"
                title="Fechar"
                aria-label="Fechar visualizador de PDF"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </DialogHeader>

          {/* PDF Content */}
          <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900 p-4">
            <div
              className="flex items-center justify-center min-h-full"
              style={{ transform: `scale(${pdfZoom / 100})`, transformOrigin: 'top center' }}
            >
              {pdfModalUrl && (
                <embed
                  src={pdfModalUrl}
                  type="application/pdf"
                  className="w-full bg-white shadow-lg rounded"
                  style={{ height: 'calc(90vh - 80px)', minWidth: '600px' }}
                  title={pdfModalFileName}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
