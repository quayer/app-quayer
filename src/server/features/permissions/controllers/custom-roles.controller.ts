/**
 * Custom Roles Controller
 *
 * CRUD para roles customizados por organização.
 * Apenas masters da org podem gerenciar roles.
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { authProcedure } from '@/server/features/auth/procedures/auth.procedure'
import { Resource, Action } from '@/lib/auth/permissions'

// ==========================================
// Zod Schemas
// ==========================================

const resourceEnum = z.nativeEnum(Resource)
const actionEnum = z.nativeEnum(Action)

/**
 * Permissions JSON: { "resource_name": ["action1", "action2", ...] }
 */
const permissionsSchema = z.record(resourceEnum, z.array(actionEnum)).refine(
  (val) => Object.keys(val).length > 0,
  { message: 'Permissions must have at least one resource' }
)

const createCustomRoleSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().max(200).optional(),
  permissions: permissionsSchema,
  priority: z.number().int().min(1).max(2),
})

const updateCustomRoleSchema = z.object({
  name: z.string().min(3).max(50).optional(),
  description: z.string().max(200).optional().nullable(),
  permissions: permissionsSchema.optional(),
  priority: z.number().int().min(1).max(2).optional(),
})

const deleteCustomRoleSchema = z.object({
  force: z.boolean().optional().default(false),
  reassignToRoleId: z.string().uuid().optional(),
})

// ==========================================
// Helpers
// ==========================================

