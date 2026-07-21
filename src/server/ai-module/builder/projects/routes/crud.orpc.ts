/**
 * Builder Projects/CRUD — porta mecânica para oRPC (lote B1 do builder).
 *
 * Origem: ./crud.routes.ts (9 actions). Repository e helpers REUSADOS;
 * deriveProjectName e a leitura dos cookies de feature-flag copiados 1:1
 * (route-local no original).
 *
 * URLs (basePath /api/v1 + controller /builder + action):
 *   listProjects        GET    /builder/projects
 *   getProject          GET    /builder/projects/:id
 *   createProject       POST   /builder/projects/create
 *   deleteProject       DELETE /builder/projects/:id
 *   renameProject       PATCH  /builder/projects/:id/rename
 *   archiveProject      PATCH  /builder/projects/:id/archive
 *   unarchiveProject    PATCH  /builder/projects/:id/unarchive
 *   duplicateProject    POST   /builder/projects/:id/duplicate
 *   updateAgentSettings PATCH  /builder/projects/:id/agent-settings
 *
 * Shapes: response.json({success,...}) e response.success(x) -> ok(...).
 * Validação de params/query passa para .input() (status 400 preservado;
 * corpo de erro no shape oRPC — delta aceito).
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { getDatabase } from '@/server/services/database'
import {
  getAgentRuntimeSettingsFromMetadata,
  normalizeAgentRuntimeSettings,
} from '@/lib/agent-runtime-settings'
import { BUILDER_V2_OVERRIDE_COOKIE } from '@/lib/feature-flags/builder-v2'
import { BUILDER_MISSION_FIRST_OVERRIDE_COOKIE } from '@/lib/feature-flags/builder-mission-first'
import {
  listProjectsQuerySchema,
  createProjectInputSchema,
} from '../../builder.schemas'
import { builderProjectRepository } from '../projects.repository'
import {
  agentRuntimeSettingsPatchSchema,
  applyAgentRuntimeSettingsPatch,
} from './agent-settings-patch'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'

const projectIdParam = { id: z.string().uuid('ID de projeto inválido') }

// ---------------------------------------------------------------------------
// Derivação de nome (FR-04) — cópia 1:1 de crud.routes.ts
// ---------------------------------------------------------------------------
const URL_IN_NAME_PATTERN = /(?:https?:\/\/|www\.)\S+/gi
const DERIVED_NAME_MAX = 40
const DERIVED_NAME_FALLBACK = 'Novo agente'

function usefulChars(value: string): number {
  return (value.match(/[\p{L}\p{N}]/gu) ?? []).length
}

export function deriveProjectName(prompt: string): string {
  const firstLine = prompt.split('\n')[0] ?? ''
  const withoutUrls = firstLine
    .replace(URL_IN_NAME_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (usefulChars(withoutUrls) < 3) return DERIVED_NAME_FALLBACK
  if (withoutUrls.length <= DERIVED_NAME_MAX) return withoutUrls

  const slice = withoutUrls.slice(0, DERIVED_NAME_MAX + 1)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = (
    lastSpace > 0 ? slice.slice(0, lastSpace) : withoutUrls.slice(0, DERIVED_NAME_MAX)
  )
    .replace(/[\s\p{P}]+$/gu, '')
    .trim()

  return usefulChars(cut) >= 3 ? cut : DERIVED_NAME_FALLBACK
}

function readOverrideCookie(headers: Headers, cookieName: string): string | null {
  const cookieHeader = headers.get('cookie') ?? ''
  const value = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${cookieName}=`))
    ?.split('=')
    .slice(1)
    .join('=')
  return value ?? null
}

/** Guarda comum dos handlers do builder: user + org ativos. */
export function builderOrg(context: { auth: { session: { user: unknown } } }): {
  userId: string
  orgId: string
} {
  const user = context.auth.session.user as {
    id: string
    currentOrgId?: string | null
  } | null
  if (!user) throw new ORPCError('UNAUTHORIZED', { message: 'Não autenticado' })
  if (!user.currentOrgId) {
    throw new ORPCError('BAD_REQUEST', { message: 'Organização não selecionada' })
  }
  return { userId: user.id, orgId: user.currentOrgId }
}

