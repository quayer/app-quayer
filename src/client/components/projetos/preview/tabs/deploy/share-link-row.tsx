"use client"

/**
 * ShareLinkRow — linha com o link público /compartilhar/<token> + ações de
 * copiar/abrir. Usada pelo painel WhatsApp Business (channel-selector-card) e
 * pela view de canal pendente (pending-channel).
 */

import * as React from "react"
import { Check, Copy, ExternalLink } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

export function ShareLinkRow({
  tokens,
  shareLink,
}: {
  tokens: AppTokens
  shareLink: string
}) {
  const [copied, setCopied] = React.useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard indisponível — o link continua visível/selecionável
    }
  }
  return (
    <div
      className="flex items-center gap-2 rounded-md border px-2 py-1.5"
      style={{ borderColor: tokens.border, backgroundColor: tokens.bgBase }}
    >
      <code
        className="flex-1 overflow-x-auto whitespace-nowrap text-[11px]"
        style={{ color: tokens.textPrimary }}
      >
        {shareLink}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors"
        style={{ borderColor: tokens.border, color: tokens.textSecondary, backgroundColor: tokens.bgSurface }}
        aria-label="Copiar link de compartilhamento"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3" style={{ color: tokens.brand }} aria-hidden="true" />
            Copiado
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" aria-hidden="true" />
            Copiar
          </>
        )}
      </button>
      <a
        href={shareLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors"
        style={{ borderColor: tokens.border, color: tokens.textSecondary, backgroundColor: tokens.bgSurface }}
        aria-label="Abrir link de compartilhamento em nova aba"
      >
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
        Abrir
      </a>
    </div>
  )
}
