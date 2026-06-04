/**
 * Helpers compartilhados das knowledge routes (status + sources).
 *
 * Coleção é org-scoped (unique org+name); por projeto usamos name `kb:${projectId}`
 * e guardamos o id em BuilderProject.metadata.knowledgeCollectionId + setamos
 * AIAgentConfig.ragCollectionId (alvo real do campo antes morto).
 */

import { getDatabase } from '@/server/services/database'

export type AuthedUser = { id: string; currentOrgId?: string | null }

export interface ProjectRow {
  id: string
  aiAgentId: string | null
  metadata: unknown
}

export function collectionNameFor(projectId: string): string {
  return `kb:${projectId}`
}

export function metaCollectionId(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object' && 'knowledgeCollectionId' in metadata) {
    const v = (metadata as Record<string, unknown>).knowledgeCollectionId
    return typeof v === 'string' ? v : null
  }
  return null
}

export async function loadProject(
  projectId: string,
  organizationId: string,
): Promise<ProjectRow | null> {
  const db = getDatabase()
  return db.builderProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, aiAgentId: true, metadata: true },
  })
}

/** Resolve a coleção do projeto (agente.ragCollectionId → metadata → null). */
export async function resolveCollectionId(
  project: ProjectRow,
  organizationId: string,
): Promise<string | null> {
  const db = getDatabase()
  if (project.aiAgentId) {
    const agent = await db.aIAgentConfig.findUnique({
      where: { id: project.aiAgentId },
      select: { ragCollectionId: true },
    })
    if (agent?.ragCollectionId) return agent.ragCollectionId
  }
  const fromMeta = metaCollectionId(project.metadata)
  if (fromMeta) {
    const exists = await db.knowledgeCollection.findFirst({
      where: { id: fromMeta, organizationId },
      select: { id: true },
    })
    if (exists) return exists.id
  }
  return null
}

/** Persiste o collectionId no metadata do projeto + liga ao agente (ragCollectionId+useRAG). */
async function wireCollectionToProject(
  project: ProjectRow,
  collectionId: string,
): Promise<void> {
  const db = getDatabase()
  const baseMeta =
    project.metadata && typeof project.metadata === 'object'
      ? (project.metadata as Record<string, unknown>)
      : {}
  await db.builderProject.update({
    where: { id: project.id },
    data: { metadata: { ...baseMeta, knowledgeCollectionId: collectionId } as object },
  })
  if (project.aiAgentId) {
    await db.aIAgentConfig.update({
      where: { id: project.aiAgentId },
      data: { ragCollectionId: collectionId, useRAG: true },
    })
  }
}

/** Cria (idempotente) a coleção do projeto e a vincula. Retorna o id. */
export async function ensureCollection(
  project: ProjectRow,
  organizationId: string,
  description?: string,
): Promise<{ id: string; name: string; description: string | null; isActive: boolean }> {
  const db = getDatabase()
  const name = collectionNameFor(project.id)
  const collection = await db.knowledgeCollection.upsert({
    where: { organizationId_name: { organizationId, name } },
    create: {
      organizationId,
      name,
      description: description ?? 'Base de conhecimento do projeto',
    },
    update: { isActive: true },
    select: { id: true, name: true, description: true, isActive: true },
  })
  await wireCollectionToProject(project, collection.id)
  return collection
}

/** Resolve a coleção existente ou cria na hora (adicionar fonte já cria a base). */
export async function ensureCollectionIdOrThrow(
  project: ProjectRow,
  organizationId: string,
): Promise<string> {
  const existing = await resolveCollectionId(project, organizationId)
  if (existing) return existing
  const created = await ensureCollection(project, organizationId)
  return created.id
}
