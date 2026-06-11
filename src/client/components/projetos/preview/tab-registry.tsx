/**
 * Preview Tab Registry — source of truth for which tabs render in the
 * workspace right pane, and for which project types each tab is visible.
 *
 * Why a registry?
 *   O Builder hoje só cria `ai_agent`, mas o backlog (arch v5.3 §3) tem
 *   wa_campaign, ig_automation, wa_tracking, wa_flow, wa_group. Cada um
 *   terá seu conjunto próprio de tabs (ex: "Segmentação", "Mensagem",
 *   "Agendamento" pra campanhas). Centralizar em um registry evita que
 *   `preview-panel.tsx` precise crescer com if/else por tipo.
 *
 * Discriminador: `project.type` (mesmo campo do schema Prisma
 * `BuilderProject.type`). `visibleFor` omitido = _core (todas as tabs).
 *
 * Para adicionar uma tab nova:
 *   1. Criar componente em `preview/tabs/<group>/<name>/`
 *   2. Adicionar entrada aqui com `value`, `label`, `visibleFor`, `render`
 *   3. Expandir `PreviewTab` union em `../types.ts`
 */

import type { ReactNode } from "react"
import type { ProjectType } from "@/lib/project-type"
import type {
  ChatMessage,
  PreviewTab,
  WorkspaceProject,
} from "@/client/components/projetos/types"
import type {
  PhaseId,
  Readiness,
} from "@/server/ai-module/builder/state/readiness.types"

import { canOpenDeploy } from "./deploy-gate"
import { OverviewTab } from "./tabs/overview/overview-tab"
import { PromptTab } from "./tabs/prompt/prompt-tab"
import { KnowledgeTab } from "./tabs/knowledge/knowledge-tab"
import { MediaTab } from "./tabs/media/media-tab"
import { DeployTab } from "./tabs/deploy/deploy-tab"
import { PlaygroundTab } from "./tabs/agent/playground/playground-tab"
import { CredentialsTab } from "./tabs/credentials/credentials-tab"
import { AdvancedTab } from "./tabs/advanced/advanced-tab"
import { ActivityTab } from "./tabs/_core/activity/activity-tab"

/** Context passed to every tab renderer. Superset of what any tab consumes. */
export interface TabRenderContext {
  project: WorkspaceProject
  messages: ChatMessage[]
  onTabChange: (tab: PreviewTab) => void
  /**
   * Readiness ÚNICO içado pelo `workspace.tsx` (FR-18, T49, plan §4.4). Opcional
   * por compat: o ponto de render (preview-panel) repassa o snapshot hoisted para
   * que `OverviewTab` (e o futuro `visibleWhen`, T53/T54) leiam a MESMA fonte do
   * chat — sem uma segunda query. `undefined` enquanto a query carrega/em erro ou
   * quando o render-site ainda não foi religado ao provider.
   */
  readiness?: Readiness
  /** Re-runs a query içada de readiness (mesma identidade do contexto do chat). */
  refetchReadiness?: () => void
  /** True enquanto a readiness içada ainda não entregou o primeiro snapshot. */
  readinessLoading?: boolean
  /** True quando a query içada falhou; consumidores devem manter estado stale. */
  readinessError?: boolean
}

export interface TabDescriptor {
  value: PreviewTab
  label: string
  /**
   * Project types where this tab is visible. Omit to show for every type.
   */
  visibleFor?: ProjectType[]
  /**
   * When true, tab is shown as locked (grayed, unclickable) until the Builder
   * creates the agent. This keeps the tab strip layout stable from the start
   * — no layout shift when the agent is created.
   */
  requiresAgent?: boolean
  /**
   * When true, the tab is hidden entirely (not just locked) until the project
   * has a PUBLISHED agent — see {@link isProjectPublished}. Used by "Atividade":
   * there is no production activity to show until the agent goes live.
   */
  requiresPublished?: boolean
  /**
   * v2-only visibility predicate (T53/T54, FR-19, plan §4.4). When the project
   * runs the Journey v2 (`readiness.journey` present), a tab is rendered ONLY if
   * this returns true — non-actionable tabs are made INVISIBLE (filtered out),
   * never shown as locked. The journey reveals tabs phase by phase instead of
   * locking them.
   *
   * Omit it and the tab is always visible in v2. In v1 (`readiness.journey`
   * absent) this predicate is NEVER consulted — the legacy `requiresAgent` /
   * `requiresPublished` locking applies unchanged (NFR-03).
   */
  visibleWhen?: (ctx: { project: WorkspaceProject; readiness: Readiness }) => boolean
  render: (ctx: TabRenderContext) => ReactNode
}

