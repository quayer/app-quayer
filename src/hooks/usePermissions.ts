/**
 * usePermissions Hook - Dynamic Permissions System
 *
 * Carrega permissões do banco de dados dinamicamente
 * Mantém compatibilidade com a API anterior (canCreateInstance, etc)
 * Adiciona função genérica can(resource, action) para verificações dinâmicas
 */

'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth/auth-provider'
import { getUserPermissionsAction } from '@/app/admin/actions'
import { DEFAULT_PERMISSIONS } from '@/features/permissions/permissions.types'

export type PermissionResource =
  | 'organizations'
  | 'users'
  | 'connections'
  | 'messages'
  | 'sessions'
  | 'contacts'
  | 'departments'
  | 'labels'
  | 'webhooks'
  | 'projects'
  | 'invitations'
  | 'logs'
  | 'analytics'
  | 'settings'
  | 'instances' // alias for connections

export type PermissionAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage'
  | 'export'
  | 'import'
  | 'connect'
  | 'disconnect'

export interface DynamicPermissions {
  // Função genérica para verificar permissões dinâmicas
  can: (resource: PermissionResource, action: PermissionAction) => boolean
  hasPermission: (resource: PermissionResource, action: PermissionAction) => boolean

  // Permissões carregadas do banco
  permissions: Record<string, string[]>
  effectiveRole: string
  isLoading: boolean
  isLoaded: boolean

  // Compatibilidade com API anterior - Instance Permissions
  canCreateInstance: boolean
  canEditInstance: boolean
  canDeleteInstance: boolean
  canViewInstances: boolean
  canConnectInstance: boolean
  canDisconnectInstance: boolean

  // Organization Permissions
  canSwitchOrganization: boolean
  canManageOrganizations: boolean
  canViewOrganizations: boolean

  // User Permissions
  canManageUsers: boolean
  canViewUsers: boolean
  canEditProfile: boolean
  canInviteUsers: boolean

  // Webhook Permissions
  canManageWebhooks: boolean
  canViewWebhooks: boolean

  // Message Permissions
  canSendMessages: boolean
  canViewMessages: boolean
  canExportMessages: boolean

  // Contact Permissions
  canCreateContact: boolean
  canEditContact: boolean
  canDeleteContact: boolean
  canViewContacts: boolean
  canExportContacts: boolean
  canImportContacts: boolean

  // Session Permissions
  canManageSessions: boolean
  canViewSessions: boolean

  // Project Permissions
  canManageProjects: boolean
  canViewProjects: boolean

  // Department Permissions
  canManageDepartments: boolean
  canViewDepartments: boolean

  // Admin Permissions
  canAccessAdmin: boolean
  canViewLogs: boolean
  canManageSettings: boolean
  canViewAnalytics: boolean
  canExportAnalytics: boolean
  canSelectBroker: boolean

  // System Info
  isAdmin: boolean
  isMaster: boolean
  isManager: boolean
  isAgent: boolean
  isViewer: boolean
  isUser: boolean
  organizationRole: string | null
  systemRole: string | null

  // Refresh function
  refreshPermissions: () => Promise<void>
}

// Cache key for permissions
const PERMISSIONS_CACHE_KEY = 'user_permissions_cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

interface CachedPermissions {
  effectiveRole: string
  permissions: Record<string, string[]>
  isAdmin: boolean
  timestamp: number
}

function getCachedPermissions(): CachedPermissions | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(PERMISSIONS_CACHE_KEY)
    if (!cached) return null

    const parsed: CachedPermissions = JSON.parse(cached)
    // Check if cache is still valid
    if (Date.now() - parsed.timestamp > CACHE_DURATION) {
      localStorage.removeItem(PERMISSIONS_CACHE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function setCachedPermissions(data: Omit<CachedPermissions, 'timestamp'>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      PERMISSIONS_CACHE_KEY,
      JSON.stringify({ ...data, timestamp: Date.now() })
    )
  } catch {
    // Ignore storage errors
  }
}

