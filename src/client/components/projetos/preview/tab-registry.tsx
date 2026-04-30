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

/**
 * Controls whether a tab requires the project to have an aiAgent configured.
 * Tabs marked `requiresAgent: true` are hidden until the Builder creates the
 * agent (tool call `create_agent`). This prevents showing Prompt/Playground/
 * Publicar on brand-new projects where those tabs have no content.
 */

import { OverviewTab } from "./tabs/overview/overview-tab"
import { PromptTab } from "./tabs/prompt/prompt-tab"
import { DeployTab } from "./tabs/deploy/deploy-tab"
import { PlaygroundTab } from "./tabs/agent/playground/playground-tab"
import { CredentialsTab } from "./tabs/credentials/credentials-tab"

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
  render: (ctx: TabRenderContext) => ReactNode
}

export interface TabDescriptorWithState extends TabDescriptor {
  /** Tab exists in the strip but is locked (agent not created yet). */
  locked: boolean
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
    value: "playground",
    label: "Testar",
    visibleFor: ["ai_agent"],
    requiresAgent: true,
    render: ({ project }) => <PlaygroundTab project={project} />,
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
    label: "Credenciais",
    visibleFor: ["ai_agent"],
    render: ({ project }) => <CredentialsTab project={project} />,
  },
]

/** Tabs that apply to a given project type — respects registry order. */
export function getTabsForType(type: ProjectType): TabDescriptor[] {
  return TAB_REGISTRY.filter(
    (tab) => !tab.visibleFor || tab.visibleFor.includes(type),
  )
}

/**
 * Returns all eligible tabs for the project type, each with a `locked` flag.
 * Locked tabs are shown in the strip but are unclickable — this avoids layout
 * shift when the agent is created mid-session.
 */
export function getTabsForProjectWithLocked(
  project: WorkspaceProject,
): TabDescriptorWithState[] {
  const hasAgent = project.aiAgent !== null
  return TAB_REGISTRY.filter(
    (tab) => !tab.visibleFor || tab.visibleFor.includes(project.type),
  ).map((tab) => ({
    ...tab,
    locked: !!(tab.requiresAgent && !hasAgent),
  }))
}

/**
 * Tabs visible for a specific project instance (no locked tabs).
 * Kept for backwards compat with any code that needs only unlocked tabs.
 */
export function getTabsForProject(project: WorkspaceProject): TabDescriptor[] {
  const hasAgent = project.aiAgent !== null
  return TAB_REGISTRY.filter((tab) => {
    if (tab.visibleFor && !tab.visibleFor.includes(project.type)) return false
    if (tab.requiresAgent && !hasAgent) return false
    return true
  })
}

/** Lookup a descriptor by value (e.g. to validate URL tab param). */
export function getTabByValue(value: string): TabDescriptor | undefined {
  return TAB_REGISTRY.find((tab) => tab.value === value)
}