/**
 * Phase order for the v2 journey, so `visibleWhen` predicates can ask
 * "are we at phase X or later?" without re-deriving the ordering. Mirrors the
 * `PhaseId` union order in `readiness.types.ts` (conhecer → revisar → testar →
 * lançar).
 */
const PHASE_ORDER: readonly PhaseId[] = ["conhecer", "revisar", "testar", "lancar"]

/** True once the active journey phase has reached `min` (or passed it). */
function phaseAtLeast(readiness: Readiness, min: PhaseId): boolean {
  const active = readiness.journey?.activePhaseId
  if (active === undefined) return false
  return PHASE_ORDER.indexOf(active) >= PHASE_ORDER.indexOf(min)
}

/**
 * A project counts as "published" once it has a live WhatsApp connection or its
 * status was flipped to production by the deploy saga. `aiAgentId` alone is NOT
 * enough — it is set at agent creation, long before the publish step.
 */
export function isProjectPublished(project: WorkspaceProject): boolean {
  return project.hasWhatsAppConnection || project.status === "production"
}

export interface TabDescriptorWithState extends TabDescriptor {
  /** Tab exists in the strip but is locked (agent not created yet). */
  locked: boolean
  /**
   * Why the tab is locked — surfaced as tooltip/toast on click (FR-20: nothing
   * is silently blocked). Null when unlocked.
   */
  lockedReason: string | null
}

/**
 * Ordem: overview → prompt → testar → atividade → publicar.
 * Fluxo mental: Visão geral → Edito → Testo → Vejo histórico → Publico.
 */
export const TAB_REGISTRY: TabDescriptor[] = [
  {
    value: "overview",
    label: "Visão geral",
    // v2: a Visão geral abre quando a revisão começa (fase Revisar+).
    visibleWhen: ({ readiness }) => phaseAtLeast(readiness, "revisar"),
    render: ({
      project,
      onTabChange,
      messages,
      readiness,
      readinessLoading,
      readinessError,
    }) => (
      <OverviewTab
        project={project}
        onTabChange={onTabChange}
        messages={messages}
        readiness={readiness}
        readinessLoading={readinessLoading}
        readinessError={readinessError}
      />
    ),
  },
  {
    value: "prompt",
    label: "Prompt",
    visibleFor: ["ai_agent"],
    requiresAgent: true,
    // v2: o Prompt acompanha o agente — visível assim que ele existe.
    visibleWhen: ({ project }) => project.aiAgent !== null,
    render: ({ project, messages }) => (
      <PromptTab project={project} messages={messages} />
    ),
  },
  {
    value: "knowledge",
    label: "Conhecimento",
    visibleFor: ["ai_agent"],
    visibleWhen: ({ readiness }) => phaseAtLeast(readiness, "revisar"),
    render: ({ project }) => <KnowledgeTab project={project} />,
  },
  {
    value: "media",
    label: "Mídias",
    visibleFor: ["ai_agent"],
    visibleWhen: ({ readiness }) => phaseAtLeast(readiness, "revisar"),
    render: ({ project }) => <MediaTab project={project} />,
  },
  {
    value: "playground",
    label: "Testar",
    visibleFor: ["ai_agent"],
    requiresAgent: true,
    // v2: Testar surge quando há agente para testar (agentExists).
    visibleWhen: ({ project }) => project.aiAgent !== null,
    render: ({ project }) => <PlaygroundTab project={project} />,
  },
  {
    value: "activity",
    label: "Atividade",
    visibleFor: ["ai_agent"],
    requiresPublished: true,
    // v2: idem v1 — só há atividade depois que o agente vai ao ar.
    visibleWhen: ({ project }) => isProjectPublished(project),
    render: ({ project, messages }) => (
      <ActivityTab project={project} messages={messages} />
    ),
  },
  {
    value: "deploy",
    label: "Publicar",
    visibleFor: ["ai_agent"],
    requiresAgent: true,
    // v2: Publicar segue o MESMO gate compartilhado do v1 (deploy-gate.ts) —
    // tab e CTAs nunca discordam.
    visibleWhen: ({ project }) => canOpenDeploy(project).allowed,
    render: ({ project }) => <DeployTab project={project} />,
  },
  {
    value: "credentials",
    label: "Config",
    visibleFor: ["ai_agent"],
    visibleWhen: ({ readiness }) => phaseAtLeast(readiness, "revisar"),
    render: ({ project }) => <CredentialsTab project={project} />,
  },
  {
    value: "advanced",
    label: "Avançado",
    visibleFor: ["ai_agent"],
    requiresAgent: true,
    visibleWhen: ({ readiness }) => phaseAtLeast(readiness, "revisar"),
    render: ({ project, onTabChange }) => (
      <AdvancedTab project={project} onTabChange={onTabChange} />
    ),
  },
]

