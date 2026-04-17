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

import { OverviewTab } from "./tabs/overview/overview-tab"
import { PromptTab } from "./tabs/prompt/prompt-tab"
import { DeployTab } from "./tabs/deploy/deploy-tab"
import { ActivityTab } from "./tabs/_core/activity/activity-tab"
import { PlaygroundTab } from "./tabs/agent/playground/playground-tab"

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
   * Kept as an array so future kinds can reuse the same tab (ex: `activity`
   * cabe em todos; `deploy` talvez caiba em `ai_agent` + `wa_flow`).
   */
  visibleFor?: ProjectType[]
  render: (ctx: TabRenderContext) => ReactNode
}

/**
 * Ordem importa — é a ordem de renderização na TabsList. Mantém overview
 * primeiro (landing) e deploy por último (passo final). Futuras tabs de
 * campanha devem inserir entre `overview` e `activity`.
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
    render: ({ project, messages }) => (
      <PromptTab project={project} messages={messages} />
    ),
  },
  {
    value: "activity",
    label: "Atividade",
    render: ({ project, messages }) => (
      <ActivityTab project={project} messages={messages} />
    ),
  },
  {
    value: "playground",
    label: "Playground",
    visibleFor: ["ai_agent"],
    render: ({ project }) => <PlaygroundTab project={project} />,
  },
  {
    value: "deploy",
    label: "Publicar",
    visibleFor: ["ai_agent"],
    render: ({ project }) => <DeployTab project={project} />,
  },
]

/** Tabs that apply to a given project type — respects registry order. */
export function getTabsForType(type: ProjectType): TabDescriptor[] {
  return TAB_REGISTRY.filter(
    (tab) => !tab.visibleFor || tab.visibleFor.includes(type),
  )
}

/** Lookup a descriptor by value (e.g. to validate URL tab param). */
export function getTabByValue(value: string): TabDescriptor | undefined {
  return TAB_REGISTRY.find((tab) => tab.value === value)
}
