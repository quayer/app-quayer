'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Shield,
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Users,
  Eye,
  Loader2,
} from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Badge } from '@/client/components/ui/badge'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Checkbox } from '@/client/components/ui/checkbox'
import { Textarea } from '@/client/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/client/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/client/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/components/ui/table'
import { SidebarTrigger } from '@/client/components/ui/sidebar'
import { Separator } from '@/client/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/client/components/ui/breadcrumb'

// ==========================================
// Types
// ==========================================

interface CustomRole {
  id: string
  organizationId: string
  name: string
  slug: string
  description: string | null
  permissions: Record<string, string[]>
  isSystem: boolean
  priority: number
  createdAt: string
  updatedAt: string
  _count: {
    userOrganizations: number
  }
}

// ==========================================
// Constants — Resources & Actions
// ==========================================

const RESOURCES = [
  { key: 'organization', label: 'Organização' },
  { key: 'organization_settings', label: 'Config. da Org' },
  { key: 'organization_billing', label: 'Faturamento' },
  { key: 'user', label: 'Usuários' },
  { key: 'invitation', label: 'Convites' },
  { key: 'user_organization', label: 'Membros' },
  { key: 'instance', label: 'Instâncias' },
  { key: 'instance_qr', label: 'QR Code' },
  { key: 'instance_messages', label: 'Mensagens' },
  { key: 'project', label: 'Projetos' },
  { key: 'webhook', label: 'Webhooks' },
  { key: 'share_token', label: 'Compartilhamento' },
  { key: 'audit_log', label: 'Auditoria' },
  { key: 'access_level', label: 'Níveis de Acesso' },
] as const

const ACTIONS = [
  { key: 'create', label: 'Criar' },
  { key: 'read', label: 'Ler' },
  { key: 'update', label: 'Editar' },
  { key: 'delete', label: 'Excluir' },
  { key: 'list', label: 'Listar' },
  { key: 'manage', label: 'Gerenciar' },
] as const

// ==========================================
// Helper
// ==========================================

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error || json?.message || `Erro ${res.status}`)
  }
  return json
}

// ==========================================
// Permissions Matrix Component
// ==========================================

