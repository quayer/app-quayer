import type { ProjectStatus } from "@/client/components/projetos/types"

export interface ProjetoItem {
  id: string
  name: string
  type: string
  status: ProjectStatus
  updatedAt: Date | string
  aiAgentId: string | null
}

export interface ProjetosListProps {
  projects: ProjetoItem[]
}

export type FilterKey = "todos" | "ativos" | "drafts" | "arquivados"

export const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "ativos", label: "Ativos" },
  { key: "drafts", label: "Rascunhos" },
  { key: "arquivados", label: "Arquivados" },
]
