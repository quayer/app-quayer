'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  Building2,
  Crown,
  Briefcase,
  User as UserIcon,
  Eye,
  RefreshCw,
  AlertCircle,
  Loader2,
  Save,
  X,
  Database,
  MessageSquare,
  Users,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { toast } from 'sonner'

import {
  getPermissionMatrixAction,
  updateRolePermissionAction,
  initializeDefaultPermissionsAction,
} from '../actions'

interface PermissionMatrix {
  resources: Array<{
    id: string
    resource: string
    displayName: string
    description: string | null
  }>
  roles: string[]
  matrix: Record<string, Record<string, string[]>>
}

// Actions disponíveis
const ACTION_DEFINITIONS = {
  create: { id: 'create', label: 'Criar' },
  read: { id: 'read', label: 'Ler' },
  update: { id: 'update', label: 'Editar' },
  delete: { id: 'delete', label: 'Excluir' },
  manage: { id: 'manage', label: 'Gerenciar' },
  export: { id: 'export', label: 'Exportar' },
  import: { id: 'import', label: 'Importar' },
  connect: { id: 'connect', label: 'Conectar' },
  disconnect: { id: 'disconnect', label: 'Desconectar' },
}

// Ações válidas por recurso (apenas as que fazem sentido semântico)
const RESOURCE_ACTIONS: Record<string, string[]> = {
  organizations: ['create', 'read', 'update', 'delete', 'manage'],
  users: ['create', 'read', 'update', 'delete', 'manage'],
  connections: ['create', 'read', 'update', 'delete', 'manage', 'connect', 'disconnect', 'import'],
  messages: ['create', 'read', 'update', 'delete', 'export'],
  sessions: ['create', 'read', 'update', 'delete', 'manage'],
  contacts: ['create', 'read', 'update', 'delete', 'export', 'import'],
  departments: ['create', 'read', 'update', 'delete'],
  labels: ['create', 'read', 'update', 'delete'],
  webhooks: ['create', 'read', 'update', 'delete', 'manage'],
  projects: ['create', 'read', 'update', 'delete'],
  invitations: ['create', 'read', 'update', 'delete'],
  logs: ['read', 'export', 'manage'],
  analytics: ['read', 'export'],
  settings: ['read', 'update'],
}

// Fallback: ações básicas CRUD para recursos não mapeados
const DEFAULT_ACTIONS = ['create', 'read', 'update', 'delete']

// Função para obter ações válidas para um recurso
function getActionsForResource(resource: string) {
  const actions = RESOURCE_ACTIONS[resource] || DEFAULT_ACTIONS
  return actions.map(id => ACTION_DEFINITIONS[id as keyof typeof ACTION_DEFINITIONS]).filter(Boolean)
}

const ROLES = [
  { id: 'admin', label: 'Admin', color: 'bg-red-600', icon: ShieldCheck },
  { id: 'master', label: 'Master', color: 'bg-amber-600', icon: Crown },
  { id: 'manager', label: 'Manager', color: 'bg-blue-600', icon: Briefcase },
  { id: 'agent', label: 'Agent', color: 'bg-slate-600', icon: UserIcon },
  { id: 'viewer', label: 'Viewer', color: 'bg-gray-500', icon: Eye },
]

// Categorias de recursos para agrupamento
const RESOURCE_CATEGORIES = [
  {
    id: 'communication',
    label: 'Comunicação',
    description: 'Mensagens, sessões e atendimentos',
    icon: MessageSquare,
    resources: ['messages', 'sessions', 'contacts'],
  },
  {
    id: 'management',
    label: 'Gestão',
    description: 'Organizações, usuários e estrutura',
    icon: Users,
    resources: ['organizations', 'users', 'departments', 'invitations'],
  },
  {
    id: 'integrations',
    label: 'Integrações',
    description: 'Conexões, webhooks e projetos',
    icon: Building2,
    resources: ['connections', 'webhooks', 'projects', 'labels'],
  },
  {
    id: 'system',
    label: 'Sistema',
    description: 'Logs, analytics e configurações',
    icon: Settings,
    resources: ['logs', 'analytics', 'settings'],
  },
]

