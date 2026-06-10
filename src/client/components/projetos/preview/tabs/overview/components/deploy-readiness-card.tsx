"use client"

import { Rocket } from "lucide-react"
import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { PreviewTab } from "@/client/components/projetos/types"
import type { DeployGate } from "../../../deploy-gate"
import type { ReadinessItem } from "../types"
import { ReadinessRow } from "./readiness-row"

interface DeployReadinessCardProps {
  /** Os 6 pre-deploy checks REAIS (plan/byok/agent/prompt/version/channel). */
  items: ReadinessItem[]
  /** `readiness.isDeployReady` — todos os passos + zero blockers. */
  isDeployReady: boolean
  /** Gate único da tela de publicação (compartilhado com tab e CTAs). */
  deployGate: DeployGate
  onTabChange?: (tab: PreviewTab) => void
  tokens: AppTokens
}

/**
 * "Prontidão para publicar" — espelha os blockers tipados do step-engine
 * (fonte única, FR-18), nunca um checklist local que contradiga o chat.
 *
 * O CTA navega para a tab Publicar: ele abre habilitado assim que o gate
 * (`canOpenDeploy`) libera, mesmo com pendências — é DENTRO do wizard que
 * canal/versão são resolvidos. O label diz o que o botão FAZ (FR-20):
 * "Publicar" só quando tudo pronto; antes disso, "Abrir publicação".
 */
export function DeployReadinessCard({
  items,
  isDeployReady,
  deployGate,
  onTabChange,
  tokens,
}: DeployReadinessCardProps) {
  const metCount = items.filter((item) => item.met).length

  return (
    <Card
      className="overflow-hidden border p-0 shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <CardContent className="p-5">
        <h3
          className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tokens.textTertiary }}
        >
          Prontidão para publicar
        </h3>

        <div className="flex flex-col gap-2.5">
          {items.map((item) => (
            <ReadinessRow key={item.label} item={item} tokens={tokens} />
          ))}
        </div>

        <div
          className="mt-4 flex items-center justify-between border-t pt-4"
          style={{ borderColor: tokens.divider }}
        >
          <span
            className="text-[13px] font-medium"
            style={{ color: tokens.textSecondary }}
          >
            {metCount} de {items.length} requisitos atendidos
          </span>
          <button
            type="button"
            disabled={!deployGate.allowed}
            title={
              deployGate.reason ??
              (isDeployReady
                ? undefined
                : "Abre a tela de publicação para resolver as pendências")
            }
            onClick={() => onTabChange?.("deploy")}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 text-[12px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              backgroundColor: tokens.brand,
              color: tokens.textInverse,
            }}
          >
            <Rocket className="h-3.5 w-3.5" />
            {isDeployReady ? "Publicar" : "Abrir publicação"}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
