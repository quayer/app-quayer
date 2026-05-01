export interface ProjetoItem {
  id: string
  name: string
  status: string
}

export interface ProjetosListProps {
  items?: ProjetoItem[]
  projects?: Record<string, unknown>[]
  [key: string]: unknown
}

export function ProjetosList(_props: ProjetosListProps) {
  return null
}
