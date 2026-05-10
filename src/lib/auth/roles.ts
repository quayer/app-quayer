export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export enum OrganizationRole {
  MASTER = 'MASTER',
  MANAGER = 'MANAGER',
  USER = 'USER',
}

export function hasRolePermission(role: OrganizationRole, resource: string, action: string): boolean {
  return role === OrganizationRole.MASTER || role === OrganizationRole.MANAGER
}

export function isSystemAdmin(role: UserRole): boolean {
  return role === UserRole.ADMIN
}