/**
 * Convert name to kebab-case slug
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s-]/g, '')   // remove special chars
    .replace(/\s+/g, '-')            // spaces to hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .replace(/^-|-$/g, '')           // trim hyphens
}

// ==========================================
// Controller
// ==========================================

export const customRolesController = igniter.controller({
  name: 'customRoles',
  path: '/custom-roles',
  description: 'Custom Roles CRUD — manage per-organization roles',
  actions: {
    // ==========================================
    // LIST — all custom roles for current org
    // ==========================================
    list: igniter.query({
      name: 'ListCustomRoles',
      description: 'List all custom roles for the current organization',
      path: '/',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        // Check org role >= master
        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem gerenciar roles')
        }

        const roles = await context.db.customRole.findMany({
          where: { organizationId: orgId },
          orderBy: { priority: 'desc' },
          include: {
            _count: {
              select: { userOrganizations: true },
            },
          },
        })

        return response.success(roles)
      },
    }),

    // ==========================================
    // CREATE — new custom role
    // ==========================================
    create: igniter.mutation({
      name: 'CreateCustomRole',
      description: 'Create a new custom role for the organization',
      path: '/',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: createCustomRoleSchema,
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem criar roles')
        }

        const { name, description, permissions, priority } = request.body

        // Generate slug
        const slug = toSlug(name)
        if (!slug) {
          return response.badRequest('Nome inválido para gerar slug')
        }

        // Check uniqueness
        const existing = await context.db.customRole.findUnique({
          where: { organizationId_slug: { organizationId: orgId, slug } },
        })
        if (existing) {
          return response.badRequest(`Já existe um role com slug "${slug}" nesta organização`)
        }

        const role = await context.db.customRole.create({
          data: {
            organizationId: orgId,
            name,
            slug,
            description: description || null,
            permissions: permissions as any,
            isSystem: false,
            priority,
          },
        })

        return response.created(role)
      },
    }),

    // ==========================================
    // GET — single role with user count
    // ==========================================
    get: igniter.query({
      name: 'GetCustomRole',
      description: 'Get custom role details with user count',
      path: '/:id',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem gerenciar roles')
        }

        const { id } = request.params as { id: string }

        const role = await context.db.customRole.findUnique({
          where: { id },
          include: {
            _count: {
              select: { userOrganizations: true },
            },
          },
        })

        if (!role) {
          return response.notFound('Role não encontrado')
        }

        // Ensure role belongs to same org
        if (role.organizationId !== orgId) {
          return response.forbidden('Role não pertence a esta organização')
        }

        return response.success(role)
      },
    }),

    // ==========================================
    // UPDATE — edit custom role (reject system roles)
    // ==========================================
    update: igniter.mutation({
      name: 'UpdateCustomRole',
      description: 'Update a custom role (system roles cannot be edited)',
      path: '/:id',
      method: 'PUT',
      use: [authProcedure({ required: true })],
      body: updateCustomRoleSchema,
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem editar roles')
        }

        const { id } = request.params as { id: string }

        const existing = await context.db.customRole.findUnique({
          where: { id },
        })

        if (!existing) {
          return response.notFound('Role não encontrado')
        }

        if (existing.organizationId !== orgId) {
          return response.forbidden('Role não pertence a esta organização')
        }

        if (existing.isSystem) {
          return response.badRequest('Roles de sistema não podem ser editados')
        }

        const { name, description, permissions, priority } = request.body

        // If name changed, regenerate slug and check uniqueness
        let slug = existing.slug
        if (name && name !== existing.name) {
          slug = toSlug(name)
          if (!slug) {
            return response.badRequest('Nome inválido para gerar slug')
          }

          const slugConflict = await context.db.customRole.findUnique({
            where: { organizationId_slug: { organizationId: orgId, slug } },
          })
          if (slugConflict && slugConflict.id !== id) {
            return response.badRequest(`Já existe um role com slug "${slug}" nesta organização`)
          }
        }

        const updated = await context.db.customRole.update({
          where: { id },
          data: {
            ...(name !== undefined && { name, slug }),
            ...(description !== undefined && { description }),
            ...(permissions !== undefined && { permissions: permissions as any }),
            ...(priority !== undefined && { priority }),
          },
        })

        return response.success(updated)
      },
    }),

    // ==========================================
    // DELETE — remove custom role
    // ==========================================
    delete: igniter.mutation({
      name: 'DeleteCustomRole',
      description: 'Delete a custom role. Rejects if users are assigned unless force=true with reassignToRoleId.',
      path: '/:id',
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      body: deleteCustomRoleSchema,
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem deletar roles')
        }

        const { id } = request.params as { id: string }
        const { force, reassignToRoleId } = request.body

        const existing = await context.db.customRole.findUnique({
          where: { id },
          include: {
            _count: {
              select: { userOrganizations: true },
            },
          },
        })

        if (!existing) {
          return response.notFound('Role não encontrado')
        }

        if (existing.organizationId !== orgId) {
          return response.forbidden('Role não pertence a esta organização')
        }

        if (existing.isSystem) {
          return response.badRequest('Roles de sistema não podem ser deletados')
        }

        const assignedCount = existing._count.userOrganizations

        // If users assigned and not force, reject with count
        if (assignedCount > 0 && !force) {
          return response.badRequest(
            `Role tem ${assignedCount} usuário(s) atribuído(s). Use force=true com reassignToRoleId para deletar.`
          )
        }

        // If force + users assigned, must reassign
        if (assignedCount > 0 && force) {
          if (!reassignToRoleId) {
            return response.badRequest(
              'reassignToRoleId é obrigatório quando force=true e há usuários atribuídos'
            )
          }

          // Validate target role exists in same org
          const targetRole = await context.db.customRole.findUnique({
            where: { id: reassignToRoleId },
          })

          if (!targetRole || targetRole.organizationId !== orgId) {
            return response.badRequest('Role de reatribuição não encontrado nesta organização')
          }

          if (targetRole.id === id) {
            return response.badRequest('Não é possível reatribuir para o mesmo role que está sendo deletado')
          }

          // Reassign users then delete
          await context.db.$transaction([
            context.db.userOrganization.updateMany({
              where: { customRoleId: id },
              data: { customRoleId: reassignToRoleId },
            }),
            context.db.customRole.delete({ where: { id } }),
          ])

          return response.success({
            message: 'Role deletado com sucesso',
            reassignedUsers: assignedCount,
          })
        }

        // No users assigned — just delete
        await context.db.customRole.delete({ where: { id } })

        return response.success({ message: 'Role deletado com sucesso' })
      },
    }),
  },
})