function PermissionsMatrix({
  permissions,
  onChange,
  readOnly = false,
}: {
  permissions: Record<string, string[]>
  onChange?: (permissions: Record<string, string[]>) => void
  readOnly?: boolean
}) {
  const togglePermission = (resource: string, action: string) => {
    if (readOnly || !onChange) return
    const current = permissions[resource] || []
    const has = current.includes(action)
    const updated = has
      ? current.filter((a) => a !== action)
      : [...current, action]
    const next = { ...permissions }
    if (updated.length === 0) {
      delete next[resource]
    } else {
      next[resource] = updated
    }
    onChange(next)
  }

  const toggleAllResource = (resource: string) => {
    if (readOnly || !onChange) return
    const current = permissions[resource] || []
    const allActions = ACTIONS.map((a) => a.key)
    const hasAll = allActions.every((a) => current.includes(a))
    const next = { ...permissions }
    if (hasAll) {
      delete next[resource]
    } else {
      next[resource] = [...allActions]
    }
    onChange(next)
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[160px]">Recurso</TableHead>
            {ACTIONS.map((action) => (
              <TableHead key={action.key} className="text-center w-[80px]">
                {action.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {RESOURCES.map((resource) => {
            const current = permissions[resource.key] || []
            const allActions = ACTIONS.map((a) => a.key)
            const hasAll = allActions.every((a) => current.includes(a))
            return (
              <TableRow key={resource.key}>
                <TableCell>
                  <button
                    type="button"
                    className="text-sm font-medium text-left hover:underline disabled:no-underline disabled:cursor-default"
                    onClick={() => toggleAllResource(resource.key)}
                    disabled={readOnly}
                    title={readOnly ? '' : hasAll ? 'Desmarcar todos' : 'Marcar todos'}
                  >
                    {resource.label}
                  </button>
                </TableCell>
                {ACTIONS.map((action) => (
                  <TableCell key={action.key} className="text-center">
                    <Checkbox
                      checked={current.includes(action.key)}
                      onCheckedChange={() => togglePermission(resource.key, action.key)}
                      disabled={readOnly}
                      aria-label={`${resource.label} - ${action.label}`}
                    />
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ==========================================
// Role Form Dialog
// ==========================================

function RoleFormDialog({
  open,
  onOpenChange,
  role,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: CustomRole | null // null = create, non-null = edit/view
  onSaved: () => void
}) {
  const isEditing = role !== null
  const isSystem = role?.isSystem ?? false
  const isViewOnly = isSystem

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permissions, setPermissions] = useState<Record<string, string[]>>({})
  const [priority, setPriority] = useState('1')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (open && role) {
      setName(role.name)
      setDescription(role.description || '')
      setPermissions(role.permissions || {})
      setPriority(String(role.priority))
    } else if (open && !role) {
      setName('')
      setDescription('')
      setPermissions({})
      setPriority('1')
    }
  }, [open, role])

  const handleSubmit = async () => {
    if (isViewOnly) return
    if (name.length < 3 || name.length > 50) {
      toast.error('O nome deve ter entre 3 e 50 caracteres')
      return
    }

    // Ensure permissions has at least one resource
    if (Object.keys(permissions).length === 0) {
      toast.error('Selecione pelo menos uma permissão')
      return
    }

    setIsSaving(true)
    try {
      if (isEditing) {
        await apiFetch(`/api/v1/custom-roles/${role.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name,
            description: description || null,
            permissions,
            priority: Number(priority),
          }),
        })
        toast.success('Role atualizado com sucesso')
      } else {
        await apiFetch('/api/v1/custom-roles', {
          method: 'POST',
          body: JSON.stringify({
            name,
            description: description || undefined,
            permissions,
            priority: Number(priority),
          }),
        })
        toast.success('Role criado com sucesso')
      }
      onOpenChange(false)
      onSaved()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar role')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isViewOnly
              ? `Visualizar Role: ${role?.name}`
              : isEditing
                ? 'Editar Role'
                : 'Criar Novo Role'}
          </DialogTitle>
          <DialogDescription>
            {isViewOnly
              ? 'Roles de sistema não podem ser editados.'
              : isEditing
                ? 'Modifique as configurações e permissões do role.'
                : 'Defina um nome, prioridade e as permissões para o novo role.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="role-name">Nome</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Supervisor, Atendente Sênior..."
              disabled={isViewOnly}
              maxLength={50}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="role-description">Descrição (opcional)</Label>
            <Textarea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva as responsabilidades deste role..."
              disabled={isViewOnly}
              maxLength={200}
              rows={2}
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="role-priority">Prioridade</Label>
            <Select value={priority} onValueChange={setPriority} disabled={isViewOnly}>
              <SelectTrigger id="role-priority" className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 - Baixa (nível Usuário)</SelectItem>
                <SelectItem value="2">2 - Média (nível Gerente)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Prioridade 3 é reservada para Masters e não pode ser atribuída a roles customizados.
            </p>
          </div>

          {/* Permissions Matrix */}
          <div className="space-y-2">
            <Label>Permissões</Label>
            <PermissionsMatrix
              permissions={permissions}
              onChange={setPermissions}
              readOnly={isViewOnly}
            />
          </div>
        </div>

        {!isViewOnly && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Salvar Alterações' : 'Criar Role'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ==========================================
// Delete Confirmation Dialog
// ==========================================

function DeleteRoleDialog({
  open,
  onOpenChange,
  role,
  allRoles,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: CustomRole | null
  allRoles: CustomRole[]
  onDeleted: () => void
}) {
  const [reassignRoleId, setReassignRoleId] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const memberCount = role?._count?.userOrganizations ?? 0
  const needsReassign = memberCount > 0
  const availableRoles = allRoles.filter((r) => r.id !== role?.id)

  useEffect(() => {
    if (open) {
      setReassignRoleId('')
    }
  }, [open])

  const handleDelete = async () => {
    if (!role) return

    if (needsReassign && !reassignRoleId) {
      toast.error('Selecione um role para reatribuir os membros')
      return
    }

    setIsDeleting(true)
    try {
      await apiFetch(`/api/v1/custom-roles/${role.id}`, {
        method: 'DELETE',
        body: JSON.stringify({
          force: needsReassign,
          reassignToRoleId: needsReassign ? reassignRoleId : undefined,
        }),
      })
      toast.success('Role excluído com sucesso')
      onOpenChange(false)
      onDeleted()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir role')
    } finally {
      setIsDeleting(false)
    }
  }

  if (!role) return null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir role &quot;{role.name}&quot;</AlertDialogTitle>
          <AlertDialogDescription>
            {needsReassign ? (
              <>
                Este role tem <strong>{memberCount}</strong> membro(s) atribuído(s).
                Selecione um role para reatribuí-los antes de excluir.
              </>
            ) : (
              'Tem certeza que deseja excluir este role? Esta ação não pode ser desfeita.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {needsReassign && (
          <div className="space-y-2 py-2">
            <Label htmlFor="reassign-role">Reatribuir membros para</Label>
            <Select value={reassignRoleId} onValueChange={setReassignRoleId}>
              <SelectTrigger id="reassign-role">
                <SelectValue placeholder="Selecione um role..." />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} {r.isSystem && '(Sistema)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting || (needsReassign && !reassignRoleId)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ==========================================
// Main Page Component
// ==========================================

export default function RolesPage() {
  const [roles, setRoles] = useState<CustomRole[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [formOpen, setFormOpen] = useState(false)
  const [formRole, setFormRole] = useState<CustomRole | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteRole, setDeleteRole] = useState<CustomRole | null>(null)

  const loadRoles = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const json = await apiFetch('/api/v1/custom-roles')
      const data = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
      setRoles(data)
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar roles')
      toast.error(err.message || 'Erro ao carregar roles')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRoles()
  }, [loadRoles])

  const handleCreate = () => {
    setFormRole(null)
    setFormOpen(true)
  }

  const handleEditOrView = (role: CustomRole) => {
    setFormRole(role)
    setFormOpen(true)
  }

  const handleDeleteRequest = (role: CustomRole) => {
    setDeleteRole(role)
    setDeleteOpen(true)
  }

  const systemRoles = roles.filter((r) => r.isSystem)
  const customRoles = roles.filter((r) => !r.isSystem)

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/admin">Administração</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Roles Customizados</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 space-y-6 p-8 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Roles e Permissões</h2>
            <p className="text-muted-foreground mt-1">
              Gerencie os níveis de acesso da sua organização. Roles de sistema são imutáveis.
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Criar Role
          </Button>
        </div>

        {/* Error State */}
        {error && !isLoading && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive text-sm">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={loadRoles}>
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* System Roles */}
        {!isLoading && !error && systemRoles.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              Roles de Sistema
            </h3>
            <div className="grid gap-3 md:grid-cols-3">
              {systemRoles.map((role) => (
                <Card
                  key={role.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handleEditOrView(role)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{role.name}</CardTitle>
                      <Badge variant="secondary">Sistema</Badge>
                    </div>
                    <CardDescription className="text-xs">
                      {role.description || `Role de sistema: ${role.slug}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>{role._count.userOrganizations} membro(s)</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="h-3 w-3" />
                        <span>Somente leitura</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Custom Roles */}
        {!isLoading && !error && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              Roles Customizados
            </h3>

            {customRoles.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Shield className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground mb-3">
                    Nenhum role customizado criado ainda.
                  </p>
                  <Button variant="outline" onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar primeiro role
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-center">Prioridade</TableHead>
                      <TableHead className="text-center">Membros</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customRoles.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell>
                          <div className="font-medium">{role.name}</div>
                          <div className="text-xs text-muted-foreground">{role.slug}</div>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="text-sm text-muted-foreground truncate block">
                            {role.description || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{role.priority}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>{role._count.userOrganizations}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditOrView(role)}
                              title="Editar role"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteRequest(role)}
                              title="Excluir role"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit/View Dialog */}
      <RoleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        role={formRole}
        onSaved={loadRoles}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteRoleDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        role={deleteRole}
        allRoles={roles}
        onDeleted={loadRoles}
      />
    </>
  )
}
