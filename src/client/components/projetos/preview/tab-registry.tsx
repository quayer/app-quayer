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
  render: (ctx: TabRenderContext) => ReactNode
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
    render: ({ project, onTabChange, messages }) => (
      <OverviewTab
        project={project}
        onTabChange={onTabChange}
        messages={messages}
      />
    ),
  },
  {
    value: "prompt",
    label: "Prompt",
    visibleFor: ["ai_agent"],
    requiresAgent: true,
    render: ({ project, messages }) => (
      <PromptTab project={project} messages={messages} />
    ),
  },
  {
    value: "knowledge",
    label: "Conhecimento",
    visibleFor: ["ai_agent"],
    render: ({ project }) => <KnowledgeTab project={project} />,
  },
  {
    value: "media",
    label: "Mídias",
    visibleFor: ["ai_agent"],
    render: ({ project }) => <MediaTab project={project} />,
  },
  {
    value: "playground",
    label: "Testar",
    visibleFor: ["ai_agent"],
    requiresAgent: true,
    render: ({ project }) => <PlaygroundTab project={project} />,
  },
  {
    value: "activity",
    label: "Atividade",
    visibleFor: ["ai_agent"],
    requiresPublished: true,
    render: ({ project, messages }) => (
      <ActivityTab project={project} messages={messages} />
    ),
  },
  {
    value: "deploy",
    label: "Publicar",
    visibleFor: ["ai_agent"],
    requiresAgent: true,
    render: ({ project }) => <DeployTab project={project} />,
  },
  {
    value: "credentials",
    label: "Config",
    visibleFor: ["ai_agent"],
    render: ({ project }) => <CredentialsTab project={project} />,
  },
  {
    value: "advanced",
    label: "Avançado",
    visibleFor: ["ai_agent"],
    requiresAgent: true,
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
 * Returns all eligible tabs for the project type, each with a `locked` flag
 * and the human reason why. Locked tabs are shown in the strip but never
 * activate — this avoids layout shift when the agent is created mid-session.
 *
 * The "Publicar" tab delegates to the SHARED `canOpenDeploy` gate — the same
 * predicate the Overview CTAs use, so tab and buttons can never disagree.
 */
export function getTabsForProjectWithLocked(
  project: WorkspaceProject,
): TabDescriptorWithState[] {
  const hasAgent = project.aiAgent !== null
  const published = isProjectPublished(project)
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