export function usePermissions(): DynamicPermissions {
  const { user } = useAuth()

  // State for dynamic permissions
  const [permissions, setPermissions] = useState<Record<string, string[]>>({})
  const [effectiveRole, setEffectiveRole] = useState<string>('viewer')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoaded, setIsLoaded] = useState(false)

  // System roles
  const isAdmin = user?.role === 'admin'
  const systemRole = user?.role || null

  // Organization roles
  const organizationRole = (user as any)?.organizationRole || null
  const isMaster = organizationRole === 'master'
  const isManager = organizationRole === 'manager'
  const isAgent = organizationRole === 'agent'
  const isViewer = organizationRole === 'viewer'
  const isUser = !isAdmin && !isMaster && !isManager && !isAgent && !isViewer

  // Load permissions from server
  const loadPermissions = useCallback(async () => {
    if (!user) {
      setIsLoading(false)
      return
    }

    // Try cache first
    const cached = getCachedPermissions()
    if (cached) {
      setPermissions(cached.permissions)
      setEffectiveRole(cached.effectiveRole)
      setIsLoaded(true)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      const result = await getUserPermissionsAction()

      if (result.success && result.data) {
        setPermissions(result.data.permissions)
        setEffectiveRole(result.data.effectiveRole)
        setCachedPermissions({
          permissions: result.data.permissions,
          effectiveRole: result.data.effectiveRole,
          isAdmin: result.data.isAdmin,
        })
      } else {
        // Fallback to DEFAULT_PERMISSIONS
        const role = isAdmin ? 'admin' : organizationRole || 'viewer'
        const fallbackPerms: Record<string, string[]> = {}
        for (const [resource, roles] of Object.entries(DEFAULT_PERMISSIONS)) {
          fallbackPerms[resource] = (roles as any)[role] || []
        }
        setPermissions(fallbackPerms)
        setEffectiveRole(role)
      }
    } catch (error) {
      console.error('[usePermissions] Error loading permissions:', error)
      // Fallback to DEFAULT_PERMISSIONS
      const role = isAdmin ? 'admin' : organizationRole || 'viewer'
      const fallbackPerms: Record<string, string[]> = {}
      for (const [resource, roles] of Object.entries(DEFAULT_PERMISSIONS)) {
        fallbackPerms[resource] = (roles as any)[role] || []
      }
      setPermissions(fallbackPerms)
      setEffectiveRole(role)
    } finally {
      setIsLoading(false)
      setIsLoaded(true)
    }
  }, [user, isAdmin, organizationRole])

  // Load permissions on mount and when user changes
  useEffect(() => {
    loadPermissions()
  }, [loadPermissions])

  // Clear cache on logout
  useEffect(() => {
    if (!user && typeof window !== 'undefined') {
      localStorage.removeItem(PERMISSIONS_CACHE_KEY)
    }
  }, [user])

  // Generic permission check function
  const can = useCallback(
    (resource: PermissionResource, action: PermissionAction): boolean => {
      // Admin always has all permissions
      if (isAdmin) return true

      // Handle instance/connections alias
      const normalizedResource = resource === 'instances' ? 'connections' : resource

      const resourcePerms = permissions[normalizedResource] || []
      return resourcePerms.includes(action)
    },
    [isAdmin, permissions]
  )

  // Alias for can
  const hasPermission = can

  // Memoized computed permissions for compatibility
  const computedPermissions = useMemo(() => ({
    // Instance Permissions
    canCreateInstance: isAdmin || can('connections', 'create'),
    canEditInstance: isAdmin || can('connections', 'update'),
    canDeleteInstance: isAdmin || can('connections', 'delete'),
    canViewInstances: isAdmin || can('connections', 'read'),
    canConnectInstance: isAdmin || can('connections', 'connect'),
    canDisconnectInstance: isAdmin || can('connections', 'disconnect'),

    // Organization Permissions
    canSwitchOrganization: isAdmin,
    canManageOrganizations: isAdmin || can('organizations', 'manage'),
    canViewOrganizations: isAdmin || can('organizations', 'read'),

    // User Permissions
    canManageUsers: isAdmin || can('users', 'manage'),
    canViewUsers: isAdmin || can('users', 'read'),
    canEditProfile: true, // Everyone can edit their own profile
    canInviteUsers: isAdmin || can('invitations', 'create'),

    // Webhook Permissions
    canManageWebhooks: isAdmin || can('webhooks', 'manage'),
    canViewWebhooks: isAdmin || can('webhooks', 'read'),

    // Message Permissions
    canSendMessages: isAdmin || can('messages', 'create'),
    canViewMessages: isAdmin || can('messages', 'read'),
    canExportMessages: isAdmin || can('messages', 'export'),

    // Contact Permissions
    canCreateContact: isAdmin || can('contacts', 'create'),
    canEditContact: isAdmin || can('contacts', 'update'),
    canDeleteContact: isAdmin || can('contacts', 'delete'),
    canViewContacts: isAdmin || can('contacts', 'read'),
    canExportContacts: isAdmin || can('contacts', 'export'),
    canImportContacts: isAdmin || can('contacts', 'import'),

    // Session Permissions
    canManageSessions: isAdmin || can('sessions', 'manage'),
    canViewSessions: isAdmin || can('sessions', 'read'),

    // Project Permissions
    canManageProjects: isAdmin || can('projects', 'manage') || can('projects', 'create'),
    canViewProjects: isAdmin || can('projects', 'read'),

    // Department Permissions
    canManageDepartments: isAdmin || can('departments', 'manage') || can('departments', 'create'),
    canViewDepartments: isAdmin || can('departments', 'read'),

    // Admin Permissions
    canAccessAdmin: isAdmin,
    canViewLogs: isAdmin || can('logs', 'read'),
    canManageSettings: isAdmin || can('settings', 'manage'),
    canViewAnalytics: isAdmin || can('analytics', 'read'),
    canExportAnalytics: isAdmin || can('analytics', 'export'),
    canSelectBroker: isAdmin, // Only admin can select broker/provider
  }), [isAdmin, can])

  return {
    // Dynamic permission functions
    can,
    hasPermission,
    permissions,
    effectiveRole,
    isLoading,
    isLoaded,

    // Computed permissions for compatibility
    ...computedPermissions,

    // System Info
    isAdmin,
    isMaster,
    isManager,
    isAgent,
    isViewer,
    isUser,
    organizationRole,
    systemRole,

    // Refresh function
    refreshPermissions: async () => {
      localStorage.removeItem(PERMISSIONS_CACHE_KEY)
      await loadPermissions()
    },
  }
}

/**
 * Uso em componentes:
 *
 * // Forma nova (dinâmica):
 * const { can, isLoading } = usePermissions()
 * {can('instances', 'delete') && <Button>Deletar</Button>}
 *
 * // Forma antiga (compatível):
 * const { canDelete, canSelectBroker, isAdmin } = usePermissions()
 * {canDelete && <Button>Deletar</Button>}
 */
