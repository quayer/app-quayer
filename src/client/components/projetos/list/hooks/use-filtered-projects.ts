import { useMemo } from "react"
import type { ProjetoItem, FilterKey } from "../list-types"
import { matchesFilter } from "../list-utils"

export function useFilteredProjects(
  projects: ProjetoItem[],
  filter: FilterKey,
  query: string,
): ProjetoItem[] {
  return useMemo(() => {
    return projects
      .filter((p) => matchesFilter(p.status, filter))
      .filter((p) =>
        query.trim() === ""
          ? true
          : p.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
  }, [projects, filter, query])
}