export default function AdminPermissionsPage() {
  // Permission matrix state
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrix | null>(null)
  const [isLoadingMatrix, setIsLoadingMatrix] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingChanges, setPendingChanges] = useState<Record<string, Record<string, string[]>>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)

  const loadPermissionMatrix = useCallback(async () => {
    try {
      setIsLoadingMatrix(true)
      setError(null)
      const result = await getPermissionMatrixAction()

      if (result.success && result.data) {
        setPermissionMatrix(result.data as PermissionMatrix)
      } else {
        setError(result.error || 'Erro ao carregar matriz de permissões')
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar matriz')
    } finally {
      setIsLoadingMatrix(false)
    }
  }, [])

  useEffect(() => {
    loadPermissionMatrix()
  }, [loadPermissionMatrix])

  const handleInitializePermissions = async () => {
    try {
      setIsInitializing(true)
      const result = await initializeDefaultPermissionsAction()

      if (result.success) {
        toast.success(result.message || 'Permissões inicializadas')
        await loadPermissionMatrix()
      } else {
        toast.error(result.error || 'Erro ao inicializar')
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao inicializar')
    } finally {
      setIsInitializing(false)
    }
  }

  const handleTogglePermission = (resource: string, role: string, action: string) => {
    setPendingChanges((prev) => {
      const resourceChanges = prev[resource] || {}
      const currentActions = resourceChanges[role] ||
        permissionMatrix?.matrix[resource]?.[role] ||
        []

      const newActions = currentActions.includes(action)
        ? currentActions.filter((a) => a !== action)
        : [...currentActions, action]

      return {
        ...prev,
        [resource]: {
          ...resourceChanges,
          [role]: newActions,
        },
      }
    })
  }

  const getEffectiveActions = (resource: string, role: string): string[] => {
    // Primeiro verifica se há mudanças pendentes
    if (pendingChanges[resource]?.[role]) {
      return pendingChanges[resource][role]
    }
    // Caso contrário, usa os dados da matriz
    return permissionMatrix?.matrix[resource]?.[role] || []
  }

  const handleSavePermissions = async (resource: string) => {
    if (!pendingChanges[resource]) return

    try {
      setIsSaving(true)

      // Salvar cada role que foi modificado
      const promises = Object.entries(pendingChanges[resource]).map(([role, actions]) =>
        updateRolePermissionAction({ resource, role, actions })
      )

      const results = await Promise.all(promises)
      const allSuccess = results.every((r) => r.success)

      if (allSuccess) {
        toast.success('Permissões salvas com sucesso')

        // Limpar mudanças pendentes para este recurso
        setPendingChanges((prev) => {
          const newChanges = { ...prev }
          delete newChanges[resource]
          return newChanges
        })

        // Recarregar matriz
        await loadPermissionMatrix()
      } else {
        toast.error('Erro ao salvar algumas permissões')
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = (resource: string) => {
    setPendingChanges((prev) => {
      const newChanges = { ...prev }
      delete newChanges[resource]
      return newChanges
    })
  }

  const hasChangesForResource = (resource: string) => {
    return !!pendingChanges[resource] && Object.keys(pendingChanges[resource]).length > 0
  }

  // Count total pending changes
  const totalPendingChanges = Object.keys(pendingChanges).reduce((acc, resource) => {
    return acc + Object.keys(pendingChanges[resource]).length
  }, 0)

  if (error && !permissionMatrix) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Erro ao carregar permissões: {error}</AlertDescription>
        </Alert>
        <Button onClick={loadPermissionMatrix} className="mt-4">
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header - WCAG 2.1 compliant spacing */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Matriz de Permissões</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Configure as permissões de cada role no sistema
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalPendingChanges > 0 && (
            <Badge variant="secondary" className="h-8 px-3 text-xs" aria-live="polite">
              {totalPendingChanges} alteração{totalPendingChanges > 1 ? 'ões' : ''} pendente{totalPendingChanges > 1 ? 's' : ''}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={loadPermissionMatrix}
            disabled={isLoadingMatrix}
            aria-label={isLoadingMatrix ? 'Atualizando permissões...' : 'Atualizar lista de permissões'}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingMatrix ? 'animate-spin' : ''}`} aria-hidden="true" />
            Atualizar
          </Button>
        </div>
      </header>

      {/* Role Legend - WCAG compliant */}
      <nav aria-label="Legenda de roles" className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-foreground">Roles:</span>
        {ROLES.map((role) => {
          const Icon = role.icon
          return (
            <Badge key={role.id} variant="outline" className="text-xs font-medium gap-1.5">
              <Icon
                className={`h-3.5 w-3.5 ${role.color === 'bg-red-600' ? 'text-red-600' : role.color === 'bg-amber-600' ? 'text-amber-600' : role.color === 'bg-blue-600' ? 'text-blue-600' : 'text-muted-foreground'}`}
                aria-hidden="true"
              />
              {role.label}
            </Badge>
          )
        })}
      </nav>

      {/* Permission Matrix */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Permissões por Recurso</CardTitle>
          <CardDescription>
            Clique nos checkboxes para editar. Salve individualmente por recurso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingMatrix ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : !permissionMatrix || permissionMatrix.resources.length === 0 ? (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Nenhuma permissão configurada no sistema.
                </AlertDescription>
              </Alert>
              <Button
                onClick={handleInitializePermissions}
                disabled={isInitializing}
                className="w-full sm:w-auto"
              >
                {isInitializing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <Database className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                Criar permissões padrão
              </Button>
            </div>
          ) : (
            <Accordion
              type="multiple"
              defaultValue={['communication', 'management']}
              className="space-y-3"
            >
              {RESOURCE_CATEGORIES.map((category) => {
                const CategoryIcon = category.icon
                const categoryResources = permissionMatrix.resources.filter((r) =>
                  category.resources.includes(r.resource)
                )

                // Conta mudanças pendentes na categoria
                const categoryPendingCount = categoryResources.reduce((acc, r) => {
                  return acc + (pendingChanges[r.resource] ? Object.keys(pendingChanges[r.resource]).length : 0)
                }, 0)

                if (categoryResources.length === 0) return null

                return (
                  <AccordionItem
                    key={category.id}
                    value={category.id}
                    className="border rounded-lg px-4"
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <CategoryIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                        <div className="text-left">
                          <span className="font-semibold text-base">{category.label}</span>
                          <p className="text-xs text-muted-foreground font-normal mt-0.5">
                            {category.description}
                          </p>
                        </div>
                        {categoryPendingCount > 0 && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {categoryPendingCount} pendente{categoryPendingCount > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-2">
                        {categoryResources.map((resource) => (
                          <div key={resource.resource} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                {resource.displayName}
                                {resource.description && (
                                  <span className="font-normal normal-case text-muted-foreground/70">
                                    — {resource.description}
                                  </span>
                                )}
                              </h4>
                              {hasChangesForResource(resource.resource) && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => handleCancelEdit(resource.resource)}
                                  >
                                    <X className="h-3 w-3 mr-1" aria-hidden="true" />
                                    Cancelar
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => handleSavePermissions(resource.resource)}
                                    disabled={isSaving}
                                  >
                                    {isSaving ? (
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" />
                                    ) : (
                                      <Save className="h-3 w-3 mr-1" aria-hidden="true" />
                                    )}
                                    Salvar
                                  </Button>
                                </div>
                              )}
                            </div>
                            <div className="border rounded-md overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/30">
                                    <TableHead className="w-20 py-2 text-xs">Role</TableHead>
                                    {getActionsForResource(resource.resource).map((action) => (
                                      <TableHead key={action.id} className="text-center w-16 py-2 text-xs">
                                        {action.label}
                                      </TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {ROLES.map((role) => {
                                    const effectiveActions = getEffectiveActions(resource.resource, role.id)
                                    const hasChanges =
                                      pendingChanges[resource.resource]?.[role.id] !== undefined
                                    const RoleIcon = role.icon
                                    const resourceActions = getActionsForResource(resource.resource)

                                    return (
                                      <TableRow
                                        key={role.id}
                                        className={hasChanges ? 'bg-amber-50 dark:bg-amber-900/10' : ''}
                                      >
                                        <TableCell className="py-1.5">
                                          <Badge variant="outline" className="text-xs font-normal">
                                            <RoleIcon
                                              className={`h-3 w-3 mr-1 ${
                                                role.color === 'bg-red-600'
                                                  ? 'text-red-600'
                                                  : role.color === 'bg-amber-600'
                                                    ? 'text-amber-600'
                                                    : role.color === 'bg-blue-600'
                                                      ? 'text-blue-600'
                                                      : 'text-muted-foreground'
                                              }`}
                                              aria-hidden="true"
                                            />
                                            {role.label}
                                          </Badge>
                                        </TableCell>
                                        {resourceActions.map((action) => {
                                          const isChecked = effectiveActions.includes(action.id)
                                          const wasModified =
                                            pendingChanges[resource.resource]?.[role.id] !== undefined

                                          return (
                                            <TableCell key={action.id} className="text-center py-2">
                                              <Checkbox
                                                checked={isChecked}
                                                onCheckedChange={() =>
                                                  handleTogglePermission(
                                                    resource.resource,
                                                    role.id,
                                                    action.id
                                                  )
                                                }
                                                className={`h-4 w-4 ${wasModified ? 'border-amber-500' : ''}`}
                                                aria-label={`${action.label} ${resource.displayName} para ${role.label}`}
                                              />
                                            </TableCell>
                                          )
                                        })}
                                      </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          )}

          <aside className="mt-6 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground leading-relaxed" aria-label="Informações sobre hierarquia de permissões">
            <p>
              <strong className="text-foreground">Hierarquia:</strong>{' '}
              Admin (sistema) → Master (dono org) → Manager (gerente) → Agent (operador) → Viewer (só leitura).
            </p>
            <p className="mt-1">
              Para gerenciar usuários, acesse <strong className="text-foreground">Admin → Usuários</strong>.
            </p>
          </aside>
        </CardContent>
      </Card>
    </div>
  )
}
