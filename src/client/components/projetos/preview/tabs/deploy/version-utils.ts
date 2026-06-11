/**
 * version-utils — tipo + unwrap tolerante do payload de
 * `GET /api/v1/builder/projects/:id/versions`.
 *
 * Fonte ÚNICA de versões da tab Publicar: o deploy-tab carrega uma vez (query
 * `["project-versions", projectId]`) e distribui por prop para InstanceStep e
 * SummaryStep — invalidar essa key pós-publish/rollback atualiza tudo.
 */

/** Shape completo retornado pelo servidor (contrato de prompt.routes.ts). */
export interface VersionListItem {
  id: string
  versionNumber: number
  content: string
  description: string | null
  createdBy: "chat" | "manual" | "rollback"
  publishedAt: string | null
  publishedBy: { id: string; name: string } | null
  createdAt: string
}

/**
 * Desembrulha tolerante o envelope ({ data: { versions } }, { versions } ou
 * array-wrapped — mesma defesa de version-history/media-tab) e devolve as
 * versões ordenadas por versionNumber DESC.
 */
export function unwrapVersions(raw: unknown): VersionListItem[] {
  const rows = extractVersions(raw)
  return [...rows].sort((a, b) => b.versionNumber - a.versionNumber)
}

function extractVersions(raw: unknown): VersionListItem[] {
  if (raw === null || raw === undefined) return []
  if (Array.isArray(raw)) return extractVersions(raw[0])
  if (typeof raw !== "object") return []

  const obj = raw as { versions?: unknown; data?: unknown }
  if (Array.isArray(obj.versions)) return obj.versions as VersionListItem[]
  if ("data" in obj) return extractVersions(obj.data)
  return []
}