const authed = base.use(authOrApiKey)

// ==========================================
// LIST — GET /builder/projects
// ==========================================
export const listProjects = authed
  .route({ method: 'GET', path: '/builder/projects', summary: 'List Builder Projects' })
  .input(listProjectsQuerySchema)
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const { data, total } = await builderProjectRepository.listForOrg({
      organizationId: orgId,
      type: input.type,
      status: input.status,
      limit: input.limit,
      offset: input.offset,
    })

    return ok({ success: true, data, total })
  })

// ==========================================
// GET — GET /builder/projects/{id}
// ==========================================
export const getProject = authed
  .route({ method: 'GET', path: '/builder/projects/{id}', summary: 'Get Builder Project' })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const project = await builderProjectRepository.findByIdForOrg(input.id, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    return ok({ success: true, data: project })
  })

// ==========================================
// CREATE — POST /builder/projects/create
// ==========================================
export const createProject = authed
  .route({ method: 'POST', path: '/builder/projects/create', summary: 'Create Builder Project' })
  .input(createProjectInputSchema)
  .handler(async ({ input, context }) => {
    const { userId, orgId } = builderOrg(context)
    const { prompt, type } = input

    try {
      const name = deriveProjectName(prompt)

      const { project, conversation } =
        await builderProjectRepository.createWithInitialMessage({
          organizationId: orgId,
          userId,
          prompt,
          type,
          name,
          builderV2OverrideCookie: readOverrideCookie(
            context.headers,
            BUILDER_V2_OVERRIDE_COOKIE,
          ),
          missionFirstOverrideCookie: readOverrideCookie(
            context.headers,
            BUILDER_MISSION_FIRST_OVERRIDE_COOKIE,
          ),
        })

      return ok({
        success: true,
        data: { projectId: project.id, conversationId: conversation.id },
        message: 'Projeto criado',
      })
    } catch (error: unknown) {
      console.error('[projectsRoutes.createProject] Erro ao criar projeto:', error)
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      throw new ORPCError('BAD_REQUEST', { message: `Erro ao criar projeto: ${message}` })
    }
  })

// ==========================================
// DELETE — DELETE /builder/projects/{id}
// ==========================================
export const deleteProject = authed
  .route({ method: 'DELETE', path: '/builder/projects/{id}', summary: 'Delete Builder Project' })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    try {
      const deleted = await builderProjectRepository.hardDelete(input.id, orgId)
      if (!deleted) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

      return ok({
        success: true,
        data: { id: deleted.id },
        message: 'Projeto excluído permanentemente',
      })
    } catch (error: unknown) {
      if (error instanceof ORPCError) throw error
      console.error('[projectsRoutes.deleteProject] Erro ao excluir projeto:', error)
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      throw new ORPCError('BAD_REQUEST', { message: `Erro ao excluir projeto: ${message}` })
    }
  })

// ==========================================
// RENAME — PATCH /builder/projects/{id}/rename
// ==========================================
export const renameProject = authed
  .route({ method: 'PATCH', path: '/builder/projects/{id}/rename', summary: 'Rename Builder Project' })
  .input(
    z.object({
      ...projectIdParam,
      name: z.string().min(1, 'Nome obrigatório').max(100, 'Máximo 100 caracteres').trim(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    try {
      const updated = await builderProjectRepository.rename(input.id, orgId, input.name)
      if (!updated) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

      return ok({ success: true, data: updated, message: 'Projeto renomeado' })
    } catch (error: unknown) {
      if (error instanceof ORPCError) throw error
      console.error('[projectsRoutes.renameProject] Erro:', error)
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      throw new ORPCError('BAD_REQUEST', { message: `Erro ao renomear projeto: ${message}` })
    }
  })

// ==========================================
// ARCHIVE / UNARCHIVE — PATCH /builder/projects/{id}/(un)archive
// ==========================================
export const archiveProject = authed
  .route({ method: 'PATCH', path: '/builder/projects/{id}/archive', summary: 'Archive Builder Project' })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    try {
      const updated = await builderProjectRepository.archive(input.id, orgId)
      if (!updated) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

      return ok({
        success: true,
        data: { id: updated.id, status: updated.status, archivedAt: updated.archivedAt },
        message: 'Projeto arquivado',
      })
    } catch (error: unknown) {
      if (error instanceof ORPCError) throw error
      console.error('[projectsRoutes.archiveProject] Erro:', error)
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      throw new ORPCError('BAD_REQUEST', { message: `Erro ao arquivar projeto: ${message}` })
    }
  })

