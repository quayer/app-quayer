/**
 * readiness-adapters — adaptadores PUROS do payload de
 * `GET /builder/projects/:id/readiness` para os view-models da Overview.
 *
 * FR-18 (spec jornada-builder-v2): UMA única fonte de progresso/prontidão.
 * Estes adaptadores substituem os antigos `derive-stages.ts` (progresso
 * inferido de tool-calls do chat) e `derive-readiness.ts` (3 checks locais)
 * — a Overview agora apenas REFLETE o step-engine determinístico do servidor
 * (`next-pending-step.ts`), nunca re-deriva.
 */

import type {
  Readiness,
  ReadinessBlockerCheck,
} from "@/server/ai-module/builder/state/readiness.types"
import type { ReadinessItem, Stage } from "../types"

/** Structural check — o suficiente para confiar no shape de `Readiness`. */
function isReadiness(value: unknown): value is Readiness {
  if (value === null || typeof value !== "object") return false
  const r = value as Record<string, unknown>
  return (
    typeof r.completenessPct === "number" &&
    Array.isArray(r.steps) &&
    Array.isArray(r.blockers) &&
    typeof r.step === "object" &&
    r.step !== null
  )
}

/**
 * Desembrulha tolerante o envelope do client Igniter — o payload pode chegar
 * plano (`Readiness`), embrulhado (`{ success, data }`) ou em array, conforme
 * o envelope (mesma defesa de media-tab/version-history).
 */
export function unwrapReadiness(raw: unknown): Readiness | null {
  if (raw === null || raw === undefined) return null
  if (isReadiness(raw)) return raw
  if (Array.isArray(raw)) return unwrapReadiness(raw[0])
  if (typeof raw === "object" && "data" in raw) {
    return unwrapReadiness((raw as { data: unknown }).data)
  }
  return null
}

/**
 * Checklist ordenado da jornada → linhas do StageList. O passo "ativo" é o
 * `readiness.step.id` (o próximo ask do step-engine); concluídos ficam "done",
 * o restante "pending".
 */
export function stepsToStages(readiness: Readiness): Stage[] {
  const activeId = readiness.step.id
  return readiness.steps.map((step, index) => ({
    number: index + 1,
    title: step.title,
    status: step.done ? "done" : step.id === activeId ? "active" : "pending",
  }))
}

/**
 * Universo dos 6 pre-deploy checks (plan/byok/agent/prompt/version/channel) —
 * o servidor só devolve os que FALHARAM (`blockers`), então o checklist "met"
 * é derivado por ausência. Labels voltados a leigo (NFR-07).
 */
const BLOCKER_CHECKLIST: ReadonlyArray<{
  check: ReadinessBlockerCheck
  label: string
}> = [
  { check: "plan", label: "Plano ativo" },
  { check: "byok", label: "Chave de IA (BYOK) configurada" },
  { check: "agent", label: "Agente criado" },
  { check: "prompt", label: "Prompt configurado" },
  { check: "version", label: "Versão do prompt gerada" },
  { check: "channel", label: "Canal WhatsApp conectado" },
]

/**
 * Blockers tipados do step-engine → checklist da "Prontidão para publicar".
 * Itens não atendidos carregam o CTA/mensagem REAL do blocker como detalhe —
 * a mesma copy que o chat usa, sem contradição.
 */
export function blockersToChecklist(readiness: Readiness): ReadinessItem[] {
  const byCheck = new Map(readiness.blockers.map((b) => [b.check, b]))
  return BLOCKER_CHECKLIST.map(({ check, label }) => {
    const blocker = byCheck.get(check)
    return {
      label,
      met: blocker === undefined,
      detail: blocker ? blocker.cta ?? blocker.message : undefined,
    }
  })
}
