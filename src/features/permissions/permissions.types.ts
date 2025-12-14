/**
 * Permissions Types
 */

// Available roles in the system
export type PermissionRole = 'admin' | 'master' | 'manager' | 'agent' | 'viewer'

// Available actions
export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'manage' | 'export' | 'import' | 'connect' | 'disconnect'

// Permission structure
export interface Permission {
  resource: string
  displayName: string
  description?: string
  actions: PermissionAction[]
}

// Role permission mapping
export interface RolePermission {
  id: string
  resourceId: string
  role: PermissionRole
  actions: PermissionAction[]
  resource?: {
    resource: string
    displayName: string
  }
}

// Permission resource with roles
export interface PermissionResourceWithRoles {
  id: string
  resource: string
  displayName: string
  description?: string | null
  sortOrder: number
  isActive: boolean
  permissions: {
    role: PermissionRole
    actions: PermissionAction[]
  }[]
}

// Default permissions for each role
export const DEFAULT_PERMISSIONS: Record<string, Record<PermissionRole, PermissionAction[]>> = {
  organizations: {
    admin: ['create', 'read', 'update', 'delete', 'manage'],
    master: ['read', 'update', 'manage'],
    manager: ['read'],
    agent: [],
    viewer: [],
  },
  users: {
    admin: ['create', 'read', 'update', 'delete', 'manage'],
    master: ['create', 'read', 'update', 'delete', 'manage'],
    manager: ['read', 'create'],
    agent: ['read'],
    viewer: ['read'],
  },
  connections: {
    admin: ['create', 'read', 'update', 'delete', 'manage', 'connect', 'disconnect', 'import'],
    master: ['create', 'read', 'update', 'delete', 'manage', 'connect', 'disconnect'],
    manager: ['create', 'read', 'update', 'connect', 'disconnect'],
    agent: ['read'],
    viewer: ['read'],
  },
  messages: {
    admin: ['create', 'read', 'update', 'delete', 'export'],
    master: ['create', 'read', 'update', 'delete', 'export'],
    manager: ['create', 'read', 'update', 'export'],
    agent: ['create', 'read'],
    viewer: ['read'],
  },
  sessions: {
    admin: ['create', 'read', 'update', 'delete', 'manage'],
    master: ['create', 'read', 'update', 'delete', 'manage'],
    manager: ['create', 'read', 'update', 'manage'],
    agent: ['create', 'read', 'update'],
    viewer: ['read'],
  },
  contacts: {
    admin: ['create', 'read', 'update', 'delete', 'export', 'import'],
    master: ['create', 'read', 'update', 'delete', 'export', 'import'],
    manager: ['create', 'read', 'update', 'delete'],
    agent: ['create', 'read', 'update'],
    viewer: ['read'],
  },
  departments: {
    admin: ['create', 'read', 'update', 'delete'],
    master: ['create', 'read', 'update', 'delete'],
    manager: ['read'],
    agent: ['read'],
    viewer: ['read'],
  },
  labels: {
    admin: ['create', 'read', 'update', 'delete'],
    master: ['create', 'read', 'update', 'delete'],
    manager: ['create', 'read', 'update'],
    agent: ['read'],
    viewer: ['read'],
  },
  webhooks: {
    admin: ['create', 'read', 'update', 'delete', 'manage'],
    master: ['create', 'read', 'update', 'delete'],
    manager: ['read'],
    agent: [],
    viewer: [],
  },
  projects: {
    admin: ['create', 'read', 'update', 'delete'],
    master: ['create', 'read', 'update', 'delete'],
    manager: ['read'],
    agent: [],
    viewer: [],
  },
  invitations: {
    admin: ['create', 'read', 'update', 'delete'],
    master: ['create', 'read', 'update', 'delete'],
    manager: ['create', 'read'],
    agent: [],
    viewer: [],
  },
  logs: {
    admin: ['read', 'export', 'manage'],
    master: [],
    manager: [],
    agent: [],
    viewer: [],
  },
  analytics: {
    admin: ['read', 'export'],
    master: ['read', 'export'],
    manager: ['read'],
    agent: [],
    viewer: [],
  },
  settings: {
    admin: ['read', 'update'],
    master: [],
    manager: [],
    agent: [],
    viewer: [],
  },
}

// Resource display names
export const RESOURCE_DISPLAY_NAMES: Record<string, { displayName: string; description: string }> = {
  organizations: {
    displayName: 'Organizacoes',
    description: 'Gerenciamento de organizacoes e membros',
  },
  users: {
    displayName: 'Usuarios',
    description: 'Gerenciamento de usuarios e roles',
  },
  connections: {
    displayName: 'Conexoes/Integracoes',
    description: 'Instancias WhatsApp e outras integracoes',
  },
  messages: {
    displayName: 'Mensagens',
    description: 'Visualizacao e envio de mensagens',
  },
  sessions: {
    displayName: 'Sessoes',
    description: 'Atendimentos e conversas ativas',
  },
  contacts: {
    displayName: 'Contatos',
    description: 'Gerenciamento de contatos',
  },
  departments: {
    displayName: 'Departamentos',
    description: 'Estrutura de departamentos',
  },
  labels: {
    displayName: 'Etiquetas',
    description: 'Sistema de labels e tags',
  },
  webhooks: {
    displayName: 'Webhooks',
    description: 'Configuracao de webhooks',
  },
  projects: {
    displayName: 'Projetos',
    description: 'Gerenciamento de projetos',
  },
  invitations: {
    displayName: 'Convites',
    description: 'Convites para novos usuarios',
  },
  logs: {
    displayName: 'Logs do Sistema',
    description: 'Visualizacao e analise de logs',
  },
  analytics: {
    displayName: 'Analytics',
    description: 'Metricas e relatorios',
  },
  settings: {
    displayName: 'Configuracoes',
    description: 'Configuracoes do sistema',
  },
}
