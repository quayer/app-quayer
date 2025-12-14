'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/igniter.client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Users, UserPlus, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  listOrganizationMembersAction,
  listAvailableUsersForOrganizationAction,
  addMemberToOrganizationAction,
  removeMemberFromOrganizationAction,
} from '../actions'

interface Organization {
  id: string
  name: string
  document: string
  type: 'pf' | 'pj'
  billingType: string
  maxInstances: number
  maxUsers: number
}

interface Member {
  userId: string
  role: string
  user: {
    id: string
    name: string | null
    email: string
    isActive: boolean
  }
}

interface AvailableUser {
  id: string
  name: string | null
  email: string
}

interface EditOrganizationDialogProps {
  organization: Organization | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function EditOrganizationDialog({
  organization,
  open,
  onOpenChange,
  onSuccess
}: EditOrganizationDialogProps) {
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    billingType: 'free' as 'free' | 'basic' | 'pro' | 'enterprise',
    maxInstances: 5,
    maxUsers: 3,
  })

  // Members state
  const [showMembers, setShowMembers] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(false)
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const [newMemberUserId, setNewMemberUserId] = useState('')
  const [newMemberRole, setNewMemberRole] = useState<'master' | 'manager' | 'user'>('user')

  useEffect(() => {
    if (organization) {
      setFormData({
        name: organization.name,
        billingType: organization.billingType as any,
        maxInstances: organization.maxInstances,
        maxUsers: organization.maxUsers,
      })
      // Reset members state
      setShowMembers(false)
      setMembers([])
      setAvailableUsers([])
    }
  }, [organization])

  // Load members when section is expanded
  useEffect(() => {
    if (showMembers && organization) {
      loadMembers()
      loadAvailableUsers()
    }
  }, [showMembers, organization])

  const loadMembers = async () => {
    if (!organization) return
    setIsLoadingMembers(true)
    try {
      const result = await listOrganizationMembersAction(organization.id)
      if (result.success) {
        setMembers(result.data as Member[])
      }
    } catch (err) {
      console.error('Erro ao carregar membros:', err)
    } finally {
      setIsLoadingMembers(false)
    }
  }

  const loadAvailableUsers = async () => {
    if (!organization) return
    try {
      const result = await listAvailableUsersForOrganizationAction(organization.id)
      if (result.success) {
        setAvailableUsers(result.data as AvailableUser[])
      }
    } catch (err) {
      console.error('Erro ao carregar usuários disponíveis:', err)
    }
  }

  const handleAddMember = async () => {
    if (!organization || !newMemberUserId) return
    setIsAddingMember(true)
    try {
      const result = await addMemberToOrganizationAction({
        organizationId: organization.id,
        userId: newMemberUserId,
        role: newMemberRole,
      })
      if (result.success) {
        toast.success(result.message || 'Membro adicionado!')
        setNewMemberUserId('')
        setNewMemberRole('user')
        loadMembers()
        loadAvailableUsers()
      } else {
        toast.error(result.error || 'Erro ao adicionar membro')
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao adicionar membro')
    } finally {
      setIsAddingMember(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!organization) return
    setRemovingMemberId(userId)
    try {
      const result = await removeMemberFromOrganizationAction({
        organizationId: organization.id,
        userId,
      })
      if (result.success) {
        toast.success(result.message || 'Membro removido!')
        loadMembers()
        loadAvailableUsers()
      } else {
        toast.error(result.error || 'Erro ao remover membro')
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover membro')
    } finally {
      setRemovingMemberId(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!organization) return

    setError('')
    setIsLoading(true)

    try {
      await (api.organizations.update.mutate as any)({
        params: { id: organization.id },
        body: formData,
      })

      // Invalidate organization queries to refresh sidebar and lists
      await queryClient.invalidateQueries({ queryKey: ['organization'] })
      await queryClient.invalidateQueries({ queryKey: ['organizations'] })

      toast.success('Organização atualizada com sucesso!')

      onOpenChange(false)
      onSuccess?.()
    } catch (err: any) {
      console.error('Error updating organization:', err)

      let errorMessage = 'Erro ao atualizar organização'
      const errorData = err?.data || err?.error || err

      if (errorData?.details && Array.isArray(errorData.details)) {
        const validationErrors = errorData.details
          .map((detail: any) => detail.message)
          .join(', ')
        errorMessage = validationErrors
      } else if (errorData?.message && typeof errorData.message === 'string') {
        errorMessage = errorData.message
      } else if (errorData?.error && typeof errorData.error === 'string') {
        errorMessage = errorData.error
      } else if (err?.message && typeof err.message === 'string' && err.message !== '[object Object]') {
        errorMessage = err.message
      } else if (typeof errorData === 'object' && errorData !== null) {
        const stringified = JSON.stringify(errorData)
        if (stringified !== '{}') {
          errorMessage = stringified
        }
      }

      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'master': return 'default'
      case 'manager': return 'secondary'
      default: return 'outline'
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'master': return 'Master'
      case 'manager': return 'Gerente'
      case 'user': return 'Usuário'
      default: return role
    }
  }

  if (!organization) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Editar Organização</DialogTitle>
            <DialogDescription>
              Atualize os dados da organização
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-2">
              <Label>Documento</Label>
              <Input
                value={organization.document}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                O documento não pode ser alterado
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Input
                value={organization.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Nome da organização"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="billingType">Plano *</Label>
              <Select
                value={formData.billingType}
                onValueChange={(value: any) => setFormData({ ...formData, billingType: value })}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free (Gratuito)</SelectItem>
                  <SelectItem value="basic">Basic (Básico)</SelectItem>
                  <SelectItem value="pro">Pro (Profissional)</SelectItem>
                  <SelectItem value="enterprise">Enterprise (Empresarial)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="maxInstances">Max. Instâncias *</Label>
                <Input
                  id="maxInstances"
                  type="number"
                  min="1"
                  max="1000"
                  value={formData.maxInstances}
                  onChange={(e) => setFormData({ ...formData, maxInstances: Math.min(1000, parseInt(e.target.value) || 1) })}
                  required
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">Limite: 1-1000</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="maxUsers">Max. Usuários *</Label>
                <Input
                  id="maxUsers"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.maxUsers}
                  onChange={(e) => setFormData({ ...formData, maxUsers: Math.min(100, parseInt(e.target.value) || 1) })}
                  required
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">Limite: 1-100</p>
              </div>
            </div>

            {/* Members Section */}
            <Separator className="my-2" />

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowMembers(!showMembers)}
                className="flex items-center justify-between w-full p-2 rounded-md hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="font-medium">Membros da Organização</span>
                  {members.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{members.length}</Badge>
                  )}
                </div>
                {showMembers ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showMembers && (
                <div className="space-y-3 pl-2">
                  {/* Add Member Form */}
                  <div className="flex gap-2 items-end p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1">
                      <Label className="text-xs">Usuário</Label>
                      <Select
                        value={newMemberUserId}
                        onValueChange={setNewMemberUserId}
                        disabled={isAddingMember}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableUsers.length === 0 ? (
                            <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                              Nenhum usuário disponível
                            </div>
                          ) : (
                            availableUsers.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.name || user.email}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-28">
                      <Label className="text-xs">Cargo</Label>
                      <Select
                        value={newMemberRole}
                        onValueChange={(v: any) => setNewMemberRole(v)}
                        disabled={isAddingMember}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="master">Master</SelectItem>
                          <SelectItem value="manager">Gerente</SelectItem>
                          <SelectItem value="user">Usuário</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddMember}
                      disabled={!newMemberUserId || isAddingMember}
                      className="h-9"
                    >
                      {isAddingMember ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* Members List */}
                  {isLoadingMembers ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : members.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum membro encontrado
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {members.map((member) => (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between p-2 rounded-md border bg-background"
                        >
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="text-sm font-medium">
                                {member.user.name || 'Sem nome'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {member.user.email}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={getRoleBadgeVariant(member.role)}>
                              {getRoleLabel(member.role)}
                            </Badge>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveMember(member.userId)}
                              disabled={removingMemberId === member.userId}
                            >
                              {removingMemberId === member.userId ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
