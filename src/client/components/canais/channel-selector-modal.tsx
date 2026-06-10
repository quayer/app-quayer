'use client'

/**
 * ChannelSelectorModal — pop-up org-level para conectar um novo canal pela
 * página /canais. Substitui o CreateInstanceModal legado (quebrado, deletado
 * em Jun/2026 — ver docs/deprecated/WHATSAPP_LEGACY_UI.md).
 *
 * Mostra 3 opções mutuamente exclusivas:
 *   1. WhatsApp Business (UAZAPI) — instrução + CTA de QR Code.
 *   2. WhatsApp Cloud API         — form de credenciais.
 *   3. Instagram Direct           — form de credenciais.
 *
 * Acessibilidade: usa o Dialog (Radix) do design system — gerencia foco,
 * Escape e aria-modal. O grupo de opções é um radiogroup rotulado; o título e
 * a descrição do Dialog dão nome/descrição ao diálogo.
 *
 * Backend (org-level, multi-tenant por organizationId):
 *   - POST /api/v1/canais/connect/whatsapp-business → { data: { qrCode } }
 *   - POST /api/v1/canais/connect/credentials       → { data: { connectionId } }
 * NÃO reaproveitamos /api/v1/instances/* (legado) nem as rotas do builder
 * (acopladas a projectId). Após conectar, fechamos o modal e atualizamos a
 * lista via router.refresh() (Server Component recarrega as Connections).
 *
 * Estilo: DS v3 (--q-*) via useAppTokens, espelhando o channel-selector-card
 * do builder. Cada arquivo deste módulo fica < 200 linhas.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import { type ChannelChoice, OptionButton, WhatsAppBusinessPanel } from './channel-options'
import { ChannelCredentialForm, type ChannelCredentialKind } from './channel-credential-form'
import { CHANNEL_OPTIONS, INSTAGRAM_FIELDS, WHATSAPP_CLOUD_FIELDS } from './channel-config'

export interface ChannelSelectorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Disparado após uma conexão bem-sucedida, para a lista poder refetchar. */
  onConnected?: () => void | Promise<void>
}

/** Extrai uma mensagem de erro útil de uma resposta da API de canais. */
async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    return body.message ?? body.error ?? fallback
  } catch {
    return fallback
  }
}

/** Mapeia o `kind` do form para o discriminador `channel` da rota org-level. */
const KIND_TO_CHANNEL: Record<ChannelCredentialKind, 'whatsapp_cloud' | 'instagram'> = {
  WHATSAPP_CLOUD: 'whatsapp_cloud',
  INSTAGRAM: 'instagram',
}

export function ChannelSelectorModal({
  open,
  onOpenChange,
  onConnected,
}: ChannelSelectorModalProps) {
  const { tokens } = useAppTokens()
  const router = useRouter()
  const [choice, setChoice] = React.useState<ChannelChoice>('whatsapp_business')

  // POST /api/v1/canais/connect/whatsapp-business → { data: { qrCode } }.
  // Provisão UAZAPI org-level (sem projectId). A Connection já é criada aqui
  // (status DISCONNECTED), então atualizamos a lista mas mantemos o modal
  // aberto para o usuário escanear o QR. Retorna o QR (data URL) ou null.
  const handleProvisionWhatsAppBusiness =
    React.useCallback(async (): Promise<string | null> => {
      const res = await fetch('/api/v1/canais/connect/whatsapp-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        throw new Error(await readApiError(res, 'Falha ao conectar WhatsApp Business'))
      }
      const body = (await res.json()) as { data?: { qrCode?: string | null } }
      await onConnected?.()
      router.refresh()
      return body.data?.qrCode ?? null
    }, [onConnected, router])

  // POST /api/v1/canais/connect/credentials → { data: { connectionId } }.
  // Salva credenciais Cloud API / Instagram numa Connection org-level.
  const handleSubmitCredentials = React.useCallback(
    async (kind: ChannelCredentialKind, credentials: Record<string, string>) => {
      const res = await fetch('/api/v1/canais/connect/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: KIND_TO_CHANNEL[kind], ...credentials }),
      })
      if (!res.ok) {
        throw new Error(await readApiError(res, 'Falha ao salvar credenciais'))
      }
    },
    [],
  )

  // Após conectar: notifica o pai, atualiza a lista (RSC) e fecha o modal.
  const handleConnected = React.useCallback(async () => {
    await onConnected?.()
    router.refresh()
    onOpenChange(false)
  }, [onConnected, router, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-md"
        style={{ backgroundColor: tokens.bgSurface, borderColor: tokens.divider }}
      >
        <DialogHeader className="border-b px-5 py-4 text-left" style={{ borderColor: tokens.divider }}>
          <DialogTitle className="text-base font-semibold" style={{ color: tokens.textPrimary }}>
            Conectar canal
          </DialogTitle>
          <DialogDescription className="text-[12px]" style={{ color: tokens.textTertiary }}>
            Escolha como deseja conectar um novo canal à sua organização.
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex flex-col gap-2 px-5 py-4"
          role="radiogroup"
          aria-label="Tipo de canal para conectar"
        >
          {CHANNEL_OPTIONS.map((meta) => (
            <OptionButton
              key={meta.key}
              tokens={tokens}
              meta={meta}
              selected={choice === meta.key}
              onSelect={() => setChoice(meta.key)}
            />
          ))}
        </div>

        <div className="border-t px-5 py-4" style={{ borderColor: tokens.divider }}>
          {choice === 'whatsapp_business' && (
            <WhatsAppBusinessPanel
              tokens={tokens}
              onProvision={handleProvisionWhatsAppBusiness}
            />
          )}

          {choice === 'whatsapp_cloud' && (
            <ChannelCredentialForm
              tokens={tokens}
              kind="WHATSAPP_CLOUD"
              fields={WHATSAPP_CLOUD_FIELDS}
              submitLabel="Conectar WhatsApp Cloud"
              onSubmitCredentials={async (kind, creds) => {
                await handleSubmitCredentials(kind, creds)
                await handleConnected()
              }}
            />
          )}

          {choice === 'instagram' && (
            <ChannelCredentialForm
              tokens={tokens}
              kind="INSTAGRAM"
              fields={INSTAGRAM_FIELDS}
              submitLabel="Conectar Instagram"
              onSubmitCredentials={async (kind, creds) => {
                await handleSubmitCredentials(kind, creds)
                await handleConnected()
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