/** Tabs that apply to a given project type — respects registry order. */
export function getTabsForType(type: ProjectType): TabDescriptor[] {
  return TAB_REGISTRY.filter(
    (tab) => !tab.visibleFor || tab.visibleFor.includes(type),
  )
}

/** Copy for tabs locked by the generic `requiresAgent` rule. */
const AGENT_LOCK_REASON =
  "Disponível após o Builder criar o agente — continue a conversa no chat."

/**
 * Returns the eligible tabs for the project type, each with a `locked` flag and
 * the human reason why.
 *
 * Two regimes (T53/T54, FR-19, plan §4.4), selected by `readiness.journey`:
 *
 *   - **v2** (`readiness?.journey` present): the journey REVEALS tabs phase by
 *     phase. Each tab's `visibleWhen({ project, readiness })` is consulted and
 *     non-actionable tabs are FILTERED OUT (invisible) instead of shown locked —
 *     so there is never a "visible but blocked" tab. The visible ones are always
 *     unlocked (`locked: false`).
 *
 *   - **v1** (no `readiness.journey`): the legacy behavior is untouched (NFR-03)
 *     — locked tabs are shown in the strip but never activate, avoiding layout
 *     shift when the agent is created mid-session. `visibleWhen` is ignored.
 *
 * The "Publicar" tab delegates to the SHARED `canOpenDeploy` gate — the same
 * predicate the Overview CTAs use, so tab and buttons can never disagree (in
 * both v1 lock copy and v2 `visibleWhen`).
 */
export function getTabsForProjectWithLocked(
  project: WorkspaceProject,
  readiness?: Readiness,
): TabDescriptorWithState[] {
  const hasAgent = project.aiAgent !== null
  const published = isProjectPublished(project)

  // ── v2: revelação progressiva — filtra por `visibleWhen`, nunca trava ──
  if (readiness?.journey) {
    return TAB_REGISTRY.filter((tab) => {
      if (tab.visibleFor && !tab.visibleFor.includes(project.type)) return false
      // Sem `visibleWhen` = sempre visível na v2; com ele, o predicado decide.
      return tab.visibleWhen ? tab.visibleWhen({ project, readiness }) : true
    }).map((tab) => ({ ...tab, locked: false, lockedReason: null }))
  }

  // ── v1: comportamento locked legado (intocado) ──
  return TAB_REGISTRY.filter((tab) => {
    if (tab.visibleFor && !tab.visibleFor.includes(project.type)) return false
    // Post-publish-only tabs (e.g. Atividade) are removed from the strip
    // entirely until the agent goes live — they have no pre-publish content.
    if (tab.requiresPublished && !published) return false
    return true
  }).map((tab) => {
    if (tab.value === "deploy") {
      const gate = canOpenDeploy(project)
      return { ...tab, locked: !gate.allowed, lockedReason: gate.reason }
    }
    const locked = !!(tab.requiresAgent && !hasAgent)
    return { ...tab, locked, lockedReason: locked ? AGENT_LOCK_REASON : null }
  })
}

/**
 * Tabs visible for a specific project instance (no locked tabs).
 * Kept for backwards compat with any code that needs only unlocked tabs.
 */
export function getTabsForProject(project: WorkspaceProject): TabDescriptor[] {
  const hasAgent = project.aiAgent !== null
  const published = isProjectPublished(project)
  return TAB_REGISTRY.filter((tab) => {
    if (tab.visibleFor && !tab.visibleFor.includes(project.type)) return false
    if (tab.requiresAgent && !hasAgent) return false
    if (tab.requiresPublished && !published) return false
    return true
  })
}

/** Lookup a descriptor by value (e.g. to validate URL tab param). */
export function getTabByValue(value: string): TabDescriptor | undefined {
  return TAB_REGISTRY.find((tab) => tab.value === value)
}
