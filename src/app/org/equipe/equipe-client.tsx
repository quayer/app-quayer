'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  UserPlus,
  MoreHorizontal,
  Send,
  X,
  Shield,
  Trash2,
  Mail,
  Users,
  Loader2,
  CheckCircle2,
  Clock,
} from 'lucide-react'

import { api } from '@/igniter.client'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Badge } from '@/client/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/client/components/ui/avatar'
import { Skeleton } from '@/client/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrgRole = 'master' | 'manager' | 'user'

interface OrgMember {
  userId: string
  role: OrgRole
  isActive: boolean
  user: {
    id: string
    name: string | null
    email: string
    avatarUrl?: string | null
  }
}

interface OrgInvitation {
  id: string
  email: string
  role: OrgRole
  expiresAt: string | Date
  usedAt: string | Date | null
  createdAt: string | Date
}

type RowKind = 'member' | 'invitation'

interface UnifiedRow {
  kind: RowKind
  key: string
  name: string
  email: string
  role: OrgRole
  status: 'active' | 'inactive' | 'pending' | 'expired' | 'accepted'
  avatarUrl?: string | null
  userId?: string
  invitationId?: string
}

// ---------------------------------------------------------------------------

const ROLE_LABEL: Record<OrgRole, string> = {
  master: 'Proprietário',
  manager: 'Gerente',
  user: 'Usuário',
}

function roleBadgeVariant(role: OrgRole) {
  if (role === 'master') return 'default' as const
  if (role === 'manager') return 'secondary' as const
  return 'outline' as const
}

