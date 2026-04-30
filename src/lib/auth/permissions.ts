/**
 * RBAC Permissions System
 *
 * Sistema de permissões baseado em recursos e ações.
 * Supports both legacy PERMISSIONS_MATRIX (by OrganizationRole) and
 * dynamic CustomRole permissions from DB with in-memory cache (5min TTL).
 */

import { UserRole, OrganizationRole, hasRolePermission } from './roles';

/**
 * Recursos do sistema
 */
export enum Resource {
  // Gerenciamento de Organização
  ORGANIZATION = 'organization',
  ORGANIZATION_SETTINGS = 'organization_settings',
  ORGANIZATION_BILLING = 'organization_billing',

  // Gerenciamento de Usuários
  USER = 'user',
  INVITATION = 'invitation',
  USER_ORGANIZATION = 'user_organization',

  // WhatsApp Instances
  INSTANCE = 'instance',
  INSTANCE_QR = 'instance_qr',
  INSTANCE_MESSAGES = 'instance_messages',

  // Projetos
  PROJECT = 'project',

  // Webhooks
  WEBHOOK = 'webhook',

  // Tokens de Compartilhamento
  SHARE_TOKEN = 'share_token',

  // Logs e Auditoria
  AUDIT_LOG = 'audit_log',

  // Níveis de Acesso Personalizados
  ACCESS_LEVEL = 'access_level',
}

/**
 * Ações possíveis sobre recursos
 */
export enum Action {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  MANAGE = 'manage', // Ação especial para gerenciamento completo
}

/**
 * Matriz de Permissões por OrganizationRole
 *
 * Define quais ações cada role pode executar em cada recurso
 */
export const PERMISSIONS_MATRIX: Record<
  OrganizationRole,
  Partial<Record<Resource, Action[]>>
> = {
  // MASTER: Acesso total à organização
  [OrganizationRole.MASTER]: {
    [Resource.ORGANIZATION]: [Action.READ, Action.UPDATE, Action.DELETE],
    [Resource.ORGANIZATION_SETTINGS]: [Action.READ, Action.UPDATE],
    [Resource.ORGANIZATION_BILLING]: [Action.READ, Action.UPDATE, Action.MANAGE],
    [Resource.USER]: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.LIST],
    [Resource.INVITATION]: [Action.CREATE, Action.READ, Action.DELETE, Action.LIST],
    [Resource.USER_ORGANIZATION]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.LIST,
    ],
    [Resource.INSTANCE]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.LIST,
    ],
    [Resource.INSTANCE_QR]: [Action.READ],
    [Resource.INSTANCE_MESSAGES]: [Action.CREATE, Action.READ, Action.LIST],
    [Resource.PROJECT]: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.LIST],
    [Resource.WEBHOOK]: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.LIST],
    [Resource.SHARE_TOKEN]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.LIST,
    ],
    [Resource.AUDIT_LOG]: [Action.READ, Action.LIST],
    [Resource.ACCESS_LEVEL]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.LIST,
    ],
  },

  // MANAGER: Gerenciamento de instâncias e usuários comuns
  [OrganizationRole.MANAGER]: {
    [Resource.ORGANIZATION]: [Action.READ],
    [Resource.ORGANIZATION_SETTINGS]: [Action.READ],
    [Resource.USER]: [Action.READ, Action.LIST],
    [Resource.INVITATION]: [Action.CREATE, Action.READ, Action.DELETE, Action.LIST],
    [Resource.USER_ORGANIZATION]: [Action.READ, Action.LIST],
    [Resource.INSTANCE]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.LIST,
    ],
    [Resource.INSTANCE_QR]: [Action.READ],
    [Resource.INSTANCE_MESSAGES]: [Action.CREATE, Action.READ, Action.LIST],
    [Resource.PROJECT]: [Action.CREATE, Action.READ, Action.UPDATE, Action.LIST],
    [Resource.WEBHOOK]: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.LIST],
    [Resource.SHARE_TOKEN]: [Action.CREATE, Action.READ, Action.DELETE, Action.LIST],
    [Resource.AUDIT_LOG]: [Action.READ, Action.LIST],
  },

  // USER: Acesso apenas às próprias instâncias
  [OrganizationRole.USER]: {
    [Resource.ORGANIZATION]: [Action.READ],
    [Resource.USER]: [Action.READ], // Apenas seus próprios dados
    [Resource.INSTANCE]: [Action.READ, Action.LIST], // Apenas suas próprias instâncias
    [Resource.INSTANCE_QR]: [Action.READ], // Apenas suas próprias instâncias
    [Resource.INSTANCE_MESSAGES]: [Action.CREATE, Action.READ, Action.LIST], // Apenas suas instâncias
    [Resource.PROJECT]: [Action.READ, Action.LIST],
    [Resource.WEBHOOK]: [Action.READ, Action.LIST],
    [Resource.SHARE_TOKEN]: [Action.CREATE, Action.READ, Action.DELETE, Action.LIST],
  },
};

