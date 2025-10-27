/**
 * Conexões Page
 *
 * Página unificada para gerenciamento de conexões multi-canal
 */

'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ConnectionCard,
  ConnectionStatusBadge,
  CreateConnectionModal,
  QRCodeModal,
} from '@/features/connections/components'
import {
  CHANNEL_METADATA,
  STATUS_METADATA,
  type Channel,
  type ConnectionStatus,
  type Provider,
} from '@/features/connections/connection.constants'

interface Connection {
  id: string
  name: string
  description?: string | null
  channel: Channel
  provider: Provider
  status: ConnectionStatus
  createdAt: string
  updatedAt: string
}

export default function ConexoesPage() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<Channel | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ConnectionStatus | 'all'>('all')

  // Modais
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null)

  // Carregar conexões
  const loadConnections = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (channelFilter !== 'all') params.set('channel', channelFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)

      const response = await fetch(`/api/v1/connections?${params}`)

      if (!response.ok) {
        throw new Error('Erro ao carregar conexões')
      }

      const data = await response.json()
      setConnections(data.connections || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadConnections()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelFilter, statusFilter])

  // Debounce search
  useEffect(() => {
    const timeout = setTimeout(() => {
      loadConnections()
    }, 500)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const handleConnect = (connection: Connection) => {
    setSelectedConnection(connection)
    setQrModalOpen(true)
  }

  const handleDisconnect = async (connection: Connection) => {
    if (!confirm(`Desconectar ${connection.name}?`)) return

    try {
      const response = await fetch(`/api/v1/connections/${connection.id}/disconnect`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Erro ao desconectar')
      }

      await loadConnections()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao desconectar')
    }
  }

  const handleRestart = async (connection: Connection) => {
    if (!confirm(`Reiniciar ${connection.name}?`)) return

    try {
      const response = await fetch(`/api/v1/connections/${connection.id}/restart`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Erro ao reiniciar')
      }

      await loadConnections()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao reiniciar')
    }
  }

  const handleDelete = async (connection: Connection) => {
    if (!confirm(`Deletar ${connection.name}? Esta ação não pode ser desfeita.`)) return

    try {
      const response = await fetch(`/api/v1/connections/${connection.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Erro ao deletar')
      }

      await loadConnections()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao deletar')
    }
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conexões</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie suas conexões de WhatsApp, Instagram, Telegram e Email
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} size="lg">
          <Plus className="mr-2 h-5 w-5" />
          Nova Conexão
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conexões..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as Channel | 'all')}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais</SelectItem>
            {Object.entries(CHANNEL_METADATA).map(([key, meta]) => (
              <SelectItem key={key} value={key} disabled={!meta.available}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ConnectionStatus | 'all')}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_METADATA).map(([key, meta]) => (
              <SelectItem key={key} value={key}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista de conexões */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[280px]" />
          ))}
        </div>
      ) : connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-muted-foreground space-y-2">
            <p className="text-lg font-medium">Nenhuma conexão encontrada</p>
            <p className="text-sm">
              {search || channelFilter !== 'all' || statusFilter !== 'all'
                ? 'Tente ajustar os filtros'
                : 'Crie sua primeira conexão para começar'}
            </p>
          </div>
          {!search && channelFilter === 'all' && statusFilter === 'all' && (
            <Button onClick={() => setCreateModalOpen(true)} className="mt-6" size="lg">
              <Plus className="mr-2 h-5 w-5" />
              Criar Primeira Conexão
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {connections.map((connection) => (
            <ConnectionCard
              key={connection.id}
              id={connection.id}
              name={connection.name}
              description={connection.description}
              provider={connection.provider}
              status={connection.status}
              createdAt={new Date(connection.createdAt)}
              updatedAt={new Date(connection.updatedAt)}
              onConnect={() => handleConnect(connection)}
              onDisconnect={() => handleDisconnect(connection)}
              onRestart={() => handleRestart(connection)}
              onDelete={() => handleDelete(connection)}
              onViewQR={() => handleConnect(connection)}
            />
          ))}
        </div>
      )}

      {/* Modais */}
      <CreateConnectionModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={() => loadConnections()}
      />

      {selectedConnection && (
        <QRCodeModal
          open={qrModalOpen}
          onOpenChange={setQrModalOpen}
          connectionId={selectedConnection.id}
          connectionName={selectedConnection.name}
        />
      )}
    </div>
  )
}
