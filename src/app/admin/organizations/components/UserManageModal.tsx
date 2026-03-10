'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Trash2, Plus, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  updateUserSystemRoleAction,
  updateUserOrgRoleAction,
  addUserToOrgAction,
  removeUserFromOrgAction,
  listUserOrgsAction,
  type OrgMember,
  type UserOrgMembership,
} from '../../actions'
import type { Organization } from '../page'

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

  useEffect(() => {
    if (open && member) {
      setSystemRole(member.user.role)
      loadUserOrgs(member.user.id)
    }
    if (!open) {
      setShowAddForm(false)
      setAddOrgId('')
      setAddRole('user')
      setUserOrgs([])
    }
  }, [open, member])

  const loadUserOrgs = async (userId: string) => {
    setIsLoadingOrgs(true)
    try {
      const result = await listUserOrgsAction(userId)
      if (result.success) {
        setUserOrgs(result.data)
      }
    } finally {
      setIsLoadingOrgs(false)
    }
  }

  const handleSystemRoleChange = async (newRole: string) => {
    if (!member) return
    const prev = systemRole
    setSystemRole(newRole)
    const result = await updateUserSystemRoleAction(member.user.id, newRole as 'user' | 'admin')
    if (result.success) {
      toast.success('Role do sistema atualizado')
      onSaved()
    } else {
      toast.error(result.error || 'Erro ao atualizar role')
      setSystemRole(prev)
    }
  }

  const handleOrgRoleChange = async (orgId: string, newRole: string) => {
    if (!member) return
    setUserOrgs((prev) => prev.map((o) => o.organizationId === orgId ? { ...o, role: newRole } : o))
    const result = await updateUserOrgRoleAction(member.user.id, orgId, newRole as 'master' | 'manager' | 'user')
    if (result.success) {
      toast.success('Role na organização atualizado')
      onSaved()
    } else {
      toast.error(result.error || 'Erro ao atualizar role')
      if (member) loadUserOrgs(member.user.id)
    }
  }

  const handleRemoveFromOrg = async (orgId: string, orgName: string) => {
    if (!member) return
    if (!confirm(`Remover ${member.user.name} de "${orgName}"?`)) return
    setUserOrgs((prev) => prev.filter((o) => o.organizationId !== orgId))
    const result = await removeUserFromOrgAction(member.user.id, orgId)
    if (result.success) {
      toast.success('Usuário removido da organização')
      onSaved()
    } else {
      toast.error(result.error || 'Erro ao remover usuário')
      loadUserOrgs(member.user.id)
    }
  }

  const handleAddToOrg = async () => {
    if (!member || !addOrgId) return
    setIsSavingAdd(true)
    try {
      const result = await addUserToOrgAction(member.user.id, addOrgId, addRole as 'master' | 'manager' | 'user')
      if (result.success) {
        toast.success('Usuário adicionado à organização')
        const org = allOrganizations.find((o) => o.id === addOrgId)
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
  const availableOrgs = allOrganizations.filter((o) => !assignedOrgIds.has(o.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Gerenciar Usuário</DialogTitle>
          <DialogDescription>
            {member.user.name} · {member.user.email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Role do Sistema */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Role do Sistema</p>
            <Select value={systemRole} onValueChange={handleSystemRoleChange}>
              <SelectTrigger>
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
                    className="flex items-center gap-2 p-2 rounded-md border bg-muted/30"
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
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Inline add form */}
            {showAddForm && (
              <div className="flex items-center gap-2 p-2 rounded-md border border-dashed">
                <Select value={addOrgId} onValueChange={setAddOrgId}>
                  <SelectTrigger className="h-7 flex-1 text-xs">
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
                <Select value={addRole} onValueChange={setAddRole}>
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
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
