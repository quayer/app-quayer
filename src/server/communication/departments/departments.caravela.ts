/**
 * Departments em caravela.* — O DOGFOOD do @caravela/core (SPEC-CORE §9).
 *
 * Substitui departments.orpc.ts no appRouter com o MESMO wire (URLs,
 * envelope ok(), statuses). O que mudou é o que o framework absorveu:
 *
 *   ANTES (oRPC cru)                      AGORA (caravela.*)
 *   base.use(authOrApiKey)            →   security.authentication (por tipo)
 *   guard manual user/currentOrgId    →   ctx.user/ctx.org não-nulos por TIPO
 *   where: { organizationId: orgId }  →   ctx.db JÁ escopado (injeção)
 *   data: { organizationId: orgId }   →   idem no create
 *   sem audit                         →   mutations auditadas pelo pipeline
 *
 * O que continua sendo negócio (e fica): unicidade de slug, validação de
 * membership, degradação do delegate DepartmentMember (200+warning /503) e
 * a verificação de posse em lookups por chave única (BOLA intra-tenant é
 * do handler — SEGURANCA §4).
 */
import { CaravelaError } from '@caravela/core'
import { z } from 'zod'
import { caravela } from '@/caravela'
import { ok } from '@/orpc/envelope'
import {
  createDepartmentSchema,
  listDepartmentsQuerySchema,
  addMemberSchema,
} from './departments.schemas'

const idParam = { id: z.string().min(1, 'id do departamento obrigatório') }

// ──────────────────────────────────────────────────────────────────────────
// LIST — GET /departments
// ──────────────────────────────────────────────────────────────────────────
export const list = caravela.query({
  route: { method: 'GET', path: '/departments', summary: 'List Departments' },
  input: listDepartmentsQuerySchema,
  security: { authentication: 'sessionOrApiKey', tenantScope: 'organization' },
  handler: async ({ input, ctx }) => {
    const limit = Math.min(input?.limit ?? 50, 100)
    const offset = input?.offset ?? 0

    const where: Record<string, unknown> = {}
    if (input?.type) where.type = input.type
    if (typeof input?.isActive === 'boolean') where.isActive = input.isActive

    // org injetada pelo scope — o handler não conhece organizationId
    const departments = await ctx.db.department!.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })

    return ok({ data: departments })
  },
})

// ──────────────────────────────────────────────────────────────────────────
// CREATE — POST /departments
// ──────────────────────────────────────────────────────────────────────────
export const create = caravela.mutation({
  route: { method: 'POST', path: '/departments', successStatus: 201, summary: 'Create Department' },
  input: createDepartmentSchema,
  security: { authentication: 'sessionOrApiKey', tenantScope: 'organization' },
  handler: async ({ input, ctx }) => {
    const { name, slug, description, type, isActive } = input

    // Defesa em profundidade: respeita @@unique([organizationId, slug])
    const existing = await ctx.db.department!.findFirst({
      where: { slug },
      select: { id: true },
    })
    if (existing) {
      throw new CaravelaError('BAD_REQUEST', {
        message: `Já existe um departamento com o slug "${slug}"`,
      })
    }

    try {
      // organizationId injetada pelo scope no data
      const department = await ctx.db.department!.create({
        data: { name, slug, description, type, isActive },
      })
      ctx.audit.note({ slug })
      return ok({ data: department })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[departments/create] Falha:', err)
      throw new CaravelaError('BAD_REQUEST', {
        message: `Erro ao criar departamento: ${message}`,
      })
    }
  },
})

// ──────────────────────────────────────────────────────────────────────────
// LIST MEMBERS — GET /departments/{id}/members
// ──────────────────────────────────────────────────────────────────────────
export const listMembers = caravela.query({
  route: { method: 'GET', path: '/departments/{id}/members', summary: 'List Department Members' },
  input: z.object(idParam),
  security: { authentication: 'sessionOrApiKey', tenantScope: 'organization' },
  handler: async ({ input, ctx }) => {
    // Posse: o departamento precisa estar na org (scope injeta o filtro)
    const department = await ctx.db.department!.findFirst({
      where: { id: input.id },
      select: { id: true },
    })
    if (!department) {
      throw new CaravelaError('NOT_FOUND', { message: 'Departamento não encontrado' })
    }

    // Degradação: delegate ausente (migration não landou) -> lista vazia
    const delegate = ctx.db.departmentMember
    if (!delegate) {
      console.warn('[departments/listMembers] DepartmentMember indisponível')
      return ok({
        success: true,
        data: [] as unknown[],
        warning: 'DepartmentMember table not available',
      })
    }

    const members = await delegate.findMany({
      where: { departmentId: input.id },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    })

    return ok({ data: members })
  },
})

