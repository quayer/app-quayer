/**
 * Departments — porta mecânica do controller para oRPC (Igniter -> oRPC).
 *
 * Origem: ./departments.routes.ts (5 actions). Primeiro controller COLOCALIZADO
 * (decisão 2026-07-21: router junto do módulo que substitui; src/orpc guarda só
 * base/middlewares/router raiz).
 *
 * Preservação de URL (basePath /api/v1 + controller /departments + action):
 *   list          GET    /api/v1/departments
 *   create        POST   /api/v1/departments               (201)
 *   listMembers   GET    /api/v1/departments/:id/members
 *   addMember     POST   /api/v1/departments/:id/members   (201)
 *   removeMember  DELETE /api/v1/departments/:id/members/:userId
 *
 * Shapes de sucesso preservados via ok() (envelope Igniter { data, error }):
 * response.success/created(x) -> ok(x); o caminho degradado de listMembers
 * (delegate ausente) preserva o response.json({success,data,warning}).
 * Erros: status codes preservados (400/401/404/503); corpo de erro tem o
 * shape do oRPC (delta aceito, ver src/orpc/envelope.ts).
 *
 * Multi-tenant: TODA query filtra por organizationId do contexto autenticado
 * (session OU api key — middleware authOrApiKey). O cliente nunca informa
 * organizationId. Mesma resiliência do original para o delegate
 * DepartmentMember ausente (migration sob gate).
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import {
  createDepartmentSchema,
  listDepartmentsQuerySchema,
  addMemberSchema,
} from './departments.schemas'

// ──────────────────────────────────────────────────────────────────────────
// Helpers copiados 1:1 do departments.routes.ts (delegate defensivo + contexto)
// ──────────────────────────────────────────────────────────────────────────

type DepartmentMemberRow = {
  id: string
  organizationId: string
  departmentId: string
  userId: string
  position: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

type DepartmentMemberDelegate = {
  findMany: (args: {
    where: Record<string, unknown>
    orderBy?: Record<string, unknown> | Array<Record<string, unknown>>
    include?: Record<string, unknown>
  }) => Promise<DepartmentMemberRow[]>
  findUnique: (args: {
    where: Record<string, unknown>
  }) => Promise<DepartmentMemberRow | null>
  create: (args: { data: Record<string, unknown> }) => Promise<DepartmentMemberRow>
  update: (args: {
    where: Record<string, unknown>
    data: Record<string, unknown>
  }) => Promise<DepartmentMemberRow>
  delete: (args: { where: Record<string, unknown> }) => Promise<DepartmentMemberRow>
}

function getDepartmentMember(): DepartmentMemberDelegate | null {
  const delegate = (database as unknown as {
    departmentMember?: DepartmentMemberDelegate
  }).departmentMember
  return delegate ?? null
}

function orgIdOf(user: unknown): string | null {
  return (user as { currentOrgId?: string | null } | undefined)?.currentOrgId ?? null
}

/** Builder autenticado — equivale a `use: [authOrApiKeyProcedure({ required: true })]`. */
const authed = base.use(authOrApiKey)

// ──────────────────────────────────────────────────────────────────────────
// LIST — GET /departments
// ──────────────────────────────────────────────────────────────────────────
export const list = authed
  .route({
    method: 'GET',
    path: '/departments',
    summary: 'List Departments',
    description:
      'Lista departamentos da organização ativa (filtros opcionais por type/isActive).',
  })
  .input(listDepartmentsQuerySchema)
  .handler(async ({ input, context }) => {
    const orgId = orgIdOf(context.auth.session.user)
    if (!orgId) throw new ORPCError('BAD_REQUEST', { message: 'Organização não selecionada' })

    const limit = Math.min(input?.limit ?? 50, 100)
    const offset = input?.offset ?? 0

    const where: Record<string, unknown> = { organizationId: orgId }
    if (input?.type) where.type = input.type
    if (typeof input?.isActive === 'boolean') where.isActive = input.isActive

    const departments = await database.department.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })

    return ok({ data: departments })
  })

// ──────────────────────────────────────────────────────────────────────────
// CREATE — POST /departments (201)
// ──────────────────────────────────────────────────────────────────────────
export const create = authed
  .route({
    method: 'POST',
    path: '/departments',
    successStatus: 201,
    summary: 'Create Department',
    description: 'Cria um departamento na organização ativa (slug único por org).',
  })
  .input(createDepartmentSchema)
  .handler(async ({ input, context }) => {
    const orgId = orgIdOf(context.auth.session.user)
    if (!orgId) throw new ORPCError('BAD_REQUEST', { message: 'Organização não selecionada' })

    const { name, slug, description, type, isActive } = input

    // Defesa em profundidade: respeita @@unique([organizationId, slug]).
    const existing = await database.department.findFirst({
      where: { organizationId: orgId, slug },
      select: { id: true },
    })
    if (existing) {
      throw new ORPCError('BAD_REQUEST', {
        message: `Já existe um departamento com o slug "${slug}"`,
      })
    }

    try {
      const department = await database.department.create({
        data: {
          organizationId: orgId,
          name,
          slug,
          description,
          type,
          isActive,
        },
      })
      return ok({ data: department })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[departments/create] Falha:', err)
      throw new ORPCError('BAD_REQUEST', { message: `Erro ao criar departamento: ${message}` })
    }
  })

