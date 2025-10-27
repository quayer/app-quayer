/**
 * RBAC Permissions System
 *
 * Sistema de permissões baseado em recursos e ações
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

/**
 * Verifica se um usuário tem permissão para executar uma ação em um recurso
 *
 * @param userRole - Role do usuário na organização
 * @param resource - Recurso a ser acessado
 * @param action - Ação a ser executada
 * @returns true se o usuário tem permissão
 *
 * @example
 * ```ts
 * if (hasPermission(userOrgRole, Resource.INSTANCE, Action.CREATE)) {
 *   // Usuário pode criar instâncias
 * }
 * ```
 */
export function hasPermission(
  userRole: OrganizationRole,
  resource: Resource,
  action: Action
): boolean {
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

  // Verifica permissão baseada em role
  const hasRolePermissionForAction = hasPermission(
    context.organizationRole,
    resource,
    action
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
