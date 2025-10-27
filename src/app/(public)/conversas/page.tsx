'use client'

import { useState } from 'react'
import { Plus, Search, MoreVertical, Phone, Edit, Share2, Trash2, AlertCircle, Plug, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusBadge } from '@/components/custom/status-badge'
import { useInstances } from '@/hooks/useInstance'
import { usePermissions } from '@/hooks/usePermissions'
import type { Instance } from '@prisma/client'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

type FilterType = 'all' | 'connected' | 'disconnected'

export default function ConversasPage() {
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [message, setMessage] = useState('')

  const { data: instancesData, isLoading, error } = useInstances()
  const { canCreateInstance } = usePermissions()

  const instances = instancesData?.data || []

  // Calcular estatísticas
  const stats = {
    total: instances.length,
    connected: instances.filter(i => i.status === 'connected').length,
    disconnected: instances.filter(i => i.status === 'disconnected').length,
  }

  // Filtrar instâncias
  const filteredInstances = instances
    .filter(instance => {
      // Filtro por status
      if (filter === 'connected') return instance.status === 'connected'
      if (filter === 'disconnected') return instance.status === 'disconnected'
      return true
    })
    .filter(instance =>
      // Filtro por busca
      instance.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instance.phoneNumber?.toLowerCase().includes(searchTerm.toLowerCase())
    )

  const handleSendMessage = () => {
    if (!message.trim() || !selectedInstance) return

    // TODO: Implement send message API call
    toast.success('Mensagem enviada!')
    setMessage('')
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar conversas: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar - Lista de Conversas */}
      <aside className="w-80 border-r flex flex-col bg-background">
        {/* Header com Título */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Conversações</h2>
            {canCreateInstance && (
              <Button size="icon" variant="ghost">
                <Plus className="h-5 w-5" />
              </Button>
            )}
          </div>

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Tabs de Filtro */}
        <div className="border-b">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
            <TabsList className="w-full justify-start h-auto p-0 bg-transparent rounded-none">
              <TabsTrigger
                value="all"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Todas
              </TabsTrigger>
              <TabsTrigger
                value="connected"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Conectadas ({stats.connected})
              </TabsTrigger>
              <TabsTrigger
                value="disconnected"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Desconectadas ({stats.disconnected})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Lista de Conversas */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredInstances.length === 0 ? (
            <div className="p-8 text-center">
              <div className="rounded-full bg-muted p-6 mx-auto w-fit mb-4">
                <Phone className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {searchTerm
                  ? 'Nenhuma conversa encontrada'
                  : canCreateInstance
                  ? 'Clique no + para criar sua primeira integração'
                  : 'Nenhuma conversa disponível'}
              </p>
            </div>
          ) : (
            filteredInstances.map((instance) => (
              <div
                key={instance.id}
                className={`
                  flex items-center gap-3 p-3 cursor-pointer border-b
                  hover:bg-accent transition-colors
                  ${selectedInstance?.id === instance.id ? 'bg-accent' : ''}
                `}
                onClick={() => setSelectedInstance(instance)}
              >
                {/* Avatar */}
                <Avatar className="h-12 w-12">
                  <AvatarFallback
                    className={
                      instance.status === 'connected'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-500 text-white'
                    }
                  >
                    <Phone className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold truncate">{instance.name}</p>
                    <div className="flex items-center gap-1">
                      <StatusBadge status={instance.status as any} size="sm" />
                      {instance.status === 'disconnected' && (
                        <Badge variant="destructive" className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                          !
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground truncate">
                      {instance.phoneNumber || 'Não configurado'}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {formatDistanceToNow(new Date(instance.updatedAt), {
                        addSuffix: false,
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-2 text-center text-xs text-muted-foreground border-t">
          {filteredInstances.length > 0 ? `${filteredInstances.length} conversação(ões)` : 'End of list'}
        </div>
      </aside>

      {/* Main - Chat Principal */}
      <main className="flex-1 flex flex-col bg-background">
        {!selectedInstance ? (
          // Empty State
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="rounded-full bg-muted p-8 mb-4">
              <Phone className="h-16 w-16 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-xl mb-2">
              Escolha um contato para ver o chat completo
            </h3>
            <p className="text-muted-foreground max-w-md">
              Selecione uma conversa na lista para visualizar mensagens e enviar novas mensagens
            </p>
          </div>
        ) : (
          // Chat Ativo
          <div className="flex-1 flex flex-col h-full">
            {/* Header do Chat */}
            <div className="border-b p-4 flex items-center justify-between bg-accent/50">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback
                    className={
                      selectedInstance.status === 'connected'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-500 text-white'
                    }
                  >
                    <Phone className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{selectedInstance.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedInstance.phoneNumber || 'Não configurado'}
                  </p>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Phone className="mr-2 h-4 w-4" />
                    Ver Detalhes
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Plug className="mr-2 h-4 w-4" />
                    {selectedInstance.status === 'connected' ? 'Reconectar' : 'Conectar'}
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Share2 className="mr-2 h-4 w-4" />
                    Compartilhar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Deletar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Área de Mensagens */}
            <div className="flex-1 p-6 overflow-y-auto bg-muted/20">
              {selectedInstance.status === 'disconnected' ? (
                <div className="max-w-2xl mx-auto">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Esta instância está desconectada. Reconecte para visualizar e enviar mensagens.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-4">
                  {/* Empty State - Sem mensagens ainda */}
                  <div className="text-center py-12">
                    <div className="rounded-full bg-muted p-6 mx-auto w-fit mb-4">
                      <Send className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">
                      Nenhuma mensagem ainda. Envie a primeira mensagem para iniciar a conversa!
                    </p>
                  </div>

                  {/* Exemplo de mensagens (futuro) */}
                  {/* <div className="flex gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-blue-500 text-white text-xs">
                        EU
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="bg-blue-500 text-white rounded-lg p-3 max-w-md">
                        <p className="text-sm">Olá! Como posso ajudar?</p>
                      </div>
                      <span className="text-xs text-muted-foreground mt-1 block">há 2 minutos</span>
                    </div>
                  </div> */}
                </div>
              )}
            </div>

            {/* Input de Mensagem */}
            <div className="border-t p-4 bg-background">
              <div className="max-w-3xl mx-auto flex gap-2">
                <Textarea
                  placeholder={
                    selectedInstance.status === 'connected'
                      ? 'Digite uma mensagem...'
                      : 'Instância desconectada - Não é possível enviar mensagens'
                  }
                  className="min-h-[60px] max-h-[200px] resize-none"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={selectedInstance.status !== 'connected'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="h-[60px] w-[60px]"
                  onClick={handleSendMessage}
                  disabled={!message.trim() || selectedInstance.status !== 'connected'}
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Pressione Enter para enviar, Shift+Enter para nova linha
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
