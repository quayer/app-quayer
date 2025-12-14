/**
 * Permissions Service
 *
 * Service for managing dynamic permissions
 */

import { database } from '@/services/database'
import {
  PermissionRole,
  PermissionAction,
  PermissionResourceWithRoles,
  DEFAULT_PERMISSIONS,
  RESOURCE_DISPLAY_NAMES,
} from './permissions.types'

class PermissionsService {
  /**
   * Get all permission resources with their role mappings
   */
  async getAllPermissions(): Promise<PermissionResourceWithRoles[]> {
    const resources = await database.permissionResource.findMany({
      where: { isActive: true },
      include: {
        permissions: true,
      },
      orderBy: { sortOrder: 'asc' },
    })

    return resources.map((r) => ({
      id: r.id,
      resource: r.resource,
      displayName: r.displayName,
      description: r.description,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      permissions: r.permissions.map((p) => ({
        role: p.role as PermissionRole,
        actions: p.actions as PermissionAction[],
      })),
    }))
  }

  /**
   * Get permissions for a specific role
   */
  async getPermissionsForRole(role: PermissionRole): Promise<Record<string, PermissionAction[]>> {
    const permissions = await database.rolePermission.findMany({
      where: { role },
      include: {
        resource: true,
      },
    })

    const result: Record<string, PermissionAction[]> = {}
    for (const p of permissions) {
      result[p.resource.resource] = p.actions as PermissionAction[]
    }

    return result
  }

  /**
   * Check if a role has permission for a specific action on a resource
   */
  async hasPermission(
    role: PermissionRole,
    resource: string,
    action: PermissionAction
  ): Promise<boolean> {
    // Admin always has all permissions
    if (role === 'admin') return true

    const permission = await database.rolePermission.findFirst({
      where: {
        role,
        resource: {
          resource,
        },
      },
    })

    if (!permission) return false
    return permission.actions.includes(action)
  }

  /**
   * Update permissions for a role on a resource (by ID)
   */
  async updateRolePermissionById(
    resourceId: string,
    role: PermissionRole,
    actions: PermissionAction[]
  ): Promise<void> {
    await database.rolePermission.upsert({
      where: {
        resourceId_role: {
          resourceId,
          role,
        },
      },
      create: {
        resourceId,
        role,
        actions,
      },
      update: {
        actions,
      },
    })
  }

  /**
   * Update permissions for a role on a resource (by resource name)
   */
  async updateRolePermission(
    resourceName: string,
    role: PermissionRole,
    actions: PermissionAction[]
  ): Promise<{ success: boolean; error?: string }> {
    // Find the resource by name
    const resource = await database.permissionResource.findUnique({
      where: { resource: resourceName },
    })

    if (!resource) {
      return { success: false, error: `Resource "${resourceName}" not found` }
    }

    await database.rolePermission.upsert({
      where: {
        resourceId_role: {
          resourceId: resource.id,
          role,
        },
      },
      create: {
        resourceId: resource.id,
        role,
        actions,
      },
      update: {
        actions,
      },
    })

    return { success: true }
  }

  /**
   * Initialize default permissions (run on first setup or seed)
   */
  async initializeDefaultPermissions(): Promise<{ created: number; updated: number }> {
    let created = 0
    let updated = 0

    // Create/update resources
    const resources = Object.entries(RESOURCE_DISPLAY_NAMES)
    for (let i = 0; i < resources.length; i++) {
      const [resource, { displayName, description }] = resources[i]

      const existing = await database.permissionResource.findUnique({
        where: { resource },
      })

      if (!existing) {
        await database.permissionResource.create({
          data: {
            resource,
            displayName,
            description,
            sortOrder: i,
          },
        })
        created++
      } else {
        await database.permissionResource.update({
          where: { id: existing.id },
          data: { displayName, description, sortOrder: i },
        })
        updated++
      }
    }

    // Create/update role permissions
    for (const [resource, rolePermissions] of Object.entries(DEFAULT_PERMISSIONS)) {
      const permissionResource = await database.permissionResource.findUnique({
        where: { resource },
      })

      if (!permissionResource) continue

      for (const [role, actions] of Object.entries(rolePermissions)) {
        await database.rolePermission.upsert({
          where: {
            resourceId_role: {
              resourceId: permissionResource.id,
              role,
            },
          },
          create: {
            resourceId: permissionResource.id,
            role,
            actions,
          },
          update: {
            actions,
          },
        })
      }
    }

    return { created, updated }
  }

  /**
   * Get permission matrix for display
   */
  async getPermissionMatrix(): Promise<{
    resources: { id: string; resource: string; displayName: string; description: string | null }[]
    roles: PermissionRole[]
    matrix: Record<string, Record<PermissionRole, PermissionAction[]>>
  }> {
    const resources = await database.permissionResource.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })

    const permissions = await database.rolePermission.findMany({
      include: { resource: true },
    })

    const roles: PermissionRole[] = ['admin', 'master', 'manager', 'agent', 'viewer']

    const matrix: Record<string, Record<PermissionRole, PermissionAction[]>> = {}

    for (const r of resources) {
      matrix[r.resource] = {} as Record<PermissionRole, PermissionAction[]>
      for (const role of roles) {
        const perm = permissions.find(
          (p) => p.resource.resource === r.resource && p.role === role
        )
        matrix[r.resource][role] = (perm?.actions || []) as PermissionAction[]
      }
    }

    return {
      resources: resources.map((r) => ({
        id: r.id,
        resource: r.resource,
        displayName: r.displayName,
        description: r.description,
      })),
      roles,
      matrix,
    }
  }
}

export const permissionsService = new PermissionsService()