export const unarchiveProject = authed
  .route({ method: 'PATCH', path: '/builder/projects/{id}/unarchive', summary: 'Unarchive Builder Project' })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    try {
      const updated = await builderProjectRepository.unarchive(input.id, orgId)
      if (!updated) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

      return ok({
        success: true,
        data: { id: updated.id, status: updated.status, archivedAt: updated.archivedAt },
        message: 'Projeto restaurado',
      })
    } catch (error: unknown) {
      if (error instanceof ORPCError) throw error
      console.error('[projectsRoutes.unarchiveProject] Erro:', error)
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      throw new ORPCError('BAD_REQUEST', { message: `Erro ao restaurar projeto: ${message}` })
    }
  })

// ==========================================
// DUPLICATE — POST /builder/projects/{id}/duplicate
// ==========================================
export const duplicateProject = authed
  .route({ method: 'POST', path: '/builder/projects/{id}/duplicate', summary: 'Duplicate Builder Project' })
  .input(z.object({ ...projectIdParam, name: z.string().min(1).max(100).trim().optional() }))
  .handler(async ({ input, context }) => {
    const { userId, orgId } = builderOrg(context)

    try {
      const newProject = await builderProjectRepository.duplicate(
        input.id,
        orgId,
        userId,
        input.name,
      )
      if (!newProject) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

      return ok({
        success: true,
        data: { id: newProject.id, name: newProject.name },
        message: 'Projeto duplicado',
      })
    } catch (error: unknown) {
      if (error instanceof ORPCError) throw error
      console.error('[projectsRoutes.duplicateProject] Erro:', error)
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      throw new ORPCError('BAD_REQUEST', { message: `Erro ao duplicar projeto: ${message}` })
    }
  })

// ==========================================
// AGENT SETTINGS — PATCH /builder/projects/{id}/agent-settings
// ==========================================
export const updateAgentSettings = authed
  .route({
    method: 'PATCH',
    path: '/builder/projects/{id}/agent-settings',
    summary: 'Update Agent Runtime Settings',
  })
  .input(agentRuntimeSettingsPatchSchema.extend(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const { id, ...patch } = input

    try {
      // PATCH parcial REAL: lê o estado atual e aplica o patch sobre ele
      const projectRow = await getDatabase().builderProject.findFirst({
        where: { id, organizationId: orgId },
        select: {
          metadata: true,
          aiAgent: {
            select: {
              enableTTS: true,
              ttsProvider: true,
              ttsVoiceId: true,
              ttsModel: true,
              ttsSpeechRate: true,
            },
          },
        },
      })
      if (!projectRow) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

      const current = normalizeAgentRuntimeSettings(
        getAgentRuntimeSettingsFromMetadata(projectRow.metadata),
        projectRow.aiAgent,
      )
      const merged = applyAgentRuntimeSettingsPatch(current, patch)

      const settings = await builderProjectRepository.updateAgentRuntimeSettings(
        id,
        orgId,
        merged,
      )
      if (!settings) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

      return ok({
        success: true,
        data: settings,
        message: 'Configurações do agente atualizadas',
      })
    } catch (error: unknown) {
      if (error instanceof ORPCError) throw error
      console.error('[projectsRoutes.updateAgentSettings] Erro:', error)
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      throw new ORPCError('BAD_REQUEST', { message: `Erro ao atualizar configurações: ${message}` })
    }
  })

export const crudActions = {
  listProjects,
  getProject,
  createProject,
  deleteProject,
  renameProject,
  archiveProject,
  unarchiveProject,
  duplicateProject,
  updateAgentSettings,
}
