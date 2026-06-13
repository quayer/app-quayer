/**
 * readiness-checklist — adapta os blockers tipados do step-engine
 * (`GET /builder/projects/:id/readiness`) para o ChecklistItem da tab Publicar.
 *
 * FR-18: o gate de publicação usa a MESMA fonte da Overview (blockers
 * plan/byok/agent/prompt/refinement/version/channel), substituindo a
 * heurística local que ignorava plano/BYOK/versão e deixava o publish falhar
 * só em produção.
 */

import type {
  Readiness,
  ReadinessBlockerCheck,
} from "@/server/ai-module/builder/state/readiness.types"
import type { ChecklistItem } from "./connection-step"

type ReadinessBlocker = Readiness["blockers"][number]

const CHECKS: ReadonlyArray<{
  check: ReadinessBlockerCheck
  label: string
  hint: string
}> = [
  {
    check: "plan",
    label: "Plano ativo",
    hint: "Ative um plano para publicar o agente.",
  },
  {
    check: "byok",
    label: "Chave de IA (BYOK) configurada",
    hint: "Configure a chave do provedor de IA da organização.",
  },
  {
    check: "agent",
    label: "Agente criado",
    hint: "O Builder precisa criar um agente primeiro.",
  },
  {
    check: "prompt",
    label: "Prompt configurado",
    hint: "O prompt do agente ainda não está pronto.",
  },
  {
    check: "refinement",
    label: "Refinamento aprovado",
    hint: "Aprove o refinamento do agente antes de publicar.",
  },
  {
    check: "version",
    label: "Versão do prompt gerada",
    hint: "Gere uma versão do prompt no Builder.",
  },
  {
    check: "channel",
    label: "Canal WhatsApp conectado",
    hint: "Conecte uma instância do WhatsApp ao agente.",
  },
]

/**
 * O servidor só devolve os checks que FALHARAM (`blockers`); "met" é derivado
 * por ausência. O hint do item não atendido carrega o CTA/mensagem REAL do
 * blocker — a mesma copy do chat, sem contradição.
 */
export function readinessToChecklist(readiness: Readiness): ChecklistItem[] {
  const byCheck = new Map<string, ReadinessBlocker>(
    readiness.blockers.map((b) => [String(b.check), b]),
  )
  return CHECKS.map(({ check, label, hint }) => {
    const blocker = byCheck.get(check)
    return {
      key: check,
      label,
      met: blocker === undefined,
      hint: blocker?.cta ?? blocker?.message ?? hint,
    }
  })
}
