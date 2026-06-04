/**
 * Departments — HTTP surface for Department CRUD + round-robin member mgmt.
 *
 * Suporta a tool `dispatch_to_agent` (roleta de atendimento por departamento):
 * o painel cadastra departamentos e seus membros (atendentes humanos); o runtime
 * usa esses dados para distribuir conversas em rodízio justo.
 *
 * Actions (montadas sob /departments pelo controller):
 *   GET    /departments                       — list (org-scoped, filtros opcionais)
 *   POST   /departments                       — create
 *   GET    /departments/:id/members           — list members da roleta
 *   POST   /departments/:id/members           — addMember (upsert por userId)
 *   DELETE /departments/:id/members/:userId   — removeMember
 *
 * Multi-tenant: TODA query filtra por organizationId do contexto autenticado
 * (user.currentOrgId). O cliente nunca informa organizationId.
 *
 * Resiliência (igual a deploy.routes.ts → getBuilderDeployment): o model
 * `DepartmentMember` e as colunas round-robin de `Department` chegam por uma
 * migration sob gate de aprovação. Enquanto a migration não landar, o delegate
 * `database.departmentMember` é `undefined`; por isso o acesso é guardado por
 * `getDepartmentMember()` e as rotas de membro degradam para 503 (em vez de
 * crashar). O CRUD base de Department funciona desde já (model legacy existente).
 */

import { igniter } from '@/igniter'
import { database } from '@/server/services/database'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import {
  createDepartmentSchema,
  listDepartmentsQuerySchema,
  addMemberSchema,
} from './departments.schemas'

// ──────────────────────────────────────────────────────────────────────────
// Tipos / helpers de delegate (defensivo — migration pode não ter landado)
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

/**
 * Acesso defensivo ao delegate departmentMember. Retorna `null` quando a
 * migration ainda não landou (delegate ausente no client gerado).
 */
function getDepartmentMember(): DepartmentMemberDelegate | null {
  const delegate = (database as unknown as {
    departmentMember?: DepartmentMemberDelegate
  }).departmentMember
  return delegate ?? null
}

/** Extrai a org ativa do contexto autenticado (session OU api key). */
function getOrgId(context: unknown): string | null {
  const user = (context as { auth?: { session?: { user?: { currentOrgId?: string | null } } } })
    .auth?.session?.user
  return user?.currentOrgId ?? null
}

/** Extrai o user.id do contexto autenticado. */
function getUserId(context: unknown): string | null {
  const user = (context as { auth?: { session?: { user?: { id?: string } } } })
    .auth?.session?.user
  return user?.id ?? null
}

// ──────────────────────────────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────────────────────────────

