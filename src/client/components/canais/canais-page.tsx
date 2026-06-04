'use client'

import { useState } from 'react'
import { Plus, Smartphone } from 'lucide-react'
import type { Channel, ConnectionStatus, Provider } from '@prisma/client'
import { Button } from '@/client/components/ui/button'
import { EmptyState } from '@/client/components/custom/empty-state'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import { DetailsModal } from '@/client/components/whatsapp/details-modal'
import { ConnectionCard } from './connection-card'
import { ChannelSelectorModal } from './channel-selector-modal'

/**
 * Forma serializada de `Connection` para o boundary server → client.
 * Dates viram ISO strings; campos relevantes pra UI da lista de canais.
 */
export interface CanaisConnection {
  id: string
  name: string
  channel: Channel
  provider: Provider
  status: ConnectionStatus
  phoneNumber: string | null
  profileName: string | null
  profilePictureUrl: string | null
  isBusiness: boolean
  uazapiInstanceId: string | null
  lastConnected: string | null
  lastDisconnect: string | null
  lastDisconnectReason: string | null
  cloudApiPhoneNumberId: string | null
  cloudApiVerifiedName: string | null
  createdAt: string
  updatedAt: string
}

interface CanaisPageProps {
  connections: CanaisConnection[]
}

export function CanaisPage({ connections }: CanaisPageProps) {
  const { tokens } = useAppTokens()
  const [selected, setSelected] = useState<CanaisConnection | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const isEmpty = connections.length === 0

  return (
    <div
      className="space-y-6"
      style={{ color: tokens.textPrimary }}
    >
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: tokens.textPrimary }}
          >
            Canais WhatsApp
          </h1>
          <p
            className="text-sm"
            style={{ color: tokens.textTertiary }}
          >
            Conecte e gerencie suas instâncias para receber/enviar mensagens
          </p>
        </div>

        <Button type="button" onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Conectar canal
        </Button>
      </header>

      <main>
        {isEmpty ? (
          <div className="flex flex-col items-center gap-4">
            <EmptyState
              icon={<Smartphone className="h-5 w-5" aria-hidden="true" />}
              title="Nenhum canal conectado"
              description="Conecte sua primeira conta de WhatsApp para começar a publicar agentes"
            />
            <Button type="button" onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Conectar primeiro canal
            </Button>
          </div>
        ) : (
          <ul
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            aria-label="Lista de canais WhatsApp"
          >
            {connections.map((conn) => (
              <li key={conn.id}>
                <ConnectionCard
                  connection={conn}
                  onOpenDetails={() => setSelected(conn)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      <DetailsModal
        instance={selected}
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
      />

      <ChannelSelectorModal
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  )
}
