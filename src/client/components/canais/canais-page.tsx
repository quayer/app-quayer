'use client'

import { useState } from 'react'
import { Smartphone } from 'lucide-react'
import type { Channel, ConnectionStatus, Provider } from '@prisma/client'
import { Button } from '@/client/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/client/components/ui/tooltip'
import { EmptyState } from '@/client/components/custom/empty-state'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import { DetailsModal } from '@/client/components/whatsapp/details-modal'
import { ConnectionCard } from './connection-card'

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

  const isEmpty = connections.length === 0

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex min-h-screen flex-col"
        style={{ color: tokens.textPrimary }}
      >
        <header className="border-b" style={{ borderColor: tokens.divider }}>
          <div className="container mx-auto flex flex-col gap-4 px-6 py-8 md:flex-row md:items-end md:justify-between">
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

            <Tooltip>
              <TooltipTrigger asChild>
                {/* Wrapper span necessário pra Tooltip funcionar com Button disabled */}
                <span className="inline-flex">
                  <Button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="cursor-not-allowed opacity-70"
                  >
                    Conectar canal
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">Em breve</TooltipContent>
            </Tooltip>
          </div>
        </header>

        <main className="container mx-auto flex-1 px-6 py-8">
          {isEmpty ? (
            <EmptyState
              icon={<Smartphone className="h-5 w-5" aria-hidden="true" />}
              title="Nenhum canal conectado"
              description="Conecte sua primeira conta de WhatsApp para começar a publicar agentes"
            />
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
      </div>
    </TooltipProvider>
  )
}