// ==========================================
// CustomRole Cache (in-memory, 5min TTL)
// ==========================================

/**
 * Permissions JSON from CustomRole DB model
 * Same structure as PERMISSIONS_MATRIX values: { "resource": ["action1", ...] }
 */
export type CustomRolePermissions = Partial<Record<string, string[]>>;

/**
 * CustomRole context injected by authProcedure
 */
export interface CustomRoleContext {
  id: string;
  slug: string;
  permissions: CustomRolePermissions;
  priority: number;
}

interface CacheEntry {
  permissions: CustomRolePermissions;
  expiresAt: number;
}

/** TTL for cache entries: 5 minutes */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** In-memory cache: customRoleId -> { permissions, expiresAt } */
const customRoleCache = new Map<string, CacheEntry>();

/**
 * Get permissions for a CustomRole from cache or DB.
 *
 * @param customRoleId - UUID of the CustomRole
 * @param db - Prisma client instance (passed to avoid importing database service in this module)
 * @returns Permissions JSON or null if role not found
 */
export async function getCustomRolePermissions(
  customRoleId: string,
  db: any
): Promise<CustomRolePermissions | null> {
  // Check cache first
  const cached = customRoleCache.get(customRoleId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions;
  }

  // Fetch from DB
  const role = await db.customRole.findUnique({
    where: { id: customRoleId },
    select: { permissions: true },
  });

  if (!role) {
    // Remove stale cache entry if exists
    customRoleCache.delete(customRoleId);
    return null;
  }

  const permissions = role.permissions as CustomRolePermissions;

  // Store in cache
  customRoleCache.set(customRoleId, {
    permissions,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return permissions;
}

/**
 * Invalidate cache entry for a specific CustomRole.
 * Call this when creating, updating, or deleting a CustomRole.
 */
export function invalidateCustomRoleCache(customRoleId: string): void {
  customRoleCache.delete(customRoleId);
}

/**
 * Clear entire CustomRole cache.
 * Useful for bulk operations or testing.
 */
export function clearCustomRoleCache(): void {
  customRoleCache.clear();
}

/**
 * Check permission against a CustomRole permissions JSON (synchronous).
 * Used internally after permissions have been fetched/cached.
 */
function hasCustomRolePermission(
  permissions: CustomRolePermissions,
  resource: Resource,
  action: Action
): boolean {
  const resourceActions = permissions[resource];
  if (!resourceActions || !Array.isArray(resourceActions)) {
    return false;
  }
  return resourceActions.includes(action);
}

/**
 * Verifica se um usuário tem permissão para executar uma ação em um recurso.
 *
 * Supports two modes:
 * 1. Legacy: pass userRole (OrganizationRole) → uses PERMISSIONS_MATRIX
 * 2. CustomRole: pass customRolePermissions → uses dynamic permissions from DB
 *
 * @param userRole - Role do usuário na organização
 * @param resource - Recurso a ser acessado
 * @param action - Ação a ser executada
 * @param customRolePermissions - Optional: permissions from CustomRole (overrides PERMISSIONS_MATRIX)
 * @returns true se o usuário tem permissão
 *
 * @example
 * ```ts
 * // Legacy mode (zero breaking change)
 * if (hasPermission(userOrgRole, Resource.INSTANCE, Action.CREATE)) { ... }
 *
 * // CustomRole mode
 * if (hasPermission(userOrgRole, Resource.INSTANCE, Action.CREATE, customRolePerms)) { ... }
 * ```
 */
export function hasPermission(
  userRole: OrganizationRole,
  resource: Resource,
  action: Action,
  customRolePermissions?: CustomRolePermissions | null
): boolean {
  // If CustomRole permissions provided, use them
  if (customRolePermissions) {
    return hasCustomRolePermission(customRolePermissions, resource, action);
  }

  // Fallback to legacy PERMISSIONS_MATRIX
  const rolePermissions = PERMISSIONS_MATRIX[userRole];
  const resourcePermissions = rolePermissions[resource];

  if (!resourcePermissions) {
    return false;
  }

  return resourcePermissions.includes(action);
}

/**
 * Verifica múltiplas permissões (OR logic)
 *
 * @param userRole - Role do usuário
 * @param permissions - Array de [resource, action] tuples
 * @returns true se o usuário tem PELO MENOS UMA das permissões
 */
export function hasAnyPermission(
  userRole: OrganizationRole,
  permissions: Array<[Resource, Action]>
): boolean {
  return permissions.some(([resource, action]) => hasPermission(userRole, resource, action));
}

/**
 * Verifica múltiplas permissões (AND logic)
 *
 * @param userRole - Role do usuário
 * @param permissions - Array de [resource, action] tuples
 * @returns true se o usuário tem TODAS as permissões
 */
export function hasAllPermissions(
  userRole: OrganizationRole,
  permissions: Array<[Resource, Action]>
): boolean {
  return permissions.every(([resource, action]) => hasPermission(userRole, resource, action));
}

/**
 * Verifica se um usuário pode acessar uma organização
 *
 * @param userId - ID do usuário
 * @param organizationId - ID da organização
 * @param userOrganizations - Relações UserOrganization do usuário
 * @returns UserOrganization se pode acessar, null caso contrário
 */
export function canAccessOrganization(
  userId: string,
  organizationId: string,
  userOrganizations: Array<{
    userId: string;
    organizationId: string;
    role: string;
    isActive: boolean;
  }>
): { role: OrganizationRole; isActive: boolean } | null {
  const userOrg = userOrganizations.find(
    (uo) => uo.userId === userId && uo.organizationId === organizationId && uo.isActive
  );

  if (!userOrg) {
    return null;
  }

  return {
    role: userOrg.role as OrganizationRole,
    isActive: userOrg.isActive,
  };
}

/**
 * Verifica se um usuário é dono de um recurso
 *
 * @param userId - ID do usuário
 * @param resourceOwnerId - ID do dono do recurso
 * @returns true se o usuário é dono
 */
export function isResourceOwner(userId: string, resourceOwnerId: string | null): boolean {
  if (!resourceOwnerId) return false;
  return userId === resourceOwnerId;
}

/**
 * Tipo de retorno para verificação de permissão
 */
export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Verifica permissão com contexto completo
 *
 * @param context - Contexto da requisição
 * @param resource - Recurso a acessar
 * @param action - Ação a executar
 * @param options - Opções adicionais
 * @returns Objeto com resultado da verificação
 *
 * @example
 * ```ts
 * const check = checkPermission(
 *   { userId: user.id, organizationRole: OrganizationRole.MANAGER },
 *   Resource.INSTANCE,
 *   Action.CREATE
 * );
 *
 * if (!check.allowed) {
 *   throw new Error(check.reason);
 * }
 * ```
 */
export function checkPermission(
  context: {
    userId: string;
    userRole: UserRole;
    organizationRole?: OrganizationRole;
    customRolePermissions?: CustomRolePermissions | null;
    resourceOwnerId?: string;
  },
  resource: Resource,
  action: Action,
  options?: {
    requireOwnership?: boolean;
  }
): PermissionCheck {
  // System admin tem acesso total
  if (context.userRole === UserRole.ADMIN) {
    return { allowed: true };
  }

  // Verifica se tem role na organização
  if (!context.organizationRole) {
    return {
      allowed: false,
      reason: 'User is not a member of this organization',
    };
  }

  // Verifica permissão baseada em role (CustomRole permissions or legacy PERMISSIONS_MATRIX)
  const hasRolePermissionForAction = hasPermission(
    context.organizationRole,
    resource,
    action,
    context.customRolePermissions
  );

  if (!hasRolePermissionForAction) {
    return {
      allowed: false,
      reason: `Role ${context.organizationRole} does not have permission to ${action} ${resource}`,
    };
  }

  // Verifica ownership se necessário
  if (options?.requireOwnership && context.resourceOwnerId) {
    const isOwner = isResourceOwner(context.userId, context.resourceOwnerId);
    if (!isOwner) {
      return {
        allowed: false,
        reason: 'User is not the owner of this resource',
      };
    }
  }

  return { allowed: true };
}

/**
 * Helper para obter todas as permissões de uma role
 */
export function getRolePermissions(
  role: OrganizationRole
): Partial<Record<Resource, Action[]>> {
  return PERMISSIONS_MATRIX[role];
}

/**
 * Helper para verificar se uma role pode executar ação de MANAGE
 */
export function canManageResource(role: OrganizationRole, resource: Resource): boolean {
  return hasPermission(role, resource, Action.MANAGE);
}
