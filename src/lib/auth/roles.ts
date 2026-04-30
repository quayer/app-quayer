/**
 * Role-Based Access Control (RBAC) Types and Utilities
 *
 * Sistema de roles hierárquico para app-quayer v2.0
 */

/**
 * User Roles (Prisma User model)
 * - admin: Acesso total ao sistema, gerenciamento de todas organizações
 * - user: Usuário padrão, acesso baseado em UserOrganization.role
 */
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

/**
 * Organization Roles (UserOrganization.role)
 * - master: Proprietário da organização, acesso total
 * - manager: Gerente, pode gerenciar instâncias e usuários
 * - user: Usuário comum, acesso apenas às próprias instâncias
 */
export enum OrganizationRole {
  MASTER = 'master',
  MANAGER = 'manager',
  USER = 'user',
}

/**
 * Role Hierarchy - Maior número = Mais permissões
 */
export const ROLE_HIERARCHY: Record<OrganizationRole, number> = {
  [OrganizationRole.MASTER]: 3,
  [OrganizationRole.MANAGER]: 2,
  [OrganizationRole.USER]: 1,
};

/**
 * Verifica se uma role tem permissões iguais ou superiores a outra
 * @param userRole - Role do usuário
 * @param requiredRole - Role mínima necessária
 * @returns true se o usuário tem permissão suficiente
 */
export function hasRolePermission(
  userRole: OrganizationRole,
  requiredRole: OrganizationRole
): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Obtém a role mais alta entre múltiplas roles
 * @param roles - Array de roles
 * @returns Role com maior hierarquia
 */
export function getHighestRole(roles: OrganizationRole[]): OrganizationRole | null {
  if (roles.length === 0) return null;

  return roles.reduce((highest, current) => {
    return ROLE_HIERARCHY[current] > ROLE_HIERARCHY[highest] ? current : highest;
  });
}

/**
 * Verifica se uma string é um UserRole válido
 */
export function isUserRole(role: string): role is UserRole {
  return Object.values(UserRole).includes(role as UserRole);
}

/**
 * Verifica se uma string é um OrganizationRole válido
 */
export function isOrganizationRole(role: string): role is OrganizationRole {
  return Object.values(OrganizationRole).includes(role as OrganizationRole);
}

/**
 * Type guard para verificar se um usuário é admin do sistema
 */
export function isSystemAdmin(userRole: UserRole): boolean {
  return userRole === UserRole.ADMIN;
}

/**
 * Type guard para verificar se um usuário é master de uma organização
 */
export function isOrganizationMaster(orgRole: OrganizationRole): boolean {
  return orgRole === OrganizationRole.MASTER;
}

/**
 * Type guard para verificar se um usuário é manager de uma organização
 */
export function isOrganizationManager(orgRole: OrganizationRole): boolean {
  return orgRole === OrganizationRole.MANAGER;
}

/**
 * Tipos TypeScript para context injection
 */
export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  currentOrgId: string | null;
};

export type AuthOrganization = {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
  isActive: boolean;
};

export type AuthContext = {
  user: AuthUser;
  organization?: AuthOrganization;
  isSystemAdmin: boolean;
};
