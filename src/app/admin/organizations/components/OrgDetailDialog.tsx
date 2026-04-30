'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Plug,
  Webhook,
  Mail,
  X,
  CheckCircle2,
  XCircle,
  Users,
  Radio,
  Globe,
  Info,
  Building2,
  Clock,
  Trash2,
  Pencil,
  Loader2,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'
import { UserManageModal } from './UserManageModal'
import {
  listOrgMembersAction,
  listOrgInstancesAction,
  listOrgWebhooksAction,
  updateOrganizationAction,
  type OrgMember,
  type OrgInstance,
  type OrgWebhook,
} from '../../actions'
import {
  createInvitationAction,
  listOrgInvitationsAction,
  deleteInvitationAction,
  type OrgInvitation,
} from '../../invitations/actions'
import type { Organization } from '../types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/client/components/ui/tabs'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/client/components/ui/avatar'
import { Separator } from '@/client/components/ui/separator'

interface OrgDetailDialogProps {
  org: Organization | null
  open: boolean
  onOpenChange: (open: boolean) => void
  allOrganizations: Organization[]
  onOrgUpdated?: () => void
}

interface EditFormData {
  name: string
  document: string
  type: 'pf' | 'pj'
  billingType: 'free' | 'basic' | 'pro' | 'enterprise'
  maxInstances: number
  maxUsers: number
}

const ORG_ROLE_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  master: { label: 'Master', variant: 'default' },
  manager: { label: 'Gerente', variant: 'secondary' },
  user: { label: 'Usuário', variant: 'outline' },
}

const INVITE_STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pending: { label: 'Pendente', variant: 'outline' },
  accepted: { label: 'Aceito', variant: 'default' },
  expired: { label: 'Expirado', variant: 'secondary' },
}

function initials(name: string) {
  if (!name?.trim()) return '?'
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
}