export const departmentsRoutes = {
  // ────────────────────────────────────────────────────────────────────────
  // GET /departments  — list (org-scoped, filtros opcionais)
  // ────────────────────────────────────────────────────────────────────────
  list: igniter.query({
    name: 'List Departments',
    description:
      'Lista departamentos da organização ativa (filtros opcionais por type/isActive).',
    path: '/',
    method: 'GET',
    query: listDepartmentsQuerySchema,
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const orgId = getOrgId(context)
      if (!orgId) return response.badRequest('Organização não selecionada')

      const query = request.query as
        | { type?: string; isActive?: boolean; limit?: number; offset?: number }
        | undefined

      const limit = Math.min(query?.limit ?? 50, 100)
      const offset = query?.offset ?? 0

      const where: Record<string, unknown> = { organizationId: orgId }
      if (query?.type) where.type = query.type
      if (typeof query?.isActive === 'boolean') where.isActive = query.isActive

      const departments = await database.department.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      })

      return response.success({ data: departments })
    },
  }),

  // ────────────────────────────────────────────────────────────────────────
  // POST /departments  — create
  // ────────────────────────────────────────────────────────────────────────
  create: igniter.mutation({
    name: 'Create Department',
    description: 'Cria um departamento na organização ativa (slug único por org).',
    path: '/',
    method: 'POST',
    body: createDepartmentSchema,
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const orgId = getOrgId(context)
      if (!orgId) return response.badRequest('Organização não selecionada')

      const { name, slug, description, type, isActive } = request.body

      // Defesa em profundidade: respeita @@unique([organizationId, slug]).
      const existing = await database.department.findFirst({
        where: { organizationId: orgId, slug },
        select: { id: true },
      })
      if (existing) {
        return response.badRequest(`Já existe um departamento com o slug "${slug}"`)
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
        return response.created({ data: department })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido'
        console.error('[departments/create] Falha:', err)
        return response.badRequest(`Erro ao criar departamento: ${message}`)
      }
    },
  }),

  // ────────────────────────────────────────────────────────────────────────
  // GET /departments/:id/members  — list members da roleta
  // ────────────────────────────────────────────────────────────────────────
  listMembers: igniter.query({
    name: 'List Department Members',
    description:
      'Lista os membros (atendentes) de um departamento, na ordem da roleta (position asc).',
    path: '/:id/members' as const,
    method: 'GET',
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const orgId = getOrgId(context)
      if (!orgId) return response.badRequest('Organização não selecionada')

      const params = request.params as { id?: string }
      const departmentId = params.id
      if (!departmentId) return response.badRequest('id do departamento obrigatório')

      // Posse: o departamento precisa pertencer à org ativa.
      const department = await database.department.findFirst({
        where: { id: departmentId, organizationId: orgId },
        select: { id: true },
      })
      if (!department) return response.notFound('Departamento não encontrado')

      const delegate = getDepartmentMember()
      if (!delegate) {
        console.warn('[departments/listMembers] DepartmentMember indisponível')
        return response.json({
          success: true,
          data: [],
          warning: 'DepartmentMember table not available',
        })
      }

      const members = await delegate.findMany({
        // Filtro redundante por organizationId (defesa em profundidade).
        where: { departmentId, organizationId: orgId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      })

      return response.success({ data: members })
    },
  }),

  // ────────────────────────────────────────────────────────────────────────
  // POST /departments/:id/members  — addMember (upsert por (departmentId,userId))
  // ────────────────────────────────────────────────────────────────────────
  addMember: igniter.mutation({
    name: 'Add Department Member',
    description:
      'Adiciona (ou atualiza position/isActive de) um atendente na roleta do departamento.',
    path: '/:id/members' as const,
    method: 'POST',
    body: addMemberSchema,
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const orgId = getOrgId(context)
      if (!orgId) return response.badRequest('Organização não selecionada')

      const params = request.params as { id?: string }
      const departmentId = params.id
      if (!departmentId) return response.badRequest('id do departamento obrigatório')

      const { userId, position, isActive } = request.body

      // Posse: departamento da org ativa.
      const department = await database.department.findFirst({
        where: { id: departmentId, organizationId: orgId },
        select: { id: true },
      })
      if (!department) return response.notFound('Departamento não encontrado')

      // O atendente precisa ser membro ATIVO da MESMA org (multi-tenant).
      const membership = await database.userOrganization.findFirst({
        where: { userId, organizationId: orgId, isActive: true },
        select: { id: true },
      })
      if (!membership) {
        return response.badRequest(
          'Usuário não pertence à organização ativa (ou está inativo)',
        )
      }

      const delegate = getDepartmentMember()
      if (!delegate) {
        return response.status(503).json({
          success: false,
          error: 'DepartmentMember indisponível — migration não provisionada',
        })
      }

      try {
        // Upsert manual por @@unique([departmentId, userId]): se já existe,
        // atualiza position/isActive; senão cria.
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

        return response.created({ data: member })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido'
        console.error('[departments/addMember] Falha:', err)
        return response.badRequest(`Erro ao adicionar membro: ${message}`)
      }
    },
  }),

  // ────────────────────────────────────────────────────────────────────────
  // DELETE /departments/:id/members/:userId  — removeMember
  // ────────────────────────────────────────────────────────────────────────
  removeMember: igniter.mutation({
    name: 'Remove Department Member',
    description: 'Remove um atendente da roleta do departamento.',
    path: '/:id/members/:userId' as const,
    method: 'DELETE',
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const orgId = getOrgId(context)
      if (!orgId) return response.badRequest('Organização não selecionada')
      // Garante contexto autenticado consistente (defesa adicional).
      if (!getUserId(context)) return response.unauthorized('Não autenticado')

      const params = request.params as { id?: string; userId?: string }
      const departmentId = params.id
      const userId = params.userId
      if (!departmentId) return response.badRequest('id do departamento obrigatório')
      if (!userId) return response.badRequest('userId obrigatório')

      // Posse: departamento da org ativa.
      const department = await database.department.findFirst({
        where: { id: departmentId, organizationId: orgId },
        select: { id: true },
      })
      if (!department) return response.notFound('Departamento não encontrado')

      const delegate = getDepartmentMember()
      if (!delegate) {
        return response.status(503).json({
          success: false,
          error: 'DepartmentMember indisponível — migration não provisionada',
        })
      }

      // Confere existência E pertencimento à org antes de deletar.
      const existing = await delegate.findUnique({
        where: { departmentId_userId: { departmentId, userId } },
      })
      if (!existing || existing.organizationId !== orgId) {
        return response.notFound('Membro não encontrado neste departamento')
      }

      try {
        await delegate.delete({
          where: { departmentId_userId: { departmentId, userId } },
        })
        return response.success({ success: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido'
        console.error('[departments/removeMember] Falha:', err)
        return response.badRequest(`Erro ao remover membro: ${message}`)
      }
    },
  }),
}
