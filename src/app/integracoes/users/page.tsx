'use client'

import { useState, useMemo } from 'react'
import { useAuth } from '@/lib/auth/auth-provider'
import { api } from '@/igniter.client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import {
  UserPlus,
  Copy,
  CheckCircle2,
  MoreHorizontal,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Shield,
  ShieldCheck,
  User,
  UserCog,
  UserMinus,
  Crown,
  AlertTriangle,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

type OrgRole = 'master' | 'manager' | 'user'

type Member = {
  id: string
  userId: string
  organizationId: string
  role: OrgRole
  isActive: boolean
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    role?: string
  }
}

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const currentOrgId = currentUser?.currentOrgId
  const queryClient = useQueryClient()

  // Dialog states
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [editRoleDialogOpen, setEditRoleDialogOpen] = useState(false)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)

  // Form states
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>('user')
  const [newRole, setNewRole] = useState<OrgRole>('user')
  const [inviteUrl, setInviteUrl] = useState('')
  const [error, setError] = useState('')

  // Table state
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})

  // Fetch current organization (for maxUsers limit)
  const { data: orgResponse } = useQuery({
    queryKey: ['current-organization', currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return null
      const response = await api.organizations.getCurrent.query()
      return response as unknown as { maxUsers: number; name: string; type: string }
    },
    enabled: !!currentOrgId,
  })

  // Fetch organization members
  const { data: membersResponse, isLoading, refetch } = useQuery({
    queryKey: ['organization-members', currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return { members: [] }
      // @ts-expect-error - Igniter client type issue with path params
      const response = await api.organizations.listMembers.query({
        id: currentOrgId,
      })
      return response as unknown as { members: Member[] }
    },
    enabled: !!currentOrgId,
  })

  // Invitation mutation
  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: OrgRole; organizationId: string }) => {
      // @ts-expect-error - Igniter client type issue
      return api.invitations.create.mutate({
        body: data,
      })
    },
    onSuccess: () => {
      refetch()
    },
  })

  // Update member role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: OrgRole }) => {
      if (!currentOrgId) throw new Error('No organization selected')
      return (api.organizations as any).updateMember.mutate({
        id: currentOrgId,
        userId: memberId,
        body: { role },
      })
    },
    onSuccess: () => {
      toast.success('Cargo atualizado com sucesso!')
      setEditRoleDialogOpen(false)
      setSelectedMember(null)
      refetch()
    },
    onError: (error: any) => {
      const message = error?.message || 'Erro ao atualizar cargo'
      toast.error(message)
    },
  })

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      if (!currentOrgId) throw new Error('No organization selected')
      return (api.organizations as any).removeMember.mutate({
        id: currentOrgId,
        userId: memberId,
      })
    },
    onSuccess: () => {
      toast.success('Membro removido com sucesso!')
      setRemoveDialogOpen(false)
      setSelectedMember(null)
      refetch()
    },
    onError: (error: any) => {
      const message = error?.message || 'Erro ao remover membro'
      toast.error(message)
    },
  })

  // Extract members array from response
  const members = membersResponse?.members || []

  // Get organization limits
  const maxUsers = orgResponse?.maxUsers || 10
  const currentMemberCount = members.length
  const isAtLimit = currentMemberCount >= maxUsers
  const limitPercentage = Math.min((currentMemberCount / maxUsers) * 100, 100)
  const isNearLimit = limitPercentage >= 80 && !isAtLimit

  // Get current user's role in organization
  const currentUserOrgRole = members.find(m => m.userId === currentUser?.id)?.role
  const canManageMembers = currentUserOrgRole === 'master' || currentUser?.role === 'admin'

  // Calculate statistics
  const stats = {
    total: members.length,
    active: members.filter((m) => m.isActive).length,
    inactive: members.filter((m) => !m.isActive).length,
    masters: members.filter((m) => m.role === 'master').length,
    managers: members.filter((m) => m.role === 'manager').length,
    users: members.filter((m) => m.role === 'user').length,
  }

  // Helper to get initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }

  // Role icon component
  const RoleIcon = ({ role }: { role: OrgRole }) => {
    switch (role) {
      case 'master':
        return <Crown className="h-4 w-4 text-yellow-500" />
      case 'manager':
        return <ShieldCheck className="h-4 w-4 text-blue-500" />
      default:
        return <User className="h-4 w-4 text-gray-500" />
    }
  }

  const columns: ColumnDef<Member>[] = useMemo(
    () => [
      {
        id: 'userName',
        accessorFn: (row) => row.user?.name || '',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Usuário
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          const member = row.original
          const name = member.user?.name || 'Sem nome'
          const email = member.user?.email || ''
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarImage src="" alt={name} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {getInitials(name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-medium">{name}</span>
                <span className="text-xs text-muted-foreground">{email}</span>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'role',
        header: 'Cargo na Organização',
        cell: ({ row }) => {
          const role = row.getValue('role') as OrgRole
          const roleLabels: Record<OrgRole, string> = {
            master: 'Master',
            manager: 'Gerente',
            user: 'Membro',
          }
          const roleVariants: Record<OrgRole, 'default' | 'secondary' | 'outline'> = {
            master: 'default',
            manager: 'secondary',
            user: 'outline',
          }
          return (
            <div className="flex items-center gap-2">
              <RoleIcon role={role} />
              <Badge variant={roleVariants[role]}>{roleLabels[role]}</Badge>
            </div>
          )
        },
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id))
        },
      },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ row }) => {
          const isActive = row.getValue('isActive') as boolean
          return (
            <Badge variant={isActive ? 'default' : 'destructive'}>
              {isActive ? 'Ativo' : 'Inativo'}
            </Badge>
          )
        },
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id))
        },
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Membro desde
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          return new Date(row.getValue('createdAt')).toLocaleDateString('pt-BR')
        },
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => {
          const member = row.original
          const isCurrentUser = member.userId === currentUser?.id

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
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(member.userId)
                    toast.success('ID copiado!')
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {canManageMembers && !isCurrentUser && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedMember(member)
                        setNewRole(member.role)
                        setEditRoleDialogOpen(true)
                      }}
                    >
                      <UserCog className="mr-2 h-4 w-4" />
                      Alterar cargo
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        setSelectedMember(member)
                        setRemoveDialogOpen(true)
                      }}
                    >
                      <UserMinus className="mr-2 h-4 w-4" />
                      Remover da organização
                    </DropdownMenuItem>
                  </>
                )}
                {isCurrentUser && (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    <Shield className="mr-2 h-4 w-4" />
                    Você
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [canManageMembers, currentUser?.id]
  )

  const table = useReactTable({
    data: members,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  })

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!currentOrgId) {
      setError('Nenhuma organização selecionada')
      return
    }

    try {
      const response = await inviteMutation.mutateAsync({
        email: inviteEmail,
        role: inviteRole,
        organizationId: currentOrgId,
      })

      // Handle Igniter.js response structure: { data, error }
      const result = response as any

      // Check for error in response
      if (result?.error) {
        const errorMessage = result.error?.message || result.error || 'Erro ao criar convite'
        setError(errorMessage)
        toast.error(errorMessage)
        return
      }

      // Success - extract inviteUrl from data
      const url = result?.data?.inviteUrl || result?.inviteUrl
      if (url) {
        setInviteUrl(url)
        toast.success('Convite criado com sucesso!')
      } else {
        // Fallback - convite criado mas sem URL
        toast.success('Convite criado! Verifique o email do convidado.')
        resetInviteDialog()
      }
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message || err?.message || 'Erro ao criar convite'
      setError(errorMessage)
      toast.error(errorMessage)
    }
  }

  const handleUpdateRole = async () => {
    if (!selectedMember) return
    await updateRoleMutation.mutateAsync({
      memberId: selectedMember.userId,
      role: newRole,
    })
  }

  const handleRemoveMember = async () => {
    if (!selectedMember) return
    await removeMemberMutation.mutateAsync(selectedMember.userId)
  }

  const copyInviteUrl = () => {
    navigator.clipboard.writeText(inviteUrl)
    toast.success('Link copiado!')
  }

  const resetInviteDialog = () => {
    setInviteDialogOpen(false)
    setInviteEmail('')
    setInviteRole('user')
    setInviteUrl('')
    setError('')
  }

  if (!currentOrgId) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Nenhuma organização selecionada</CardTitle>
            <CardDescription>
              Selecione uma organização para ver os membros.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Usuários</h1>
          <p className="text-muted-foreground">
            Gerencie os membros da sua organização
          </p>
        </div>
        {canManageMembers && (
          <Button
            onClick={() => setInviteDialogOpen(true)}
            disabled={isAtLimit}
            title={isAtLimit ? 'Limite de membros atingido' : undefined}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Convidar Usuário
          </Button>
        )}
      </div>

      {/* Limit Warning */}
      {isAtLimit && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Sua organização atingiu o limite de <strong>{maxUsers} membros</strong>.
            Para adicionar mais membros, entre em contato com o suporte para fazer upgrade do seu plano.
          </AlertDescription>
        </Alert>
      )}
      {isNearLimit && (
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-700 dark:text-yellow-400">
            Sua organização está próxima do limite de membros ({currentMemberCount}/{maxUsers}).
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className={isAtLimit ? 'border-destructive/50' : isNearLimit ? 'border-yellow-500/50' : ''}>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Limite de Membros
            </CardDescription>
            <CardTitle className="text-2xl">
              {currentMemberCount} / {maxUsers}
            </CardTitle>
            <Progress
              value={limitPercentage}
              className={`h-2 ${isAtLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-yellow-500' : ''}`}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {isAtLimit ? 'Limite atingido' : `${Math.round(100 - limitPercentage)}% disponível`}
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Masters</CardDescription>
            <CardTitle className="text-4xl flex items-center gap-2">
              <Crown className="h-6 w-6 text-yellow-500" />
              {stats.masters}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Gerentes</CardDescription>
            <CardTitle className="text-4xl flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-blue-500" />
              {stats.managers}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Membros</CardDescription>
            <CardTitle className="text-4xl flex items-center gap-2">
              <User className="h-6 w-6 text-gray-500" />
              {stats.users}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Ativos</CardDescription>
            <CardTitle className="text-4xl flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
              {stats.active}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Membros da Organização</CardTitle>
          <CardDescription>
            {members.length} membro(s) na organização
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Filtrar por nome..."
                value={(table.getColumn('user.name')?.getFilterValue() as string) ?? ''}
                onChange={(event) =>
                  table.getColumn('user.name')?.setFilterValue(event.target.value)
                }
                className="max-w-sm"
              />
              <Select
                value={(table.getColumn('role')?.getFilterValue() as string) ?? ''}
                onValueChange={(value) =>
                  table.getColumn('role')?.setFilterValue(value === 'all' ? '' : value)
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar por cargo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="master">Master</SelectItem>
                  <SelectItem value="manager">Gerente</SelectItem>
                  <SelectItem value="user">Membro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map((header) => {
                            return (
                              <TableHead key={header.id}>
                                {header.isPlaceholder
                                  ? null
                                  : flexRender(
                                      header.column.columnDef.header,
                                      header.getContext()
                                    )}
                              </TableHead>
                            )
                          })}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {table.getRowModel().rows?.length ? (
                        table.getRowModel().rows.map((row) => (
                          <TableRow
                            key={row.id}
                            data-state={row.getIsSelected() && 'selected'}
                          >
                            {row.getVisibleCells().map((cell) => (
                              <TableCell key={cell.id}>
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext()
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={columns.length}
                            className="h-24 text-center"
                          >
                            Nenhum membro encontrado.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-2">
                  <div className="text-sm text-muted-foreground">
                    Mostrando {table.getRowModel().rows.length} de{' '}
                    {table.getFilteredRowModel().rows.length} membro(s).
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      Página {table.getState().pagination.pageIndex + 1} de{' '}
                      {table.getPageCount() || 1}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={resetInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar Novo Membro</DialogTitle>
            <DialogDescription>
              Crie um link de convite para adicionar um novo membro à organização
            </DialogDescription>
          </DialogHeader>

          {!inviteUrl ? (
            <form onSubmit={handleInvite} className="space-y-4">
              {isNearLimit && (
                <Alert className="border-yellow-500/50 bg-yellow-500/10">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-700 dark:text-yellow-400">
                    Restam {maxUsers - currentMemberCount} vagas disponíveis.
                  </AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="usuario@email.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Cargo</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(value: OrgRole) => setInviteRole(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Membro
                      </div>
                    </SelectItem>
                    <SelectItem value="manager">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        Gerente
                      </div>
                    </SelectItem>
                    <SelectItem value="master">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4" />
                        Master
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Masters têm acesso total. Gerentes podem gerenciar membros. Membros têm
                  acesso básico.
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetInviteDialog}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? 'Criando...' : 'Criar Convite'}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Convite criado com sucesso! Compartilhe o link abaixo:
                </AlertDescription>
              </Alert>

              <div className="flex gap-2">
                <Input value={inviteUrl} readOnly />
                <Button onClick={copyInviteUrl} size="icon">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <DialogFooter>
                <Button onClick={resetInviteDialog}>Fechar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={editRoleDialogOpen} onOpenChange={setEditRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Cargo</DialogTitle>
            <DialogDescription>
              Altere o cargo de {selectedMember?.user?.name} na organização
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {selectedMember?.user?.name
                    ? getInitials(selectedMember.user.name)
                    : '??'}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{selectedMember?.user?.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedMember?.user?.email}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Novo Cargo</Label>
              <Select value={newRole} onValueChange={(value: OrgRole) => setNewRole(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Membro
                    </div>
                  </SelectItem>
                  <SelectItem value="manager">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      Gerente
                    </div>
                  </SelectItem>
                  <SelectItem value="master">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4" />
                      Master
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRoleDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateRole} disabled={updateRoleMutation.isPending}>
              {updateRoleMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover{' '}
              <strong>{selectedMember?.user?.name}</strong> da organização? Esta ação
              pode ser desfeita apenas convidando o usuário novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMemberMutation.isPending ? 'Removendo...' : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
