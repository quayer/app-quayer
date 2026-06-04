"use client"

/**
 * AgentConfigSection — bloco "Config" do agente: escolha de MODELO (lista
 * curada LiteLLM) + DROPDOWN da CHAVE BYOK que o agente usa.
 *
 * Data + persistência vivem em ./use-agent-credential.ts (fetch só por URL,
 * sem importar server). Este arquivo é só apresentação.
 */

import { KeyRound } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { ProviderKey } from "@/client/components/integracoes/providers-catalog"
import { CURATED_MODELS, findModelById } from "./model-catalog"
import {
  useAgentCredential,
  type CredentialSaveState,
  type ProviderKeyOption,
} from "./use-agent-credential"

function keyLabel(opt: ProviderKeyOption): string {
  if (opt.label) return opt.label
  if (opt.lastFour) return `••••••${opt.lastFour}`
  return opt.id
}

export interface AgentConfigSectionProps {
  projectId: string
  provider: ProviderKey | null
  currentModelId: string | null
  organizationProviderId?: string | null
  tokens: AppTokens
}

export function AgentConfigSection({
  projectId,
  provider,
  currentModelId,
  organizationProviderId,
  tokens,
}: AgentConfigSectionProps) {
  const { keys, selectedKey, saveState, selectKey } = useAgentCredential(
    projectId,
    provider,
    organizationProviderId,
  )

  const activeModel = findModelById(currentModelId)
  const labelStyle = { color: tokens.textSecondary }

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border p-4"
      style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
    >
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4" style={{ color: tokens.brand }} aria-hidden="true" />
        <h3 className="text-sm font-semibold" style={{ color: tokens.textPrimary }}>
          Config do agente
        </h3>
      </div>

      {/* MODELO — curated LiteLLM list, current model preselected. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium" style={labelStyle}>
          Modelo
        </span>
        <Select value={activeModel?.id ?? ""} disabled>
          <SelectTrigger className="h-9 text-[13px]">
            <SelectValue placeholder={currentModelId ?? "Definido pelo Builder"} />
          </SelectTrigger>
          <SelectContent>
            {CURATED_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label} — {m.hint}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
          O modelo é definido pelo Builder durante a conversa.
        </span>
      </div>

      {/* CHAVE — provider keys dropdown, persists organizationProviderId. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium" style={labelStyle}>
          Chave do agente (BYOK)
        </span>
        <Select
          value={selectedKey}
          onValueChange={selectKey}
          disabled={!provider || keys.length === 0}
        >
          <SelectTrigger className="h-9 text-[13px]">
            <SelectValue
              placeholder={
                keys.length === 0 ? "Nenhuma chave disponível" : "Selecione uma chave"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {keys.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {keyLabel(opt)}
                {opt.isDefault ? " · padrão" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SaveHint state={saveState} tokens={tokens} />
      </div>
    </section>
  )
}

function SaveHint({
  state,
  tokens,
}: {
  state: CredentialSaveState
  tokens: AppTokens
}) {
  if (state === "idle")
    return (
      <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
        Esta chave tem prioridade sobre a chave global da plataforma.
      </span>
    )
  if (state === "saving")
    return (
      <span className="text-[11px]" style={{ color: tokens.textTertiary }}>
        Salvando…
      </span>
    )
  if (state === "saved")
    return (
      <span className="text-[11px]" style={{ color: tokens.successText }}>
        Chave do agente atualizada.
      </span>
    )
  return (
    <span className="text-[11px]" style={{ color: tokens.dangerText }}>
      Erro ao salvar a chave.
    </span>
  )
}