export function OrgDetailDialog({ org, open, onOpenChange, allOrganizations, onOrgUpdated }: OrgDetailDialogProps) {
  const [members, setMembers] = useState<OrgMember[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [managingMember, setManagingMember] = useState<OrgMember | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Inline edit state
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editForm, setEditForm] = useState<EditFormData>({
    name: '', document: '', type: 'pj', billingType: 'free', maxInstances: 5, maxUsers: 10,
  })

  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('user')
  const [inviteExpiresDays, setInviteExpiresDays] = useState('7')
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false)

  const [invitations, setInvitations] = useState<OrgInvitation[]>([])
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false)

  const [instances, setInstances] = useState<OrgInstance[]>([])
  const [isLoadingInstances, setIsLoadingInstances] = useState(false)

  const [webhooks, setWebhooks] = useState<OrgWebhook[]>([])
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false)

  const loadMembers = useCallback(async (organizationId: string, signal: { cancelled: boolean }) => {
    setIsLoading(true)
    try {
      const result = await listOrgMembersAction(organizationId)
      if (!signal.cancelled && result.success) {
        setMembers(result.data)
      } else if (!signal.cancelled && !result.success) {
        toast.error(result.error || 'Erro ao carregar membros')
      }
    } catch (error: unknown) {
      if (!signal.cancelled) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido'
        toast.error(message)
      }
    } finally {
      if (!signal.cancelled) setIsLoading(false)
    }
  }, [])

  const loadInstances = useCallback(async (organizationId: string, signal: { cancelled: boolean }) => {
    setIsLoadingInstances(true)
    try {
      const result = await listOrgInstancesAction(organizationId)
      if (!signal.cancelled && result.success) {
        setInstances(result.data)
      } else if (!signal.cancelled && !result.success) {
        toast.error(result.error || 'Erro ao carregar instâncias')
      }
    } catch (error: unknown) {
      if (!signal.cancelled) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido'
        toast.error(message)
      }
    } finally {
      if (!signal.cancelled) setIsLoadingInstances(false)
    }
  }, [])

  const loadWebhooks = useCallback(async (organizationId: string, signal: { cancelled: boolean }) => {
    setIsLoadingWebhooks(true)
    try {
      const result = await listOrgWebhooksAction(organizationId)
      if (!signal.cancelled && result.success) {
        setWebhooks(result.data)
      } else if (!signal.cancelled && !result.success) {
        toast.error(result.error || 'Erro ao carregar webhooks')
      }
    } catch (error: unknown) {
      if (!signal.cancelled) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido'
        toast.error(message)
      }
    } finally {
      if (!signal.cancelled) setIsLoadingWebhooks(false)
    }
  }, [])

  const loadInvitations = useCallback(async (organizationId: string, signal: { cancelled: boolean }) => {
    setIsLoadingInvitations(true)
    try {
      const result = await listOrgInvitationsAction(organizationId)
      if (!signal.cancelled && result.success) {
        setInvitations(result.data)
      }
    } catch {
      // silent
    } finally {
      if (!signal.cancelled) setIsLoadingInvitations(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !org) {
      setMembers([])
      setInstances([])
      setWebhooks([])
      setInvitations([])
      setIsLoading(false)
      setIsLoadingInstances(false)
      setIsLoadingWebhooks(false)
      setIsLoadingInvitations(false)
      setManagingMember(null)
      setModalOpen(false)
      setShowInviteForm(false)
      setInviteEmail('')
      setIsEditing(false)
      return
    }

    const signal = { cancelled: false }

    loadMembers(org.id, signal)
    loadInstances(org.id, signal)
    loadWebhooks(org.id, signal)
    loadInvitations(org.id, signal)

    return () => { signal.cancelled = true }
  }, [open, org?.id, loadMembers, loadInstances, loadWebhooks, loadInvitations])

  const handleManage = (member: OrgMember) => {
    setManagingMember(member)
    setModalOpen(true)
  }

  const handleModalSaved = () => {
    if (org) loadMembers(org.id, { cancelled: false })
  }

  const handleSendInvite = async () => {
    if (!org || !inviteEmail.trim()) {
      toast.error('Email é obrigatório')
      return
    }

    setIsSubmittingInvite(true)
    try {
      const result = await createInvitationAction({
        email: inviteEmail.trim(),
        role: inviteRole,
        organizationId: org.id,
        expiresInDays: parseInt(inviteExpiresDays),
      })

      if (result.success) {
        toast.success(`Convite enviado para ${inviteEmail.trim()}`)
        setInviteEmail('') // limpa só o email, mantém form aberto
        loadInvitations(org.id, { cancelled: false }) // refresh lista
      } else {
        toast.error(result.error || 'Erro ao enviar convite')
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      toast.error(message)
    } finally {
      setIsSubmittingInvite(false)
    }
  }

  const handleCancelInvite = async (invitationId: string) => {
    try {
      const result = await deleteInvitationAction(invitationId)
      if (result.success) {
        toast.success('Convite cancelado')
        setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId))
      } else {
        toast.error(result.error || 'Erro ao cancelar convite')
      }
    } catch {
      toast.error('Erro ao cancelar convite')
    }
  }

  const handleStartEdit = () => {
    if (!org) return
    setEditForm({
      name: org.name,
      document: org.document ?? '',
      type: (org.type as 'pf' | 'pj') ?? 'pj',
      billingType: (org.billingType as 'free' | 'basic' | 'pro' | 'enterprise') ?? 'free',
      maxInstances: org.maxInstances,
      maxUsers: org.maxUsers,
    })
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  const handleSaveEdit = async () => {
    if (!org) return
    setIsSaving(true)
    try {
      const result = await updateOrganizationAction(org.id, {
        ...editForm,
        document: editForm.document.trim() || null,
      })
      if (result.success) {
        toast.success('Organização atualizada')
        setIsEditing(false)
        onOrgUpdated?.()
      } else {
        toast.error(typeof result.error === 'string' ? result.error : 'Erro ao atualizar')
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar')
    } finally {
      setIsSaving(false)
    }
  }

  if (!org) return null

  const pendingInvitations = invitations.filter((inv) => inv.status === 'pending')

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[800px] max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-semibold truncate">
                    {org.name}
                  </DialogTitle>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {org.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {(org.billingType ?? 'free').toUpperCase()}
                    </Badge>
                    <Badge
                      variant={org.isActive ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {org.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                    {org.document && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {org.document}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Content with Tabs */}
          <Tabs defaultValue="users" className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-3">
              <TabsList className="grid w-full grid-cols-4 h-auto p-1">
                <TabsTrigger value="users" className="text-xs gap-1 px-2 py-1.5">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Usuários</span>
                  <span className="text-muted-foreground">
                    {isLoading ? '' : `(${members.length})`}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="instances" className="text-xs gap-1 px-2 py-1.5">
                  <Radio className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Instâncias</span>
                  <span className="text-muted-foreground">
                    {isLoadingInstances ? '' : `(${instances.length})`}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="webhooks" className="text-xs gap-1 px-2 py-1.5">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Webhooks</span>
                  <span className="text-muted-foreground">
                    {isLoadingWebhooks ? '' : `(${webhooks.length})`}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="info" className="text-xs gap-1 px-2 py-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Info</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* USERS TAB */}
              <TabsContent value="users" className="mt-0 space-y-3">
                {/* Usage bar */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {members.length} / {org.maxUsers} usuários
                  </span>
                  <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        members.length >= org.maxUsers ? 'bg-destructive' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(100, org.maxUsers > 0 ? (members.length / org.maxUsers) * 100 : 0)}%` }}
                    />
                  </div>
                </div>

                {/* Invite button */}
                {!showInviteForm && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowInviteForm(true)}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Convidar por Email
                  </Button>
                )}

                {/* Inline invite form */}
                {showInviteForm && (
                  <fieldset className="rounded-lg border p-3 space-y-3 bg-muted/30">
                    <legend className="sr-only">Formulário de convite por email</legend>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Convidar por Email</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => { setShowInviteForm(false); setInviteEmail('') }}
                        aria-label="Fechar formulário de convite"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {members.length >= org.maxUsers && (
                      <div className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5">
                        Limite de {org.maxUsers} usuários atingido. Aumente o limite na aba Info ou via edição.
                      </div>
                    )}
                    <Input
                      type="email"
                      placeholder="usuario@exemplo.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="h-8 text-sm"
                      aria-label="Email do convidado"
                      id="invite-email"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={inviteRole} onValueChange={setInviteRole}>
                        <SelectTrigger className="h-8 text-xs" aria-label="Role do convidado">
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="master">Master</SelectItem>
                          <SelectItem value="manager">Gerente</SelectItem>
                          <SelectItem value="user">Usuário</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={inviteExpiresDays} onValueChange={setInviteExpiresDays}>
                        <SelectTrigger className="h-8 text-xs" aria-label="Expiração do convite">
                          <SelectValue placeholder="Expiração" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">7 dias</SelectItem>
                          <SelectItem value="14">14 dias</SelectItem>
                          <SelectItem value="30">30 dias</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={handleSendInvite}
                      disabled={isSubmittingInvite || !inviteEmail.trim()}
                    >
                      {isSubmittingInvite ? 'Enviando...' : 'Enviar Convite'}
                    </Button>
                  </fieldset>
                )}

                {/* Pending invitations */}
                {pendingInvitations.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Convites pendentes ({pendingInvitations.length})
                    </span>
                    {pendingInvitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-dashed"
                      >
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{inv.email}</div>
                          <div className="text-xs text-muted-foreground">
                            Expira em {new Date(inv.expiresAt).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        <Badge variant={INVITE_STATUS_CONFIG[inv.status]?.variant ?? 'outline'} className="shrink-0 text-xs">
                          {ORG_ROLE_CONFIG[inv.role]?.label ?? inv.role}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                          onClick={() => handleCancelInvite(inv.id)}
                          aria-label={`Cancelar convite para ${inv.email}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Members grid */}
                {isLoading ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="flex-1 space-y-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                        <Skeleton className="h-6 w-16" />
                      </div>
                    ))}
                  </div>
                ) : members.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    Nenhum usuário nesta organização
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {members.map((member) => {
                      const roleConfig = ORG_ROLE_CONFIG[member.role] ?? { label: member.role, variant: 'outline' as const }
                      return (
                        <div
                          key={member.id}
                          className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="text-xs">
                              {initials(member.user?.name ?? '')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{member.user?.name ?? '—'}</div>
                            <div className="text-xs text-muted-foreground truncate">{member.user?.email ?? '—'}</div>
                          </div>
                          <Badge variant={roleConfig.variant} className="shrink-0 text-xs">
                            {roleConfig.label}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-xs h-7"
                            onClick={() => handleManage(member)}
                            aria-label={`Gerenciar ${member.user?.name ?? 'membro'}`}
                          >
                            Gerenciar
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>

              {/* INSTANCES TAB */}
              <TabsContent value="instances" className="mt-0 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {instances.length} / {org.maxInstances} instâncias usadas
                  </span>
                  <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        instances.length >= org.maxInstances ? 'bg-destructive' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(100, org.maxInstances > 0 ? (instances.length / org.maxInstances) * 100 : 0)}%` }}
                    />
                  </div>
                </div>

                {isLoadingInstances ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                  </div>
                ) : instances.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    Nenhuma instância configurada nesta organização
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {instances.map((instance) => (
                      <div
                        key={instance.id}
                        className="flex items-center gap-3 p-3 rounded-lg border"
                      >
                        <Plug className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{instance.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {instance.phoneNumber || '—'}
                          </div>
                        </div>
                        <Badge
                          variant={instance.status === 'connected' ? 'default' : 'secondary'}
                          className="shrink-0 text-xs flex items-center gap-1"
                        >
                          {instance.status === 'connected' ? (
                            <><CheckCircle2 className="h-3 w-3" /> Conectado</>
                          ) : (
                            <><XCircle className="h-3 w-3" /> Desconectado</>
                          )}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* WEBHOOKS TAB */}
              <TabsContent value="webhooks" className="mt-0 space-y-3">
                {isLoadingWebhooks ? (
                  <div className="grid gap-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                  </div>
                ) : webhooks.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    Nenhum webhook configurado nesta organização
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {webhooks.map((wh) => (
                      <div key={wh.id} className="flex items-start gap-3 p-3 rounded-lg border">
                        <Webhook className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="text-sm font-medium truncate">{wh.url}</div>
                          <div className="flex flex-wrap gap-1">
                            {wh.events.slice(0, 3).map((ev) => (
                              <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>
                            ))}
                            {wh.events.length > 3 && (
                              <Badge variant="outline" className="text-xs">+{wh.events.length - 3}</Badge>
                            )}
                          </div>
                          {wh.instanceName && (
                            <div className="text-xs text-muted-foreground">Instância: {wh.instanceName}</div>
                          )}
                        </div>
                        <Badge
                          variant={wh.isActive ? 'default' : 'secondary'}
                          className="shrink-0 text-xs"
                        >
                          {wh.isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* INFO TAB */}
              <TabsContent value="info" className="mt-0 space-y-4">
                {isEditing ? (
                  /* ── EDIT MODE ── */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Editando organização</span>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancelEdit} disabled={isSaving}>
                        Cancelar
                      </Button>
                    </div>

                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="grid gap-3">
                        <div className="grid gap-1.5">
                          <label htmlFor="edit-name" className="text-xs font-medium text-muted-foreground">Nome *</label>
                          <Input
                            id="edit-name"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            disabled={isSaving}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <label htmlFor="edit-doc" className="text-xs font-medium text-muted-foreground">Documento (CPF/CNPJ)</label>
                          <Input
                            id="edit-doc"
                            placeholder="000.000.000-00 ou 00.000.000/0001-00"
                            value={editForm.document}
                            onChange={(e) => setEditForm({ ...editForm, document: e.target.value })}
                            disabled={isSaving}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="grid gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground">Tipo</span>
                            <Select
                              value={editForm.type}
                              onValueChange={(v) => setEditForm({ ...editForm, type: v as 'pf' | 'pj' })}
                              disabled={isSaving}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pf">Pessoa Física</SelectItem>
                                <SelectItem value="pj">Pessoa Jurídica</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground">Plano</span>
                            <Select
                              value={editForm.billingType}
                              onValueChange={(v) => setEditForm({ ...editForm, billingType: v as 'free' | 'basic' | 'pro' | 'enterprise' })}
                              disabled={isSaving}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="free">Free</SelectItem>
                                <SelectItem value="basic">Basic</SelectItem>
                                <SelectItem value="pro">Pro</SelectItem>
                                <SelectItem value="enterprise">Enterprise</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="grid gap-1.5">
                            <label htmlFor="edit-max-inst" className="text-xs font-medium text-muted-foreground">Max. Instâncias</label>
                            <Input
                              id="edit-max-inst"
                              type="number"
                              min="1"
                              value={editForm.maxInstances}
                              onChange={(e) => setEditForm({ ...editForm, maxInstances: parseInt(e.target.value) || 1 })}
                              disabled={isSaving}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <label htmlFor="edit-max-users" className="text-xs font-medium text-muted-foreground">Max. Usuários</label>
                            <Input
                              id="edit-max-users"
                              type="number"
                              min="1"
                              value={editForm.maxUsers}
                              onChange={(e) => setEditForm({ ...editForm, maxUsers: parseInt(e.target.value) || 1 })}
                              disabled={isSaving}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="w-full h-8"
                      onClick={handleSaveEdit}
                      disabled={isSaving || !editForm.name.trim()}
                    >
                      {isSaving ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Salvando...</>
                      ) : (
                        <><Save className="h-3.5 w-3.5 mr-2" /> Salvar Alterações</>
                      )}
                    </Button>
                  </div>
                ) : (
                  /* ── VIEW MODE ── */
                  <div className="space-y-4">
                    {/* Edit toggle */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleStartEdit}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Editar Organização
                    </Button>

                    {/* Owner / Master contact */}
                    {(() => {
                      const master = members.find((m) => m.role === 'master')
                      return master ? (
                        <div className="rounded-lg border p-4 space-y-3">
                          <span className="text-sm font-medium">Responsável (Master)</span>
                          <Separator />
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Nome</span>
                              <span className="font-medium">{master.user?.name ?? '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Email</span>
                              <span className="font-medium truncate ml-4">{master.user?.email ?? '—'}</span>
                            </div>
                          </div>
                        </div>
                      ) : null
                    })()}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-lg border p-4 space-y-3">
                        <span className="text-sm font-medium">Limites</span>
                        <Separator />
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Instâncias</span>
                            <span className={`font-medium font-mono ${instances.length >= org.maxInstances ? 'text-destructive' : ''}`}>
                              {instances.length} / {org.maxInstances}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Usuários</span>
                            <span className={`font-medium font-mono ${members.length >= org.maxUsers ? 'text-destructive' : ''}`}>
                              {members.length} / {org.maxUsers}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border p-4 space-y-3">
                        <span className="text-sm font-medium">Detalhes</span>
                        <Separator />
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Plano</span>
                            <Badge className="text-xs">{(org.billingType ?? 'free').toUpperCase()}</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Status</span>
                            <Badge variant={org.isActive ? 'default' : 'secondary'} className="text-xs">
                              {org.isActive ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Criado em</span>
                            <span className="font-medium text-xs">
                              {new Date(org.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* All invitations history */}
                    {invitations.length > 0 && (
                      <div className="rounded-lg border p-4 space-y-3">
                        <span className="text-sm font-medium">Histórico de Convites ({invitations.length})</span>
                        <Separator />
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {invitations.map((inv) => {
                            const statusConfig = INVITE_STATUS_CONFIG[inv.status] ?? { label: inv.status, variant: 'outline' as const }
                            return (
                              <div key={inv.id} className="flex items-center gap-2 text-sm">
                                <span className="truncate flex-1">{inv.email}</span>
                                <Badge variant={ORG_ROLE_CONFIG[inv.role]?.variant ?? 'outline'} className="text-xs shrink-0">
                                  {ORG_ROLE_CONFIG[inv.role]?.label ?? inv.role}
                                </Badge>
                                <Badge variant={statusConfig.variant} className="text-xs shrink-0">
                                  {statusConfig.label}
                                </Badge>
                                {inv.status === 'pending' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                                    onClick={() => handleCancelInvite(inv.id)}
                                    aria-label={`Cancelar convite para ${inv.email}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      <UserManageModal
        member={managingMember}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSaved={handleModalSaved}
        allOrganizations={allOrganizations}
      />
    </>
  )
}