// ──────────────────────────────────────────────────────────────────────────
// LIST MEMBERS — GET /departments/{id}/members
// ──────────────────────────────────────────────────────────────────────────
export const listMembers = authed
  .route({
    method: 'GET',
    path: '/departments/{id}/members',
    summary: 'List Department Members',
    description:
      'Lista os membros (atendentes) de um departamento, na ordem da roleta (position asc).',
  })
  .input(z.object({ id: z.string().min(1, 'id do departamento obrigatório') }))
  .handler(async ({ input, context }) => {
    const orgId = orgIdOf(context.auth.session.user)
    if (!orgId) throw new ORPCError('BAD_REQUEST', { message: 'Organização não selecionada' })

    // Posse: o departamento precisa pertencer à org ativa.
    const department = await database.department.findFirst({
      where: { id: input.id, organizationId: orgId },
      select: { id: true },
    })
    if (!department) throw new ORPCError('NOT_FOUND', { message: 'Departamento não encontrado' })

    const delegate = getDepartmentMember()
    if (!delegate) {
      console.warn('[departments/listMembers] DepartmentMember indisponível')
      // Original: response.json({ success, data, warning }) — status 200.
      return ok({
        success: true,
        data: [] as DepartmentMemberRow[],
        warning: 'DepartmentMember table not available',
      })
    }

    const members = await delegate.findMany({
      // Filtro redundante por organizationId (defesa em profundidade).
      where: { departmentId: input.id, organizationId: orgId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    })

    return ok({ data: members })
  })

// ──────────────────────────────────────────────────────────────────────────
// ADD MEMBER — POST /departments/{id}/members (201)
// ──────────────────────────────────────────────────────────────────────────
export const addMember = authed
  .route({
    method: 'POST',
    path: '/departments/{id}/members',
    successStatus: 201,
    summary: 'Add Department Member',
    description:
      'Adiciona (ou atualiza position/isActive de) um atendente na roleta do departamento.',
  })
  // Path param {id} + body (addMemberSchema) — o oRPC funde ambos no input.
  .input(addMemberSchema.extend({ id: z.string().min(1, 'id do departamento obrigatório') }))
  .handler(async ({ input, context }) => {
    const orgId = orgIdOf(context.auth.session.user)
    if (!orgId) throw new ORPCError('BAD_REQUEST', { message: 'Organização não selecionada' })

    const { id: departmentId, userId, position, isActive } = input

    // Posse: departamento da org ativa.
    const department = await database.department.findFirst({
      where: { id: departmentId, organizationId: orgId },
      select: { id: true },
    })
    if (!department) throw new ORPCError('NOT_FOUND', { message: 'Departamento não encontrado' })

    // O atendente precisa ser membro ATIVO da MESMA org (multi-tenant).
    const membership = await database.userOrganization.findFirst({
      where: { userId, organizationId: orgId, isActive: true },
      select: { id: true },
    })
    if (!membership) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Usuário não pertence à organização ativa (ou está inativo)',
      })
    }

    const delegate = getDepartmentMember()
    if (!delegate) {
      throw new ORPCError('SERVICE_UNAVAILABLE', {
        status: 503,
        message: 'DepartmentMember indisponível — migration não provisionada',
      })
    }

    try {
      // Upsert manual por @@unique([departmentId, userId]).
      const existing = await delegate.findUnique({
        where: { departmentId_userId: { departmentId, userId } },
      })

      const member = existing
        ? await delegate.update({
            where: { departmentId_userId: { departmentId, userId } },
            data: { position, isActive },
          })
        : await delegate.create({
            data: {
              organizationId: orgId,
              departmentId,
              userId,
              position,
              isActive,
            },
          })

      return ok({ data: member })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[departments/addMember] Falha:', err)
      throw new ORPCError('BAD_REQUEST', { message: `Erro ao adicionar membro: ${message}` })
    }
  })

// ──────────────────────────────────────────────────────────────────────────
// REMOVE MEMBER — DELETE /departments/{id}/members/{userId}
// ──────────────────────────────────────────────────────────────────────────
export const removeMember = authed
  .route({
    method: 'DELETE',
    path: '/departments/{id}/members/{userId}',
    summary: 'Remove Department Member',
    description: 'Remove um atendente da roleta do departamento.',
  })
  .input(
    z.object({
      id: z.string().min(1, 'id do departamento obrigatório'),
      userId: z.string().min(1, 'userId obrigatório'),
    }),
  )
  .handler(async ({ input, context }) => {
    const user = context.auth.session.user
    const orgId = orgIdOf(user)
    if (!orgId) throw new ORPCError('BAD_REQUEST', { message: 'Organização não selecionada' })
    // Garante contexto autenticado consistente (defesa adicional do original).
    if (!user?.id) throw new ORPCError('UNAUTHORIZED', { message: 'Não autenticado' })

    const { id: departmentId, userId } = input

    // Posse: departamento da org ativa.
    const department = await database.department.findFirst({
      where: { id: departmentId, organizationId: orgId },
      select: { id: true },
    })
    if (!department) throw new ORPCError('NOT_FOUND', { message: 'Departamento não encontrado' })

    const delegate = getDepartmentMember()
    if (!delegate) {
      throw new ORPCError('SERVICE_UNAVAILABLE', {
        status: 503,
        message: 'DepartmentMember indisponível — migration não provisionada',
      })
    }

    // Confere existência E pertencimento à org antes de deletar.
    const existing = await delegate.findUnique({
      where: { departmentId_userId: { departmentId, userId } },
    })
    if (!existing || existing.organizationId !== orgId) {
      throw new ORPCError('NOT_FOUND', { message: 'Membro não encontrado neste departamento' })
    }

    try {
      await delegate.delete({
        where: { departmentId_userId: { departmentId, userId } },
      })
      return ok({ success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[departments/removeMember] Falha:', err)
      throw new ORPCError('BAD_REQUEST', { message: `Erro ao remover membro: ${message}` })
    }
  })

/** Namespace espelhando o controller (api.departments.* no client Igniter). */
export const departments = {
  list,
  create,
  listMembers,
  addMember,
  removeMember,
}
