import type { Prisma } from '@prisma/client'
import { getDatabase } from '@/server/services/database'

// Shared data access layer for BuilderProject reads used by RSC pages.
// Defensive against Turbopack dev cache serving a stale PrismaClient
// without the delegates — degrades to [] / null instead of crashing.

export interface RecentProject {
  id: string
  name: string
  status: string
  type: string
}

const projectListSelect = {
  id: true,
  name: true,
  type: true,
  status: true,
  updatedAt: true,
  aiAgentId: true,
} satisfies Prisma.BuilderProjectSelect

export type BuilderProjectListItem = Prisma.BuilderProjectGetPayload<{
  select: typeof projectListSelect
}>

const projectDetailInclude = {
  aiAgent: {
    select: {
      id: true,
      name: true,
      systemPrompt: true,
      provider: true,
      model: true,
    },
  },
} satisfies Prisma.BuilderProjectInclude

export type ProjectDetail = Prisma.BuilderProjectGetPayload<{
  include: typeof projectDetailInclude
}>

type LooseDb = {
  builderProject?: {
    findMany?: (args: unknown) => Promise<unknown>
    findFirst?: (args: unknown) => Promise<unknown>
  }
  builderProjectMessage?: {
    findMany?: (args: unknown) => Promise<unknown>
  }
}

function hasBuilderProject(db: LooseDb): boolean {
  return (
    !!db.builderProject &&
    typeof db.builderProject.findMany === 'function' &&
    typeof db.builderProject.findFirst === 'function'
  )
}

function hasBuilderProjectMessage(db: LooseDb): boolean {
  return (
    !!db.builderProjectMessage &&
    typeof db.builderProjectMessage.findMany === 'function'
  )
}

/**
 * Recent projects for sidebar + home. Select is narrow on purpose — if you
 * need more fields create a new query rather than widening this one.
 */
export async function listRecentProjects(
  organizationId: string,
  limit = 7,
): Promise<RecentProject[]> {
  const db = getDatabase() as unknown as LooseDb
  if (!hasBuilderProject(db)) return []

  try {
    const rows = (await db.builderProject!.findMany!({
      where: { organizationId, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { id: true, name: true, status: true, type: true },
    })) as RecentProject[]
    return rows
  } catch (err) {
    console.error('[builder-projects] listRecentProjects failed', err)
    return []
  }
}

/**
 * Full list for /projetos page. Select is wider (includes updatedAt,
 * type, aiAgentId) to drive the list UI.
 */
export async function listOrgProjects(
  organizationId: string,
): Promise<BuilderProjectListItem[]> {
  const db = getDatabase() as unknown as LooseDb
  if (!hasBuilderProject(db)) return []

  try {
    const rows = (await db.builderProject!.findMany!({
      where: { organizationId, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: projectListSelect,
    })) as BuilderProjectListItem[]
    return rows
  } catch (err) {
    console.error('[builder-projects] listOrgProjects failed', err)
    return []
  }
}

/**
 * Detail page read. Scopes by org + soft-delete and includes the attached
 * aiAgent (id/name/systemPrompt/provider/model). Returns null if not found.
 */
export async function getProjectDetail(
  projectId: string,
  organizationId: string,
): Promise<ProjectDetail | null> {
  const db = getDatabase() as unknown as LooseDb
  if (!hasBuilderProject(db)) return null

  try {
    const project = (await db.builderProject!.findFirst!({
      where: { id: projectId, organizationId, archivedAt: null },
      include: projectDetailInclude,
    })) as ProjectDetail | null
    return project ?? null
  } catch (err) {
    console.error('[builder-projects] getProjectDetail failed', err)
    return null
  }
}

export interface InitialMessageRow {
  id: string
  role: string
  content: string
  toolCalls: unknown
  createdAt: Date
}

/**
 * Initial chat messages for the 1:1 conversation of a project (oldest first).
 */
export async function getInitialMessages(
  projectId: string,
  limit = 50,
): Promise<InitialMessageRow[]> {
  const db = getDatabase() as unknown as LooseDb
  if (!hasBuilderProjectMessage(db)) return []

  try {
    const rows = (await db.builderProjectMessage!.findMany!({
      where: { conversation: { projectId } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        toolCalls: true,
        createdAt: true,
      },
    })) as InitialMessageRow[]
    return rows
  } catch (err) {
    console.error('[builder-projects] getInitialMessages failed', err)
    return []
  }
}
