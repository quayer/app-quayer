'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Trash2, Plus, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Button } from '@/client/components/ui/button'
import { Separator } from '@/client/components/ui/separator'
import { Skeleton } from '@/client/components/ui/skeleton'
import {
  updateUserSystemRoleAction,
  updateUserOrgRoleAction,
  addUserToOrgAction,
  removeUserFromOrgAction,
  listUserOrgsAction,
  listAllOrgNamesAction,
  type OrgMember,
  type UserOrgMembership,
} from '../../actions'
import type { Organization } from '../types'

interface UserManageModalProps {
  member: OrgMember | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  allOrganizations: Organization[]
}

const SYSTEM_ROLE_OPTIONS = [
  { value: 'user', label: 'Usuário', description: 'Acesso às organizações vinculadas' },
  { value: 'admin', label: 'Admin', description: 'Acesso ao painel de administração' },
]

const ORG_ROLE_OPTIONS = [
  { value: 'master', label: 'Master' },
  { value: 'manager', label: 'Gerente' },
  { value: 'user', label: 'Usuário' },
]

export function UserManageModal({
  member,
  open,
  onOpenChange,
  onSaved,
  allOrganizations,
}: UserManageModalProps) {
  const [systemRole, setSystemRole] = useState<string>('user')
  const [userOrgs, setUserOrgs] = useState<UserOrgMembership[]>([])
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addOrgId, setAddOrgId] = useState('')
  const [addRole, setAddRole] = useState<string>('user')
  const [isSavingAdd, setIsSavingAdd] = useState(false)
  const [showAdminConfirm, setShowAdminConfirm] = useState(false)
  const [pendingRole, setPendingRole] = useState<string | null>(null)
  const [removeOrgId, setRemoveOrgId] = useState<string | null>(null)
  const [removeOrgName, setRemoveOrgName] = useState('')
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [fetchedOrgs, setFetchedOrgs] = useState<{ id: string; name: string }[]>([])

  const loadUserOrgs = useCallback(async (userId: string) => {
    setIsLoadingOrgs(true)
    try {
      const result = await listUserOrgsAction(userId)
      if (result.success) {
        setUserOrgs(result.data)
      }
    } finally {
      setIsLoadingOrgs(false)
    }
  }, [])

  useEffect(() => {
    if (open && member) {
      setSystemRole(member.user?.role ?? 'user')
      loadUserOrgs(member.user?.id ?? member.id)
      listAllOrgNamesAction().then((result) => {
        if (result.success) {
          setFetchedOrgs(result.data)
        }
      })
    }
    if (!open) {
      setShowAddForm(false)
      setAddOrgId('')
      setAddRole('user')
      setUserOrgs([])
      setShowAdminConfirm(false)
      setPendingRole(null)
      setShowRemoveConfirm(false)
      setRemoveOrgId(null)
      setRemoveOrgName('')
      setFetchedOrgs([])
    }
  }, [open, member?.user?.id, member?.id, loadUserOrgs])

  const handleSystemRoleChange = async (newRole: string) => {
    if (!member) return
    if (newRole === 'admin') {
      setPendingRole(newRole)
      setShowAdminConfirm(true)
      return
    }
    await executeSystemRoleChange(newRole)
  }

  const executeSystemRoleChange = async (newRole: string) => {
    if (!member) return
    const prev = systemRole
    setSystemRole(newRole)
    try {
      const result = await updateUserSystemRoleAction(member.user.id, newRole as 'user' | 'admin')
      if (result.success) {
        toast.success('Role do sistema atualizado')
        onSaved()
      } else {
        toast.error(result.error || 'Erro ao atualizar role')
        setSystemRole(prev)
      }
    } catch {
      toast.error('Erro de conexão ao atualizar role')
      setSystemRole(prev)
    }
  }

  const handleAdminConfirm = async () => {
    if (pendingRole) {
      await executeSystemRoleChange(pendingRole)
    }
    setShowAdminConfirm(false)
    setPendingRole(null)
  }

  const handleAdminCancel = () => {
    setShowAdminConfirm(false)
    setPendingRole(null)
  }

  const handleOrgRoleChange = async (orgId: string, newRole: string) => {
    if (!member) return
    const prevOrgs = [...userOrgs]
    setUserOrgs((prev) => prev.map((o) => o.organizationId === orgId ? { ...o, role: newRole } : o))
    try {
      const result = await updateUserOrgRoleAction(member.user.id, orgId, newRole as 'master' | 'manager' | 'user')
      if (result.success) {
        toast.success('Role na organização atualizado')
        onSaved()
      } else {
        toast.error(result.error || 'Erro ao atualizar role')
        setUserOrgs(prevOrgs)
      }
    } catch {
      toast.error('Erro de conexão ao atualizar role')
      setUserOrgs(prevOrgs)
    }
  }

  const handleRemoveFromOrg = (orgId: string, orgName: string) => {
    if (!member) return
    setRemoveOrgId(orgId)
    setRemoveOrgName(orgName)
    setShowRemoveConfirm(true)
  }

  const handleRemoveConfirm = async () => {
    if (!member || !removeOrgId) return
    try {
      setUserOrgs((prev) => prev.filter((o) => o.organizationId !== removeOrgId))
      const result = await removeUserFromOrgAction(member.user.id, removeOrgId)
      if (result.success) {
        toast.success('Usuário removido da organização')
        onSaved()
      } else {
        toast.error(result.error || 'Erro ao remover usuário')
        loadUserOrgs(member.user.id)
      }
    } finally {
      setShowRemoveConfirm(false)
      setRemoveOrgId(null)
      setRemoveOrgName('')
    }
  }

  const handleAddToOrg = async () => {
    if (!member || !addOrgId) return
    setIsSavingAdd(true)
    try {
      const result = await addUserToOrgAction(member.user.id, addOrgId, addRole as 'master' | 'manager' | 'user')
      if (result.success) {
        toast.success('Usuário adicionado à organização')
        const orgList = fetchedOrgs.length > 0 ? fetchedOrgs : allOrganizations
        const org = orgList.find((o) => o.id === addOrgId)
        setUserOrgs((prev) => [
          ...prev,
          { organizationId: addOrgId, organizationName: org?.name ?? addOrgId, role: addRole },
        ])
        setShowAddForm(false)
        setAddOrgId('')
        setAddRole('user')
        onSaved()
      } else {
        toast.error(result.error || 'Erro ao adicionar usuário')
      }
    } finally {
      setIsSavingAdd(false)
    }
  }

  if (!member) return null

  const systemRoleDescription = SYSTEM_ROLE_OPTIONS.find((r) => r.value === systemRole)?.description
  const assignedOrgIds = new Set(userOrgs.map((o) => o.organizationId))
  const orgListForDropdown = fetchedOrgs.length > 0 ? fetchedOrgs : allOrganizations
  const availableOrgs = orgListForDropdown.filter((o) => !assignedOrgIds.has(o.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Gerenciar Usuário</DialogTitle>
          <DialogDescription>
            {member.user?.name ?? '—'} · {member.user?.email ?? '—'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Role do Sistema */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Role do Sistema</p>
            <Select value={systemRole} onValueChange={handleSystemRoleChange}>
              <SelectTrigger aria-label="Role do sistema">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYSTEM_ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {systemRoleDescription && (
              <p className="text-xs text-muted-foreground">{systemRoleDescription}</p>
            )}
          </div>

          <Separator />

          {/* Organizações */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Organizações {!isLoadingOrgs && `(${userOrgs.length})`}
              </p>
              {!showAddForm && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3 w-3" />
                  Adicionar
                </Button>
              )}
            </div>

            {isLoadingOrgs ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
              </div>
            ) : userOrgs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Usuário não pertence a nenhuma organização
              </p>
            ) : (
              <div className="space-y-2">
                {userOrgs.map((uo) => (
                  <div
                    key={uo.organizationId}
                    className="flex items-center gap-2 p-2 rounded-md border dark:border-border bg-muted/30 dark:bg-muted/50"
                  >
                    <span className="flex-1 text-sm truncate">{uo.organizationName}</span>
                    <Select
                      value={uo.role}
                      onValueChange={(v) => handleOrgRoleChange(uo.organizationId, v)}
                    >
                      <SelectTrigger className="h-7 w-[110px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORG_ROLE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveFromOrg(uo.organizationId, uo.organizationName)}
                      aria-label={`Remover de ${uo.organizationName}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Inline add form */}
            {showAddForm && (
              <fieldset className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-md border border-dashed dark:border-border">
                <Select value={addOrgId} onValueChange={setAddOrgId}>
                  <SelectTrigger className="h-7 flex-1 text-xs" aria-label="Selecionar organização">
                    <SelectValue placeholder="Organização..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOrgs.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nenhuma organização disponível
                      </div>
                    ) : (
                      availableOrgs.map((org) => (
                        <SelectItem key={org.id} value={org.id} className="text-xs">
                          {org.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Select value={addRole} onValueChange={setAddRole}>
                    <SelectTrigger className="h-7 w-[110px] text-xs" aria-label="Selecionar role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORG_ROLE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleAddToOrg}
                    disabled={!addOrgId || isSavingAdd}
                  >
                    Salvar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => { setShowAddForm(false); setAddOrgId(''); setAddRole('user') }}
                    aria-label="Cancelar adição de organização"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </fieldset>
            )}
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={showAdminConfirm} onOpenChange={setShowAdminConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promover a Administrador do Sistema</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a promover {member.user?.name ?? 'este usuário'} a Administrador do Sistema.
              Esta ação dará acesso completo ao painel admin. Confirmar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleAdminCancel}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleAdminConfirm}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da organização</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este usuário da organização <strong>{removeOrgName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
