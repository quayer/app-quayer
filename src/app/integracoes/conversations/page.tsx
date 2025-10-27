'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
} from 'lucide-react'
import { api } from '@/igniter.client'
import { useAuth } from '@/lib/auth/auth-provider'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Chat, Message } from '@/features/messages'
// import { motion, AnimatePresence } from 'framer-motion'

export default function ConversationsPage() {
  const { user } = useAuth()
  const [isHydrated, setIsHydrated] = useState(false)

  // Estados
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')
  const [searchText, setSearchText] = useState('')

  // Estados para upload de mídia
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // Estados para mobile drawers
  const [isChatsDrawerOpen, setIsChatsDrawerOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Ref para auto-scroll e input de arquivo
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIsHydrated(true)

    // Detectar mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024) // lg breakpoint
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Auto-scroll para última mensagem
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Buscar instâncias
  const { data: instancesData, isLoading: instancesLoading } = api.instances.list.useQuery()

  // Buscar conversas da instância selecionada
  const { data: chatsData, isLoading: chatsLoading } = api.chats.list.useQuery(
    { instanceId: selectedInstanceId!, search: searchText },
    { enabled: !!selectedInstanceId }
  )

  // Buscar mensagens do chat selecionado
  const { data: messagesData, isLoading: messagesLoading, refetch: refetchMessages } = api.messages.list.useQuery(
    { instanceId: selectedInstanceId!, chatId: selectedChatId! },
    { enabled: !!selectedInstanceId && !!selectedChatId }
  )

  // Mutation para enviar mensagem
  const sendTextMutation = api.messages.sendText.useMutation({
    onSuccess: () => {
      setMessageText('')
      refetchMessages()
      toast.success('Mensagem enviada!')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao enviar mensagem')
    }
  })

  const instances = useMemo(() => instancesData?.data ?? [], [instancesData])
  const chats = useMemo(() => chatsData?.chats ?? [], [chatsData])
  const messages = useMemo(() => messagesData?.messages ?? [], [messagesData])

  const selectedInstance = instances.find(i => i.id === selectedInstanceId)
  const selectedChat = chats.find(c => c.wa_chatid === selectedChatId)

  const connectedInstances = instances.filter(i => i.status === 'connected')

  // Selecionar primeira instância conectada automaticamente
  useEffect(() => {
    if (connectedInstances.length > 0 && !selectedInstanceId) {
      setSelectedInstanceId(connectedInstances[0].id)
    }
  }, [connectedInstances, selectedInstanceId])

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedInstanceId || !selectedChatId) return

    sendTextMutation.mutate({
      instanceId: selectedInstanceId,
      chatId: selectedChatId,
      text: messageText,
    })
  }

  // Função para selecionar arquivo
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validar tamanho (máximo 16MB)
    if (file.size > 16 * 1024 * 1024) {
      toast.error('Arquivo muito grande', {
        description: 'O tamanho máximo é 16MB'
      })
      return
    }

    setSelectedFile(file)

    // Gerar preview para imagens
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setFilePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      setFilePreview(null)
    }
  }

  // Função para enviar arquivo
  const handleSendFile = async () => {
    if (!selectedFile || !selectedInstanceId || !selectedChatId) return

    setIsUploading(true)

    try {
      // Converter arquivo para base64
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1]

        const isImage = selectedFile.type.startsWith('image/')
        const endpoint = isImage ? api.media.sendImage : api.media.sendDocument

        await endpoint.mutate({
          instanceId: selectedInstanceId,
          chatId: selectedChatId,
          mediaBase64: base64,
          mimeType: selectedFile.type,
          fileName: selectedFile.name,
          caption: messageText || undefined
        })

        // Limpar estados
        setSelectedFile(null)
        setFilePreview(null)
        setMessageText('')
        refetchMessages()

        toast.success('✅ Arquivo enviado!', {
          description: `${selectedFile.name} foi enviado com sucesso`
        })
      }

      reader.onerror = () => {
        toast.error('❌ Erro ao ler arquivo')
      }

      reader.readAsDataURL(selectedFile)
    } catch (error: any) {
      console.error('Erro ao enviar arquivo:', error)
      toast.error('❌ Erro ao enviar arquivo', {
        description: error.message || 'Tente novamente'
      })
    } finally {
      setIsUploading(false)
    }
  }

  // Função para cancelar seleção de arquivo
  const handleCancelFile = () => {
    setSelectedFile(null)
    setFilePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatTimestamp = (timestamp: number) => {
    return formatDistanceToNow(new Date(timestamp * 1000), {
      locale: ptBR,
      addSuffix: true,
    })
  }

  const getAckIcon = (ack: number, fromMe: boolean) => {
    if (!fromMe) return null
    if (ack >= 2) return <CheckCheck className="h-3 w-3 text-blue-500" />
    if (ack >= 1) return <CheckCheck className="h-3 w-3 text-muted-foreground" />
    return <Check className="h-3 w-3 text-muted-foreground" />
  }

  if (!isHydrated || instancesLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-8 w-48" />
        </div>
      </div>
    )
  }

  if (connectedInstances.length === 0) {
    return (
      <div className="pt-6">
        <Alert>
          <AlertDescription>
            Nenhuma instância conectada. Conecte pelo menos uma instância para acessar as conversas.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex gap-4 pt-6" role="main" aria-label="Conversas WhatsApp">
      {/* Coluna 1: Instâncias */}
      <Card className="w-64 flex-shrink-0" role="region" aria-label="Lista de instâncias">
        <CardContent className="p-4">
          <h3 className="font-semibold mb-4">Instâncias</h3>
          <div className="space-y-2" role="list">
            {connectedInstances.map((instance) => (
              <button
                key={instance.id}
                role="listitem"
                aria-label={`Selecionar instância ${instance.name}`}
                aria-pressed={selectedInstanceId === instance.id}
                onClick={() => {
                  setSelectedInstanceId(instance.id)
                  setSelectedChatId(null)
                }}
                className={\`w-full p-3 rounded-lg text-left transition-colors \${
                  selectedInstanceId === instance.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }\`}
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={instance.profilePictureUrl || ''} />
                    <AvatarFallback>{instance.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{instance.name}</p>
                    <p className="text-xs opacity-70">{instance.phoneNumber}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Coluna 2: Lista de Conversas */}
      <Card className="w-80 flex-shrink-0" role="region" aria-label="Lista de conversas">
        <CardContent className="p-0 h-full flex flex-col">
          {/* Header com busca */}
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Buscar conversas..."
                className="pl-10"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                aria-label="Buscar conversas"
                role="searchbox"
              />
            </div>
          </div>

          {/* Lista de conversas */}
          <div className="flex-1 overflow-y-auto">
            {chatsLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : chats.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Nenhuma conversa encontrada
              </div>
            ) : (
              chats.map((chat) => (
                <button
                  key={chat.wa_chatid}
                  onClick={() => setSelectedChatId(chat.wa_chatid)}
                  className={\`w-full p-4 border-b hover:bg-muted transition-colors text-left \${
                    selectedChatId === chat.wa_chatid ? 'bg-muted' : ''
                  }\`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={chat.wa_profilePicUrl || ''} />
                      <AvatarFallback>
                        {chat.wa_name?.[0] || chat.wa_chatid[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium truncate">
                          {chat.wa_name || chat.wa_chatid}
                        </p>
                        {chat.wa_lastMsgTimestamp && (
                          <p className="text-xs text-muted-foreground">
                            {formatTimestamp(chat.wa_lastMsgTimestamp)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground truncate">
                          {chat.wa_lastMsgBody || 'Sem mensagens'}
                        </p>
                        {chat.wa_unreadCount > 0 && (
                          <Badge variant="default" className="ml-2">
                            {chat.wa_unreadCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Coluna 3: Área de Mensagens */}
      <Card className="flex-1" role="region" aria-label={selectedChat ? `Conversa com ${selectedChat.pushName || selectedChat.id}` : "Nenhuma conversa selecionada"}>
        <CardContent className="p-0 h-full flex flex-col">
          {selectedChat ? (
            <>
              {/* Header do chat */}
              <div className="p-4 border-b flex items-center justify-between" role="banner">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={selectedChat.wa_profilePicUrl || ''} />
                    <AvatarFallback>
                      {selectedChat.wa_name?.[0] || selectedChat.wa_chatid[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">
                      {selectedChat.wa_name || selectedChat.wa_chatid}
                    </p>
                    {selectedChat.wa_isGroup && (
                      <p className="text-xs text-muted-foreground">Grupo</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="Iniciar chamada de voz">
                        <Phone className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Iniciar chamada de voz</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="Iniciar chamada de vídeo">
                        <Video className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Iniciar chamada de vídeo</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="Mais opções">
                        <MoreVertical className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Mais opções</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Área de mensagens */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4" role="log" aria-label="Histórico de mensagens" aria-live="polite">
                {messagesLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-3/4" />
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground">
                    Nenhuma mensagem ainda
                  </div>
                ) : (
                  messages.slice().reverse().map((message) => (
                    <div
                      key={message.id}
                      className={\`flex \${message.wa_fromMe ? 'justify-end' : 'justify-start'}\`}
                    >
                      <div
                        className={\`max-w-[70%] rounded-lg p-3 \${
                          message.wa_fromMe
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }\`}
                      >
                        {message.wa_hasMedia && (
                          <div className="mb-2">
                            {message.wa_type === 'image' && message.wa_mediaUrl && (
                              <img
                                src={message.wa_mediaUrl}
                                alt="Imagem"
                                className="rounded max-w-full"
                              />
                            )}
                          </div>
                        )}
                        <p className="text-sm">{message.wa_body}</p>
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <span className="text-xs opacity-70">
                            {formatTimestamp(message.wa_timestamp)}
                          </span>
                          {getAckIcon(message.wa_ack, message.wa_fromMe)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Input de mensagem */}
              <div className="p-4 border-t space-y-3">
                {/* Preview de arquivo selecionado */}
                {selectedFile && (
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    {filePreview ? (
                      <img
                        src={filePreview}
                        alt="Preview"
                        className="h-16 w-16 object-cover rounded"
                      />
                    ) : (
                      <div className="h-16 w-16 flex items-center justify-center bg-background rounded">
                        <Paperclip className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancelFile}
                      disabled={isUploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Input de arquivo (oculto) */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* Barra de input */}
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading || !!selectedFile}
                      >
                        {selectedFile ? (
                          <Paperclip className="h-4 w-4 text-primary" />
                        ) : (
                          <ImageIcon className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Anexar imagem ou documento (máx 16MB)</p>
                    </TooltipContent>
                  </Tooltip>
                  <Input
                    placeholder={selectedFile ? "Legenda (opcional)..." : "Digite uma mensagem..."}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if (selectedFile) {
                          handleSendFile()
                        } else {
                          handleSendMessage()
                        }
                      }
                    }}
                    className="flex-1"
                    disabled={isUploading}
                    aria-label={selectedFile ? "Digite uma legenda para o arquivo" : "Digite sua mensagem"}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={selectedFile ? handleSendFile : handleSendMessage}
                        disabled={
                          isUploading ||
                          (selectedFile ? false : !messageText.trim()) ||
                          sendTextMutation.isPending
                        }
                      >
                        {isUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{selectedFile ? 'Enviar arquivo com legenda' : 'Enviar mensagem (Enter)'}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">Selecione uma conversa</p>
                <p className="text-sm">Escolha uma conversa para começar a enviar mensagens</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
