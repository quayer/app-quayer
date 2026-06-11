"use client"

/**
 * Builder Cards — bloco de SHARE delegável do `whatsapp_connect` (T108, FR-34)
 *
 * Sub-componente do `whatsapp-connect-card.tsx`: o bloco "ou" abaixo do QR para
 * delegar o pareamento a quem está com o celular do negócio (agência montando
 * para o cliente, dono no computador com o celular em outra mão). Opera 100%
 * sobre o `shareLink` que o provision idempotente já devolveu — ZERO fetch extra
 * (plan §3.6c). A conclusão remota cai na MESMA autodetecção do card (o scan na
 * página `(public)/compartilhar/[token]` dispara o mesmo webhook UAZ).
 *
 * "Gerar novamente" aqui é o MESMO `onRegenerate` do card (renova QR + a validade
 * do shareLink juntos, sem criar instância nova no broker).
 */

import * as React from "react"
import { Check, Copy, Send } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

/** Texto pré-pronto da mensagem wa.me enviada a quem tem o celular do número. */
function waMeHref(shareLink: string): string {
  const text = `Oi! Para conectar nosso WhatsApp ao atendente, escaneie o QR Code neste link (válido por 15 min): ${shareLink}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/**
 * ShareDelegationBlock — Copiar link + Enviar por WhatsApp (FR-34). Renderiza
 * nada enquanto o `shareLink` não chegou (provision ainda em voo / indisponível).
 */
export function ShareDelegationBlock({
  shareLink,
  onRegenerate,
  tokens,
}: {
  shareLink: string | null
  onRegenerate: () => void
  tokens: AppTokens
}) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = React.useCallback(async () => {
    if (!shareLink) return
    try {
      await navigator.clipboard?.writeText(shareLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard indisponível — o link continua visível/selecionável abaixo.
    }
  }, [shareLink])

  if (!shareLink) return null

  return (
    <div
      className="mt-4 rounded-md border px-3 py-3"
      style={{ borderColor: tokens.divider, backgroundColor: tokens.bgBase }}
    >
      <p className="text-[12px] font-medium" style={{ color: tokens.textPrimary }}>
        📤 O número fica com outra pessoa?
      </p>
      <p className="mt-1 text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
        Envie este link para quem tem o celular da empresa — ela escaneia de lá.
      </p>

      <p
        className="mt-2 truncate rounded border px-2 py-1 text-[11px]"
        style={{ borderColor: tokens.divider, color: tokens.textTertiary }}
        title={shareLink}
      >
        {shareLink}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-[11px]"
          onClick={() => void handleCopy()}
          aria-live="polite"
        >
          {copied ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3" aria-hidden="true" />
          )}
          {copied ? "Copiado" : "Copiar link"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-[11px]"
          asChild
        >
          <a href={waMeHref(shareLink)} target="_blank" rel="noopener noreferrer">
            <Send className="h-3 w-3" aria-hidden="true" />
            Enviar por WhatsApp
          </a>
        </Button>
      </div>

      <p className="mt-2 text-[11px]" style={{ color: tokens.textTertiary }}>
        Link válido por 15 min ·{" "}
        <button
          type="button"
          onClick={onRegenerate}
          className="font-medium underline underline-offset-2 transition-colors"
          style={{ color: tokens.brandText }}
        >
          Gerar novamente
        </button>
      </p>
    </div>
  )
}