// ──────────────────────────────────────────────────────────────────────────
// ADD MEMBER — POST /departments/{id}/members (201)
// ──────────────────────────────────────────────────────────────────────────
export const addMember = caravela.mutation({
  route: {
    method: 'POST',
    path: '/departments/{id}/members',
    successStatus: 201,
    summary: 'Add Department Member',
  },
  input: addMemberSchema.extend(idParam),
  security: { authentication: 'sessionOrApiKey', tenantScope: 'organization' },
  handler: async ({ input, ctx }) => {
    const { id: departmentId, userId, position, isActive } = input

    const department = await ctx.db.department!.findFirst({
      where: { id: departmentId },
      select: { id: true },
    })
    if (!department) {
      throw new CaravelaError('NOT_FOUND', { message: 'Departamento não encontrado' })
    }

    // O atendente precisa ser membro ATIVO da MESMA org (scope injeta a org)
    const membership = await ctx.db.userOrganization!.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    })
    if (!membership) {
      throw new CaravelaError('BAD_REQUEST', {
        message: 'Usuário não pertence à organização ativa (ou está inativo)',
      })
    }

    const delegate = ctx.db.departmentMember
    if (!delegate) {
      throw new CaravelaError('SERVICE_UNAVAILABLE', {
        message: 'DepartmentMember indisponível — migration não provisionada',
      })
    }

    try {
      // Upsert manual por @@unique([departmentId, userId]) — lookup por
      // chave única passa direto pelo scope (posse já verificada acima)
      const existing = await delegate.findUnique({
        where: { departmentId_userId: { departmentId, userId } },
      })

      const member = existing
        ? await delegate.update({
            where: { departmentId_userId: { departmentId, userId } },
            data: { position, isActive },
          })
        : await delegate.create({
            data: { departmentId, userId, position, isActive },
          })

      ctx.audit.note({ departmentId, memberUserId: userId })
      return ok({ data: member })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[departments/addMember] Falha:', err)
      throw new CaravelaError('BAD_REQUEST', {
        message: `Erro ao adicionar membro: ${message}`,
      })
    }
  },
})

// ──────────────────────────────────────────────────────────────────────────
// REMOVE MEMBER — DELETE /departments/{id}/members/{userId}
// ──────────────────────────────────────────────────────────────────────────
export const removeMember = caravela.mutation({
  route: {
    method: 'DELETE',
    path: '/departments/{id}/members/{userId}',
    summary: 'Remove Department Member',
  },
  input: z.object({ ...idParam, userId: z.string().min(1, 'userId obrigatório') }),
  security: { authentication: 'sessionOrApiKey', tenantScope: 'organization' },
  handler: async ({ input, ctx }) => {
    const { id: departmentId, userId } = input

    const department = await ctx.db.department!.findFirst({
      where: { id: departmentId },
      select: { id: true },
    })
    if (!department) {
      throw new CaravelaError('NOT_FOUND', { message: 'Departamento não encontrado' })
    }

    const delegate = ctx.db.departmentMember
    if (!delegate) {
      throw new CaravelaError('SERVICE_UNAVAILABLE', {
        message: 'DepartmentMember indisponível — migration não provisionada',
      })
    }

    // Lookup por chave única: posse conferida contra ctx.org (BOLA
    // intra-tenant é responsabilidade do handler — SEGURANCA §4)
    const existing = (await delegate.findUnique({
      where: { departmentId_userId: { departmentId, userId } },
    })) as { organizationId?: string } | null
    if (!existing || existing.organizationId !== ctx.org.id) {
      throw new CaravelaError('NOT_FOUND', {
        message: 'Membro não encontrado neste departamento',
      })
    }

    try {
      await delegate.delete({
        where: { departmentId_userId: { departmentId, userId } },
      })
      ctx.audit.note({ departmentId, memberUserId: userId })
      return ok({ success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[departments/removeMember] Falha:', err)
      throw new CaravelaError('BAD_REQUEST', {
        message: `Erro ao remover membro: ${message}`,
      })
    }
  },
})

/** Namespace departments — MESMO shape do controller anterior no appRouter. */
export const departments = caravela.controller({
  name: 'departments',
  description: 'Device session listing and revocation — dogfood do @caravela/core',
  actions: { list, create, listMembers, addMember, removeMember },
}).actions
