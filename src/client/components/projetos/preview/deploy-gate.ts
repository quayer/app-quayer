/**
 * deploy-gate — predicado ÚNICO que decide se a tela de publicação (tab
 * "Publicar") pode ser aberta para um projeto (spec jornada-builder-v2, FR-20:
 * estados desabilitados explicam o porquê; gate único = zero contradição).
 *
 * Consumidores (todos leem DAQUI, nunca re-decidem):
 *   - `tab-registry.tsx` → trava a tab "Publicar" + fornece o `lockedReason`
 *   - `preview-panel.tsx` → feedback de clique em tab travada (toast/title)
 *   - `overview/components/deploy-readiness-card.tsx` → CTA "Publicar"
 *   - `overview/components/next-step-card.tsx` → CTA "Publicar agora"
 *
 * Vive em arquivo próprio (não no tab-registry) para evitar import circular:
 * o registry importa a OverviewTab, que importa os componentes que precisam
 * do gate.
 */

import type { WorkspaceProject } from "@/client/components/projetos/types"

export interface DeployGate {
  /** True quando a tela de publicação pode ser aberta. */
  allowed: boolean
  /** Copy do porquê está travada (tooltip/toast). Null quando `allowed`. */
  reason: string | null
}

/**
 * A publicação só abre depois que o Builder criou o agente — antes disso a
 * tela não tem o que publicar. Demais pré-requisitos (canal, versão, plano,
 * BYOK) são resolvidos DENTRO do wizard de publicação, então não travam a
 * abertura da tela.
 */
export function canOpenDeploy(project: WorkspaceProject): DeployGate {
  if (project.aiAgent === null) {
    return {
      allowed: false,
      reason:
        "Disponível após o Builder criar o agente — continue a conversa no chat.",
    }
  }
  return { allowed: true, reason: null }
}
