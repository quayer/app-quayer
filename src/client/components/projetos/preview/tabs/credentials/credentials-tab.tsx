"use client"

import { KeyRound, Webhook, Plug, Sparkles } from "lucide-react"
import { useAppTokens, type AppTokens } from "@/client/hooks/use-app-tokens"
import type { WorkspaceProject } from "@/client/components/projetos/types"

export interface CredentialsTabProps {
  project: WorkspaceProject
}

interface PreviewItem {
  icon: typeof KeyRound
  title: string
  description: string
}

const PREVIEW_ITEMS: PreviewItem[] = [
  {
    icon: KeyRound,
    title: "Chaves de API",
    description:
      "Conecte modelos próprios (OpenAI, Anthropic, Gemini) ou serviços externos usados pelas tools do agente.",
  },
  {
    icon: Webhook,
    title: "Webhooks e segredos",
    description:
      "Cadastre tokens de webhook e secrets para integrações que o agente vai disparar em tempo de execução.",
  },
  {
    icon: Plug,
    title: "Integrações por agente",
    description:
      "Credenciais isoladas por projeto — sem misturar chaves entre agentes diferentes da mesma organização.",
  },
]

function PreviewCard({
  item,
  tokens,
}: {
  item: PreviewItem
  tokens: AppTokens
}) {
  const Icon = item.icon
  return (
    <div
      className="flex items-start gap-3 rounded-xl border p-4"
      style={{
        borderColor: tokens.divider,
        backgroundColor: tokens.bgSurface,
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: tokens.brandSubtle,
          color: tokens.brand,
        }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <h4
          className="text-[13px] font-semibold"
          style={{ color: tokens.textPrimary }}
        >
          {item.title}
        </h4>
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: tokens.textSecondary }}
        >
          {item.description}
        </p>
      </div>
    </div>
  )
}

export function CredentialsTab(_props: CredentialsTabProps) {
  const { tokens } = useAppTokens()

  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 mx-auto flex max-w-2xl flex-col gap-6 py-2">
      <div
        className="flex flex-col items-center gap-3 rounded-2xl border px-6 py-8 text-center"
        style={{
          borderColor: tokens.divider,
          backgroundColor: tokens.bgSurface,
        }}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <span
          className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          Em breve
        </span>
        <h3
          className="text-base font-semibold"
          style={{ color: tokens.textPrimary }}
        >
          Credenciais do agente
        </h3>
        <p
          className="max-w-md text-[13px] leading-relaxed"
          style={{ color: tokens.textSecondary }}
        >
          Em breve você vai gerenciar credenciais externas (chaves de API,
          webhooks e secrets) deste agente diretamente aqui — separadas por
          projeto e criptografadas em repouso.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tokens.textTertiary }}
        >
          O que você poderá fazer
        </span>
        {PREVIEW_ITEMS.map((item) => (
          <PreviewCard key={item.title} item={item} tokens={tokens} />
        ))}
      </div>
    </div>
  )
}
