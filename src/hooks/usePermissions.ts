/**
 * usePermissions Hook
 *
 * Centraliza toda a lógica de permissões baseada em roles
 * Simplifica verificações de permissão em componentes
 */

import { useAuth } from '@/lib/auth/auth-provider'

export interface Permissions {
  // Instance Permissions
  canCreateInstance: boolean
  canEditInstance: boolean
  canDeleteInstance: boolean
  canViewInstances: boolean

  // Organization Permissions
  canSwitchOrganization: boolean
  canManageOrganizations: boolean
  canViewOrganizations: boolean

  // User Permissions
  canManageUsers: boolean
  canViewUsers: boolean
  canEditProfile: boolean

  // Advanced Permissions
  canSelectBroker: boolean
  canManageWebhooks: boolean
  canViewWebhooks: boolean
  canAccessAdmin: boolean

  // Message Permissions
  canSendMessages: boolean
  canViewMessages: boolean

  // Project Permissions
  canManageProjects: boolean
  canViewProjects: boolean

  // System Info
  isAdmin: boolean
  isMaster: boolean
  isManager: boolean
  isUser: boolean
  organizationRole: string | null
  systemRole: string | null
}

export function usePermissions(): Permissions {
  const { user } = useAuth()

  // System roles
  const isAdmin = user?.role === 'admin'
  const systemRole = user?.role || null

  // Organization roles
  const organizationRole = (user as any)?.organizationRole || null
  const isMaster = organizationRole === 'master'
  const isManager = organizationRole === 'manager'
  const isUser = organizationRole === 'user' || (!isAdmin && !isMaster && !isManager)

  return {
    // Instance Permissions
    canCreateInstance: isAdmin || isMaster || isManager,
    canEditInstance: isAdmin || isMaster || isManager,
    canDeleteInstance: isAdmin || isMaster,
    canViewInstances: true, // Todos podem visualizar

    // Organization Permissions
    canSwitchOrganization: isAdmin,
    canManageOrganizations: isAdmin,
    canViewOrganizations: isAdmin,

    // User Permissions
    canManageUsers: isAdmin || isMaster,
    canViewUsers: isAdmin || isMaster || isManager,
    canEditProfile: true, // Todos podem editar próprio perfil

    // Advanced Permissions
    canSelectBroker: isAdmin,
    canManageWebhooks: isAdmin || isMaster,
    canViewWebhooks: isAdmin || isMaster || isManager,
    canAccessAdmin: isAdmin,

    // Message Permissions
    canSendMessages: true, // Todos podem enviar mensagens
    canViewMessages: true, // Todos podem ver mensagens

    // Project Permissions
    canManageProjects: isAdmin || isMaster || isManager,
    canViewProjects: true,

    // System Info
    isAdmin,
    isMaster,
    isManager,
    isUser,
    organizationRole,
    systemRole,
  }
}

/**
 * Uso em componentes:
 *
 * const { canDelete, canSelectBroker, isAdmin } = usePermissions()
 *
 * {canDelete && <Button variant="destructive">Deletar</Button>}
 * {canSelectBroker && <Select>...</Select>}
 */
