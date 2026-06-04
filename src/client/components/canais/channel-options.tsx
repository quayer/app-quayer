'use client'

/**
 * Subcomponentes do channel-selector-modal (org-level):
 *   - OptionButton: cartão-rádio para escolher o tipo de canal.
 *   - WhatsAppBusinessPanel: instrução + CTA para conexão via QR (UAZAPI).
 *
 * Espelha o padrão visual de
 *   src/client/components/projetos/preview/tabs/deploy/channel-selector-card.tsx
 * mas sem acoplamento a projectId. O CTA de QR aponta para um endpoint org-level
 * que NÃO existe ainda (ver backendGaps); por isso o handler é injetado pelo
 * modal via onProvision.
 */

import * as React from 'react'
import { Check, Loader2, QrCode } from 'lucide-react'

import { Button } from '@/client/components/ui/button'
import type { AppTokens } from '@/client/hooks/use-app-tokens'

export type ChannelChoice = 'whatsapp_business' | 'whatsapp_cloud' | 'instagram'

export interface ChannelOptionMeta {
  key: ChannelChoice
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

export function OptionButton({
  tokens,
  meta,
  selected,
  onSelect,
}: {
  tokens: AppTokens
  meta: ChannelOptionMeta
  selected: boolean
  onSelect: () => void
}) {
  const Icon = meta.icon
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
      style={{
        borderColor: selected ? tokens.brand : tokens.border,
        backgroundColor: selected ? tokens.brandSubtle : tokens.bgSurface,
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: selected ? tokens.brand : tokens.bgElevated,
          color: selected ? tokens.textInverse : tokens.textSecondary,
        }}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ color: tokens.textPrimary }}>
            {meta.title}
          </span>
          {selected && (
            <Check className="h-3.5 w-3.5" style={{ color: tokens.brand }} aria-hidden="true" />
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: tokens.textTertiary }}>
          {meta.description}
        </p>
      </div>
    </button>
  )
}

export function WhatsAppBusinessPanel({
  tokens,
  onProvision,
}: {
  tokens: AppTokens
  /**
   * Dispara a provisão da instância UAZAPI a nível de organização. Deve
   * retornar o QR (data URL) quando disponível, ou null se ainda pendente.
   * Deve lançar em caso de erro. TODO: endpoint org-level inexistente.
   */
  onProvision: () => Promise<string | null>
}) {
  const [provisioning, setProvisioning] = React.useState(false)
  const [qrCode, setQrCode] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const handleProvision = React.useCallback(async () => {
    if (provisioning) return
    setProvisioning(true)
    setError(null)
    try {
      const qr = await onProvision()
      setQrCode(qr)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar WhatsApp Business')
    } finally {
      setProvisioning(false)
    }
  }, [provisioning, onProvision])

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
        Conecte um número do WhatsApp via QR Code (UAZAPI). Clique para gerar o QR
        e escaneie em WhatsApp {'›'} Dispositivos conectados {'›'} Conectar dispositivo.
      </p>

      <Button
        type="button"
        size="sm"
        className="h-9 w-fit gap-1.5 rounded-lg text-[12px] font-medium"
        style={{ backgroundColor: tokens.brand, color: tokens.textInverse }}
        onClick={handleProvision}
        disabled={provisioning}
      >
        {provisioning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {provisioning ? 'Conectando...' : 'Gerar QR Code'}
      </Button>

      {qrCode && (
        <div
          className="flex flex-col items-center gap-2 rounded-lg border p-3"
          style={{ borderColor: tokens.divider }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrCode}
            alt="QR Code para parear o WhatsApp"
            width={200}
            height={200}
            className="rounded-md bg-white p-2"
          />
          <p className="text-[11px]" style={{ color: tokens.textTertiary }}>
            Escaneie em WhatsApp {'›'} Dispositivos conectados {'›'} Conectar dispositivo.
          </p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border px-2.5 py-1.5 text-[11px]"
          style={{
            borderColor: tokens.danger,
            backgroundColor: tokens.dangerSubtle,
            color: tokens.dangerText,
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}