export function EquipeClient() {
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<UnifiedRow | null>(null)
  const [confirmCancelInvite, setConfirmCancelInvite] =
    useState<UnifiedRow | null>(null)
  const [changingRoleFor, setChangingRoleFor] = useState<UnifiedRow | null>(
    null,
  )

  // Fetch current org to get id
  const { data: orgResponse } = useQuery({
    queryKey: ['organization', 'current'],
    queryFn: async () => await api.organizations.getCurrent.query(),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const organization: { id: string; name: string } | null = (() => {
    const raw = orgResponse as unknown
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>
    if (r.data && typeof r.data === 'object') {
      return r.data as { id: string; name: string }
    }
    return r as { id: string; name: string }
  })()

  const organizationId = organization?.id

  // Members
  const membersQuery = useQuery({
    queryKey: ['org', organizationId, 'members'],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return { members: [] }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (api.organizations.listMembers as any).query({
        params: { id: organizationId },
      })
      return result as { data?: { members: OrgMember[] } } | { members: OrgMember[] }
    },
  })

  // Invitations (pending on this org)
  const invitesQuery = useQuery({
    queryKey: ['org', organizationId, 'invitations'],
    enabled: !!organizationId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (api.invitations.list as any).query({
        query: organizationId ? { organizationId } : {},
      })
      return result as {
        data?: { data: OrgInvitation[] }
      } | { data: OrgInvitation[] }
    },
  })

  const rows = useMemo<UnifiedRow[]>(() => {
    const members: OrgMember[] = (() => {
      const raw = membersQuery.data as unknown
      if (!raw || typeof raw !== 'object') return []
      const r = raw as Record<string, unknown>
      if (
        r.data &&
        typeof r.data === 'object' &&
        'members' in (r.data as Record<string, unknown>)
      ) {
        return (r.data as { members: OrgMember[] }).members
      }
      if ('members' in r) return (r as { members: OrgMember[] }).members
      return []
    })()

    const invitations: OrgInvitation[] = (() => {
      const raw = invitesQuery.data as unknown
      if (!raw || typeof raw !== 'object') return []
      const r = raw as Record<string, unknown>
      if (
        r.data &&
        typeof r.data === 'object' &&
        'data' in (r.data as Record<string, unknown>)
      ) {
        return (r.data as { data: OrgInvitation[] }).data
      }
      if ('data' in r && Array.isArray(r.data)) {
        return r.data as OrgInvitation[]
      }
      return []
    })()

    const now = new Date()

    const memberRows: UnifiedRow[] = members.map((m) => ({
      kind: 'member',
      key: `member:${m.userId}`,
      name: m.user.name ?? m.user.email,
      email: m.user.email,
      role: m.role,
      status: m.isActive ? 'active' : 'inactive',
      avatarUrl: m.user.avatarUrl ?? null,
      userId: m.userId,
    }))

    const invitationRows: UnifiedRow[] = invitations
      .filter((i) => !i.usedAt)
      .map((i) => {
        const exp = new Date(i.expiresAt)
        const status: UnifiedRow['status'] = exp < now ? 'expired' : 'pending'
        return {
          kind: 'invitation',
          key: `invite:${i.id}`,
          name: i.email,
          email: i.email,
          role: i.role,
          status,
          invitationId: i.id,
        }
      })

    return [...memberRows, ...invitationRows]
  }, [membersQuery.data, invitesQuery.data])

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: ['org', organizationId, 'members'],
    })
    queryClient.invalidateQueries({
      queryKey: ['org', organizationId, 'invitations'],
    })
  }

  // Mutations ---------------------------------------------------------------

  const resendMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (api.invitations.resend as any).mutate({
        params: { invitationId },
        body: { expiresInDays: 7 },
      })
    },
    onSuccess: () => {
      toast.success('Convite reenviado')
      invalidateAll()
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao reenviar')
    },
  })

  const deleteInviteMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (api.invitations.delete as any).mutate({
        params: { invitationId },
      })
    },
    onSuccess: () => {
      toast.success('Convite cancelado')
      invalidateAll()
      setConfirmCancelInvite(null)
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao cancelar convite',
      )
    },
  })

  // TODO(backend): não há endpoint `organizations.updateMember` /
  // `organizations.removeMember` expostos no controller atual — apenas
  // `addMember` existe. As ações abaixo mostram UI mas logam TODO até os
  // endpoints serem adicionados em src/server/core/organizations.
  const removeMemberMutation = useMutation({
    mutationFn: async (_userId: string) => {
      throw new Error(
        'Endpoint organizations.removeMember ainda não existe — TODO backend',
      )
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Remoção de membros ainda não disponível',
      )
    },
  })

  const changeRoleMutation = useMutation({
    mutationFn: async (_args: { userId: string; role: OrgRole }) => {
      throw new Error(
        'Endpoint organizations.updateMember ainda não existe — TODO backend',
      )
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Troca de papel ainda não disponível',
      )
    },
  })

  // ---------------------------------------------------------------------

  const isLoading =
    membersQuery.isLoading || invitesQuery.isLoading || !organizationId

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipe</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie membros e convites da sua organização.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Convidar membro
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-8 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Users className="h-10 w-10 opacity-40" />
                    <p>Nenhum membro ou convite ainda.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={row.avatarUrl || undefined}
                          alt={row.name}
                        />
                        <AvatarFallback>
                          {row.kind === 'invitation' ? (
                            <Mail className="h-4 w-4" />
                          ) : (
                            (row.name ?? '?').charAt(0).toUpperCase()
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{row.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={roleBadgeVariant(row.role)}>
                      {ROLE_LABEL[row.role] ?? row.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge row={row} />
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      row={row}
                      onResend={() =>
                        row.invitationId &&
                        resendMutation.mutate(row.invitationId)
                      }
                      onCancelInvite={() => setConfirmCancelInvite(row)}
                      onChangeRole={() => setChangingRoleFor(row)}
                      onRemove={() => setConfirmRemove(row)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Invite dialog */}
      {organizationId && (
        <InviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          organizationId={organizationId}
          onSuccess={invalidateAll}
        />
      )}

      {/* Change role dialog */}
      <ChangeRoleDialog
        row={changingRoleFor}
        onOpenChange={(v) => !v && setChangingRoleFor(null)}
        onSubmit={(role) => {
          if (changingRoleFor?.userId) {
            changeRoleMutation.mutate({
              userId: changingRoleFor.userId,
              role,
            })
          }
          setChangingRoleFor(null)
        }}
      />

      {/* Confirm remove member */}
      <AlertDialog
        open={!!confirmRemove}
        onOpenChange={(v) => !v && setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover{' '}
              <strong>{confirmRemove?.name}</strong> da organização?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (confirmRemove?.userId) {
                  removeMemberMutation.mutate(confirmRemove.userId)
                }
                setConfirmRemove(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm cancel invitation */}
      <AlertDialog
        open={!!confirmCancelInvite}
        onOpenChange={(v) => !v && setConfirmCancelInvite(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar convite</AlertDialogTitle>
            <AlertDialogDescription>
              Cancelar o convite enviado para{' '}
              <strong>{confirmCancelInvite?.email}</strong>? O link ficará
              inválido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (confirmCancelInvite?.invitationId) {
                  deleteInviteMutation.mutate(
                    confirmCancelInvite.invitationId,
                  )
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteInviteMutation.isPending
                ? 'Cancelando...'
                : 'Sim, cancelar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers UI
// ---------------------------------------------------------------------------

function StatusBadge({ row }: { row: UnifiedRow }) {
  if (row.kind === 'invitation') {
    if (row.status === 'expired') {
      return <Badge variant="destructive">Convite expirado</Badge>
    }
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        Convite pendente
      </Badge>
    )
  }
  if (row.status === 'active') {
    return (
      <Badge variant="default" className="gap-1 bg-green-500">
        <CheckCircle2 className="h-3 w-3" />
        Ativo
      </Badge>
    )
  }
  return <Badge variant="outline">Inativo</Badge>
}

function RowActions({
  row,
  onResend,
  onCancelInvite,
  onChangeRole,
  onRemove,
}: {
  row: UnifiedRow
  onResend: () => void
  onCancelInvite: () => void
  onChangeRole: () => void
  onRemove: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Abrir menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Ações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {row.kind === 'invitation' ? (
          <>
            <DropdownMenuItem onClick={onResend}>
              <Send className="mr-2 h-4 w-4" />
              Reenviar convite
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onCancelInvite}
              className="text-destructive"
            >
              <X className="mr-2 h-4 w-4" />
              Cancelar convite
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={onChangeRole}>
              <Shield className="mr-2 h-4 w-4" />
              Trocar papel
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onRemove}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remover membro
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Invite dialog
// ---------------------------------------------------------------------------

function InviteDialog({
  open,
  onOpenChange,
  organizationId,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  organizationId: string
  onSuccess: () => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('user')

  const createMutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (api.invitations.create as any).mutate({
        body: {
          email,
          role,
          organizationId,
          expiresInDays: 7,
        },
      })
    },
    onSuccess: () => {
      toast.success(`Convite enviado para ${email}`)
      setEmail('')
      setRole('user')
      onOpenChange(false)
      onSuccess()
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao enviar convite',
      )
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar membro</DialogTitle>
          <DialogDescription>
            Envie um convite por e-mail. O usuário poderá aceitar e criar
            conta se ainda não tiver.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="invite-email">E-mail</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pessoa@empresa.com"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Papel</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as OrgRole)}
            >
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Usuário</SelectItem>
                <SelectItem value="manager">Gerente</SelectItem>
                <SelectItem value="master">Proprietário</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!email.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Enviar convite
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Change role dialog
// ---------------------------------------------------------------------------

function ChangeRoleDialog({
  row,
  onOpenChange,
  onSubmit,
}: {
  row: UnifiedRow | null
  onOpenChange: (v: boolean) => void
  onSubmit: (role: OrgRole) => void
}) {
  const [role, setRole] = useState<OrgRole>('user')

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trocar papel</DialogTitle>
          <DialogDescription>
            Definir o papel de <strong>{row?.name}</strong> na organização.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-2">
          <Label htmlFor="change-role">Novo papel</Label>
          <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
            <SelectTrigger id="change-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Usuário</SelectItem>
              <SelectItem value="manager">Gerente</SelectItem>
              <SelectItem value="master">Proprietário</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => onSubmit(role)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
