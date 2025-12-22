/**
 * Permissions Controller
 *
 * API endpoints for permission management (admin only)
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { authProcedure } from '@/features/auth/procedures/auth.procedure'
import { permissionsService } from '../permissions.service'
import { PermissionAction, PermissionRole } from '../permissions.types'

const roleSchema = z.enum(['admin', 'master', 'manager', 'agent', 'viewer'])
const actionSchema = z.enum([
  'create',
  'read',
  'update',
  'delete',
  'manage',
  'export',
  'import',
  'connect',
  'disconnect',
])

export const permissionsController = igniter.controller({
  name: 'permissions',
  path: '/permissions',
  description: 'Permission management (admin only)',
  actions: {
    // ==========================================
    // GET PERMISSION MATRIX
    // ==========================================
    getMatrix: igniter.query({
      name: 'Get Permission Matrix',
      description: 'Get the full permission matrix',
      path: '/matrix',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ context, response }) => {
        const user = context.auth?.session?.user
        if (!user || user.role !== 'admin') {
          return response.forbidden('Acesso negado. Apenas administradores.')
        }

        try {
          const matrix = await permissionsService.getPermissionMatrix()
          return response.success({ data: matrix })
        } catch (error: any) {
          return (response as any).error(error.message || 'Erro ao carregar matriz de permissoes')
        }
      },
    }),

    // ==========================================
    // GET ALL PERMISSIONS
    // ==========================================
    list: igniter.query({
      name: 'List Permissions',
      description: 'List all permission resources',
      path: '/',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ context, response }) => {
        const user = context.auth?.session?.user
        if (!user || user.role !== 'admin') {
          return response.forbidden('Acesso negado. Apenas administradores.')
        }

        try {
          const permissions = await permissionsService.getAllPermissions()
          return response.success({ data: permissions })
        } catch (error: any) {
          return (response as any).error(error.message || 'Erro ao listar permissoes')
        }
      },
    }),

    // ==========================================
    // GET PERMISSIONS FOR ROLE
    // ==========================================
    getByRole: igniter.query({
      name: 'Get Permissions by Role',
      description: 'Get permissions for a specific role',
      path: '/role/:role',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user
        if (!user || user.role !== 'admin') {
          return response.forbidden('Acesso negado. Apenas administradores.')
        }

        const { role } = request.params as { role: string }

        try {
          const permissions = await permissionsService.getPermissionsForRole(
            role as PermissionRole
          )
          return response.success({ data: permissions })
        } catch (error: any) {
          return (response as any).error(error.message || 'Erro ao carregar permissoes do role')
        }
      },
    }),

    // ==========================================
    // UPDATE ROLE PERMISSION
    // ==========================================
    updateRolePermission: igniter.mutation({
      name: 'Update Role Permission',
      description: 'Update permissions for a role on a resource',
      path: '/update',
      method: 'POST',
      body: z.object({
        resourceId: z.string().uuid(),
        role: roleSchema,
        actions: z.array(actionSchema),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user
        if (!user || user.role !== 'admin') {
          return response.forbidden('Acesso negado. Apenas administradores.')
        }

        const { resourceId, role, actions } = request.body

        try {
          await permissionsService.updateRolePermission(
            resourceId,
            role as PermissionRole,
            actions as PermissionAction[]
          )
          return response.success({
            data: { message: 'Permissao atualizada com sucesso' },
          })
        } catch (error: any) {
          return (response as any).error(error.message || 'Erro ao atualizar permissao')
        }
      },
    }),

    // ==========================================
    // INITIALIZE DEFAULT PERMISSIONS
    // ==========================================
    initialize: igniter.mutation({
      name: 'Initialize Permissions',
      description: 'Initialize/reset default permissions',
      path: '/initialize',
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ context, response }) => {
        const user = context.auth?.session?.user
        if (!user || user.role !== 'admin') {
          return response.forbidden('Acesso negado. Apenas administradores.')
        }

        try {
          const result = await permissionsService.initializeDefaultPermissions()
          return response.success({
            data: {
              message: 'Permissoes inicializadas com sucesso',
              ...result,
            },
          })
        } catch (error: any) {
          return (response as any).error(error.message || 'Erro ao inicializar permissoes')
        }
      },
    }),

    // ==========================================
    // CHECK PERMISSION
    // ==========================================
    check: igniter.query({
      name: 'Check Permission',
      description: 'Check if a role has a specific permission',
      path: '/check',
      method: 'GET',
      query: z.object({
        role: roleSchema,
        resource: z.string(),
        action: actionSchema,
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user
        if (!user) {
          return response.unauthorized('Nao autenticado')
        }

        const { role, resource, action } = request.query

        try {
          const hasPermission = await permissionsService.hasPermission(
            role as PermissionRole,
            resource,
            action as PermissionAction
          )
          return response.success({ data: { hasPermission } })
        } catch (error: any) {
          return (response as any).error(error.message || 'Erro ao verificar permissao')
        }
      },
    }),
  },
})
