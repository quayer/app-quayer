'use client'

import { useState, useMemo } from 'react'
import { useAuth } from '@/lib/auth/auth-provider'
import { api } from '@/igniter.client'
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
import {
  UserPlus,
  Copy,
  CheckCircle2,
  MoreHorizontal,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

type User = {
  id: string
  name: string
  email: string
  role: 'admin' | 'user'
  isActive: boolean
  createdAt: string
}

export default function UsersPage() {
  const { user } = useAuth()
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'user' | 'master' | 'manager'>('user')
  const [inviteUrl, setInviteUrl] = useState('')
  const [error, setError] = useState('')

  // Table state
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})

  const { user: currentUser } = useAuth()
  const currentOrgId = currentUser?.currentOrgId

  const { data: usersResponse, refetch, isLoading } = api.auth.listUsers.useQuery()

  // Invitation mutation
  const inviteMutation = api.invitations.create.useMutation({
    onSuccess: () => {
      refetch()
    },
  })

  // Extract users array from response
  const users = (usersResponse as any)?.data || []

  // Calculate statistics
  const stats = {
    total: users.length,
    active: users.filter((u: any) => u.isActive).length,
    inactive: users.filter((u: any) => !u.isActive).length,
    admins: users.filter((u: any) => u.role === 'admin').length,
    masters: users.filter((u: any) => u.role === 'master').length,
    managers: users.filter((u: any) => u.role === 'manager').length,
    regularUsers: users.filter((u: any) => u.role === 'user').length,
  }

  const columns: ColumnDef<User>[] = useMemo(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Nome
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => <div className="font-medium">{row.getValue('name')}</div>,
    },
    {
      accessorKey: 'email',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Email
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => <div className="lowercase">{row.getValue('email')}</div>,
    },
    {
      accessorKey: 'role',
      header: 'Função',
      cell: ({ row }) => {
        const role = row.getValue('role') as string
        const roleLabels: Record<string, string> = {
          admin: 'Admin',
          master: 'Master',
          manager: 'Manager',
          user: 'Usuário'
        }
        const roleVariants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
          admin: 'destructive',
          master: 'default',
          manager: 'default',
          user: 'secondary'
        }
        return (
          <Badge variant={roleVariants[role] || 'secondary'}>
            {roleLabels[role] || role}
          </Badge>
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
            Data de Criação
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
        const user = row.original

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
                onClick={() => navigator.clipboard.writeText(user.id)}
              >
                Copiar ID do usuário
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Ver detalhes</DropdownMenuItem>
              <DropdownMenuItem>Editar usuário</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [])

  const table = useReactTable({
    data: users,
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
        body: {
          email: inviteEmail,
          role: inviteRole,
          organizationId: currentOrgId,
        }
      })

      if (response.data) {
        setInviteUrl(response.data.inviteUrl)
        toast.success('Convite criado com sucesso!')
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || err?.message || 'Erro ao criar convite'
      setError(errorMessage)
      toast.error(errorMessage)
    }
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

  // Remove this restriction - all organization members can see users
  // User permissions are checked on the backend

  return (
    <div className="space-y-6 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Usuários</h1>
          <p className="text-muted-foreground">
            Gerencie os usuários da organização
          </p>
        </div>
        <Button onClick={() => setInviteDialogOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Convidar Usuário
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total de Usuários</CardDescription>
            <CardTitle className="text-4xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Usuários Ativos</CardDescription>
            <CardTitle className="text-4xl">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Administradores</CardDescription>
            <CardTitle className="text-4xl">{stats.admins}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Masters/Managers</CardDescription>
            <CardTitle className="text-4xl">{stats.masters + stats.managers}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Usuários</CardTitle>
          <CardDescription>
            {users.length} usuário(s) cadastrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Filtrar por nome..."
                value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
                onChange={(event) =>
                  table.getColumn('name')?.setFilterValue(event.target.value)
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
                  <SelectValue placeholder="Filtrar por função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="master">Master</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="user">Usuário</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
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
                            Nenhum resultado encontrado.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-2">
                  <div className="text-sm text-muted-foreground">
                    {table.getFilteredSelectedRowModel().rows.length} de{' '}
                    {table.getFilteredRowModel().rows.length} linha(s) selecionada(s).
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
                      {table.getPageCount()}
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

      <Dialog open={inviteDialogOpen} onOpenChange={resetInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar Novo Usuário</DialogTitle>
            <DialogDescription>
              Crie um link de convite para um novo usuário
            </DialogDescription>
          </DialogHeader>

          {!inviteUrl ? (
            <form onSubmit={handleInvite} className="space-y-4">
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
                <Label htmlFor="role">Função</Label>
                <Select value={inviteRole} onValueChange={(value: any) => setInviteRole(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuário</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="master">Master</SelectItem>
                  </SelectContent>
                </Select>
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
    </div>
  )
}
