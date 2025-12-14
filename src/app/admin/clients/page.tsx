'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  MoreVertical,
  Users,
  UserCheck,
  UserX,
  Shield,
  Crown,
  User as UserIcon,
  Loader2,
  Eye,
  RefreshCw,
  AlertTriangle,
  Mail,
  Calendar,
  Building2,
  Edit,
  ShieldCheck,
  ShieldOff,
  Plus,
  Trash2,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuth } from '@/lib/auth/auth-provider'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  getUsersWithRolesAction,
  updateUserSystemRoleAction,
  updateUserOrganizationRoleAction,
  listOrganizationsForFilterAction,
  addMemberToOrganizationAction,
  removeMemberFromOrganizationAction,
} from '../actions'

// User type from the server action
interface PlatformUser {
  id: string
  name: string | null
  email: string
  role: string
  isActive: boolean
  createdAt: string | Date
  organizations: Array<{
    role: string
    organization: {
      id: string
      name: string
    }
  }>
}

function getInitials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getSystemRoleBadge(role: string) {
  switch (role) {
    case 'admin':
      return (
        <Badge variant="default" className="gap-1 bg-purple-600 hover:bg-purple-700">
          <ShieldCheck className="h-3 w-3" />
          Administrador
        </Badge>
      )
    case 'user':
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <UserIcon className="h-3 w-3" />
          Usuário
        </Badge>
      )
  }
}

function getOrgRoleBadge(role: string) {
  switch (role) {
    case 'master':
      return (
        <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 border-amber-300 text-xs">
          <Crown className="h-2.5 w-2.5" />
          Master
        </Badge>
      )
    case 'manager':
      return (
        <Badge variant="outline" className="gap-1 bg-blue-50 text-blue-700 border-blue-300 text-xs">
          Gerente
        </Badge>
      )
    case 'agent':
      return (
        <Badge variant="outline" className="gap-1 text-xs">
          Agente
        </Badge>
      )
    case 'viewer':
    default:
      return (
        <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
          Visualizador
        </Badge>
      )
  }
}

export default function AllUsersPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showChangeRoleDialog, setShowChangeRoleDialog] = useState(false)
  const [userToChangeRole, setUserToChangeRole] = useState<PlatformUser | null>(null)
  const [newSystemRole, setNewSystemRole] = useState<'admin' | 'user'>('user')
  const [page, setPage] = useState(1)
  const [isMounted, setIsMounted] = useState(false)
  // States para gerenciar organizações
  const [showAddOrgDialog, setShowAddOrgDialog] = useState(false)
  const [selectedOrgToAdd, setSelectedOrgToAdd] = useState<string>('')
  const [selectedOrgRole, setSelectedOrgRole] = useState<'master' | 'manager' | 'agent' | 'viewer'>('agent')
  const [availableOrgs, setAvailableOrgs] = useState<Array<{ id: string; name: string }>>([])
  const [loadingOrgs, setLoadingOrgs] = useState(false)

  // Hydration fix
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Check if current user is admin
  const isSystemAdmin = currentUser?.role === 'admin'

  // Query to fetch all users with their roles
  const {
    data: usersResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['all-platform-users', page, roleFilter],
    queryFn: async () => {
      const result = await getUsersWithRolesAction({
        page,
        limit: 20,
        roleFilter: roleFilter !== 'all' ? roleFilter : undefined,
      })
      if (!result.success) {
        throw new Error(result.error || 'Erro ao carregar usuários')
      }
      return result.data
    },
    enabled: isSystemAdmin,
  })

  // Update system role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'user' }) => {
      const result = await updateUserSystemRoleAction({ userId, role })
      if (!result.success) {
        throw new Error(result.error || 'Erro ao atualizar role')
      }
      return { ...result, role }
    },
    onSuccess: (result) => {
      toast.success(result.message || 'Role do sistema atualizado com sucesso', {
        style: { background: '#10b981', color: 'white', border: 'none' },
      })
      queryClient.invalidateQueries({ queryKey: ['all-platform-users'] })
      // Atualizar estado local imediatamente
      if (userToChangeRole) {
        setUserToChangeRole({ ...userToChangeRole, role: result.role })
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao atualizar role', {
        style: { background: '#ef4444', color: 'white', border: 'none' },
      })
    },
  })

  // Update organization role mutation
  const updateOrgRoleMutation = useMutation({
    mutationFn: async ({ userId, organizationId, role }: { userId: string; organizationId: string; role: 'master' | 'manager' | 'agent' | 'viewer' }) => {
      const result = await updateUserOrganizationRoleAction({ userId, organizationId, role })
      if (!result.success) {
        throw new Error(result.error || 'Erro ao atualizar role')
      }
      return { ...result, organizationId, role }
    },
    onSuccess: (result) => {
      toast.success(result.message || 'Role atualizado com sucesso', {
        style: { background: '#10b981', color: 'white', border: 'none' },
      })
      queryClient.invalidateQueries({ queryKey: ['all-platform-users'] })
      // Atualizar estado local para refletir mudança imediatamente
      if (userToChangeRole) {
        setUserToChangeRole({
          ...userToChangeRole,
          organizations: userToChangeRole.organizations.map(org =>
            org.organization.id === result.organizationId
              ? { ...org, role: result.role }
              : org
          )
        })
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao atualizar role', {
        style: { background: '#ef4444', color: 'white', border: 'none' },
      })
    },
  })

  // Add to organization mutation
  const addToOrgMutation = useMutation({
    mutationFn: async ({ userId, organizationId, role }: { userId: string; organizationId: string; role: 'master' | 'manager' | 'agent' | 'viewer' }) => {
      const result = await addMemberToOrganizationAction({ userId, organizationId, role: role as any })
      if (!result.success) {
        throw new Error(result.error || 'Erro ao adicionar à organização')
      }
      // Buscar nome da org para atualizar estado local
      const orgName = availableOrgs.find(o => o.id === organizationId)?.name || ''
      return { ...result, organizationId, role, orgName }
    },
    onSuccess: (result) => {
      toast.success(result.message || 'Usuário adicionado à organização', {
        style: { background: '#10b981', color: 'white', border: 'none' },
      })
      queryClient.invalidateQueries({ queryKey: ['all-platform-users'] })
      // Atualizar estado local imediatamente
      if (userToChangeRole) {
        setUserToChangeRole({
          ...userToChangeRole,
          organizations: [
            ...userToChangeRole.organizations,
            {
              role: result.role,
              organization: { id: result.organizationId, name: result.orgName }
            }
          ]
        })
        // Remover da lista de disponíveis
        setAvailableOrgs(availableOrgs.filter(o => o.id !== result.organizationId))
      }
      setShowAddOrgDialog(false)
      setSelectedOrgToAdd('')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao adicionar à organização', {
        style: { background: '#ef4444', color: 'white', border: 'none' },
      })
    },
  })

  // Remove from organization mutation
  const removeFromOrgMutation = useMutation({
    mutationFn: async ({ userId, organizationId }: { userId: string; organizationId: string }) => {
      const result = await removeMemberFromOrganizationAction({ userId, organizationId })
      if (!result.success) {
        throw new Error(result.error || 'Erro ao remover da organização')
      }
      return { ...result, organizationId }
    },
    onSuccess: (result) => {
      toast.success(result.message || 'Usuário removido da organização', {
        style: { background: '#10b981', color: 'white', border: 'none' },
      })
      queryClient.invalidateQueries({ queryKey: ['all-platform-users'] })
      // Atualizar estado local imediatamente
      if (userToChangeRole) {
        const removedOrg = userToChangeRole.organizations.find(o => o.organization.id === result.organizationId)
        setUserToChangeRole({
          ...userToChangeRole,
          organizations: userToChangeRole.organizations.filter(o => o.organization.id !== result.organizationId)
        })
        // Adicionar de volta à lista de disponíveis
        if (removedOrg) {
          setAvailableOrgs([...availableOrgs, removedOrg.organization])
        }
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao remover da organização', {
        style: { background: '#ef4444', color: 'white', border: 'none' },
      })
    },
  })

  // Ensure users is always an array
  const users = usersResponse?.users || []
  const pagination = usersResponse?.pagination

  // Filter users by search term (client-side additional filtering)
  const filteredUsers = users.filter(
    (user) =>
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate statistics
  const stats = {
    total: pagination?.total || users.length,
    admins: users.filter((u) => u.role === 'admin').length,
    active: users.filter((u) => u.isActive).length,
    inactive: users.filter((u) => !u.isActive).length,
  }

  // Handle view user details
  const handleViewDetails = (user: PlatformUser) => {
    setSelectedUser(user)
    setShowDetailsDialog(true)
  }

  // Handle change role (abre dialog de gerenciamento completo)
  const handleChangeRole = async (user: PlatformUser) => {
    setUserToChangeRole(user)
    setNewSystemRole(user.role as 'admin' | 'user')
    setShowChangeRoleDialog(true)
    // Carregar organizações disponíveis
    setLoadingOrgs(true)
    try {
      const result = await listOrganizationsForFilterAction()
      if (result.success && result.data) {
        // Filtrar orgs que o usuário já participa
        const userOrgIds = user.organizations.map(o => o.organization.id)
        setAvailableOrgs(result.data.filter((org: any) => !userOrgIds.includes(org.id)))
      }
    } catch (err) {
      console.error('Erro ao carregar organizações:', err)
    } finally {
      setLoadingOrgs(false)
    }
  }

  // Confirm update system role
  const confirmUpdateRole = () => {
    if (userToChangeRole && newSystemRole !== userToChangeRole.role) {
      updateRoleMutation.mutate({ userId: userToChangeRole.id, role: newSystemRole })
    }
  }

  // Handle org role change
  const handleOrgRoleChange = (organizationId: string, newRole: 'master' | 'manager' | 'agent' | 'viewer') => {
    if (userToChangeRole) {
      updateOrgRoleMutation.mutate({
        userId: userToChangeRole.id,
        organizationId,
        role: newRole,
      })
    }
  }

  // Handle add to organization
  const handleAddToOrg = () => {
    if (userToChangeRole && selectedOrgToAdd) {
      addToOrgMutation.mutate({
        userId: userToChangeRole.id,
        organizationId: selectedOrgToAdd,
        role: selectedOrgRole,
      })
    }
  }

  // Handle remove from organization
  const handleRemoveFromOrg = (organizationId: string) => {
    if (userToChangeRole) {
      removeFromOrgMutation.mutate({
        userId: userToChangeRole.id,
        organizationId,
      })
    }
  }

  // If not admin, show access denied
  if (!isSystemAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
          <ShieldOff className="h-10 w-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold">Acesso Negado</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Apenas administradores do sistema podem acessar esta página.
        </p>
        <Button variant="outline" onClick={() => window.history.back()}>
          Voltar
        </Button>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar usuários</AlertTitle>
          <AlertDescription>
            {(error as any)?.message || 'Erro desconhecido. Tente novamente.'}
          </AlertDescription>
        </Alert>
        <Button onClick={() => refetch()} className="mt-4">
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Usuários da Plataforma</h1>
              <Badge variant="default" className="gap-1 bg-purple-600 hover:bg-purple-700">
                <Shield className="h-3 w-3" />
                Admin
              </Badge>
            </div>
            <p className="text-muted-foreground mt-2">
              Gerencie todos os usuários cadastrados na plataforma
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="admin">Administradores</SelectItem>
                <SelectItem value="user">Usuários</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Total de Usuários
              </CardDescription>
              <CardTitle className="text-4xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-500" />
                Administradores
              </CardDescription>
              <CardTitle className="text-4xl text-purple-600">{stats.admins}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-green-500" />
                Ativos
              </CardDescription>
              <CardTitle className="text-4xl text-green-600">{stats.active}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <UserX className="h-4 w-4 text-red-500" />
                Inativos
              </CardDescription>
              <CardTitle className="text-4xl text-red-600">{stats.inactive}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Search and Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!isMounted || isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {searchTerm
                    ? 'Nenhum usuário encontrado'
                    : 'Nenhum usuário cadastrado'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm
                    ? 'Tente buscar por outro termo'
                    : 'Os usuários aparecerão aqui quando se cadastrarem'}
                </p>
              </div>
            ) : (
              <>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Role Sistema</TableHead>
                        <TableHead>Organizações</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Cadastrado em</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user: PlatformUser) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback
                                  className={
                                    user.role === 'admin'
                                      ? 'bg-purple-100 text-purple-700'
                                      : 'bg-primary/10 text-primary'
                                  }
                                >
                                  {getInitials(user.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{user.name || 'Sem nome'}</p>
                                <p className="text-sm text-muted-foreground">{user.email}</p>
                              </div>
                              {user.id === currentUser?.id && (
                                <Badge variant="outline" className="text-xs">Você</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{getSystemRoleBadge(user.role)}</TableCell>
                          <TableCell>
                            {user.organizations.length === 0 ? (
                              <span className="text-muted-foreground text-sm">Nenhuma</span>
                            ) : (
                              <div className="flex flex-wrap gap-1 max-w-[250px]">
                                {user.organizations.slice(0, 2).map((org) => (
                                  <div key={org.organization.id} className="flex items-center gap-1">
                                    <Badge variant="outline" className="text-xs">
                                      {org.organization.name}
                                    </Badge>
                                    {getOrgRoleBadge(org.role)}
                                  </div>
                                ))}
                                {user.organizations.length > 2 && (
                                  <Badge variant="outline" className="text-xs text-muted-foreground">
                                    +{user.organizations.length - 2}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={user.isActive ? 'default' : 'secondary'}
                              className={
                                user.isActive
                                  ? 'bg-green-100 text-green-700 hover:bg-green-100'
                                  : 'bg-red-100 text-red-700 hover:bg-red-100'
                              }
                            >
                              {user.isActive ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(user.createdAt), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewDetails(user)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Ver Detalhes
                                </DropdownMenuItem>
                                {user.id !== currentUser?.id && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleChangeRole(user)}>
                                      <Edit className="h-4 w-4 mr-2" />
                                      Alterar Role
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Mostrando {((page - 1) * pagination.limit) + 1} - {Math.min(page * pagination.limit, pagination.total)} de {pagination.total}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                        disabled={page === pagination.totalPages}
                      >
                        Próximo
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Usuário</DialogTitle>
            <DialogDescription>
              Informações completas do usuário na plataforma
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-6">
              {/* User Header */}
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback
                    className={
                      selectedUser.role === 'admin'
                        ? 'bg-purple-100 text-purple-700 text-xl'
                        : 'bg-primary/10 text-primary text-xl'
                    }
                  >
                    {getInitials(selectedUser.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-semibold">{selectedUser.name || 'Sem nome'}</h3>
                  <p className="text-muted-foreground">{selectedUser.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {getSystemRoleBadge(selectedUser.role)}
                    <Badge
                      variant={selectedUser.isActive ? 'default' : 'secondary'}
                      className={
                        selectedUser.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }
                    >
                      {selectedUser.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* User Info */}
              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedUser.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Shield className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Role do Sistema</p>
                    <p className="font-medium">{selectedUser.role === 'admin' ? 'Administrador' : 'Usuário'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cadastrado em</p>
                    <p className="font-medium">
                      {format(new Date(selectedUser.createdAt), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Organizations */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <h4 className="font-medium">Organizações ({selectedUser.organizations.length})</h4>
                </div>
                {selectedUser.organizations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma organização vinculada</p>
                ) : (
                  <div className="space-y-2">
                    {selectedUser.organizations.map((org) => (
                      <div
                        key={org.organization.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                      >
                        <span className="font-medium">{org.organization.name}</span>
                        {getOrgRoleBadge(org.role)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* IDs */}
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">ID do Usuário</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded block overflow-auto">
                    {selectedUser.id}
                  </code>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gerenciar Usuário Dialog */}
      <Dialog open={showChangeRoleDialog} onOpenChange={setShowChangeRoleDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Gerenciar Usuário
            </DialogTitle>
            <DialogDescription>
              Gerencie roles e organizações de <strong>{userToChangeRole?.name || userToChangeRole?.email}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Role do Sistema */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <label className="text-sm font-medium">Role do Sistema</label>
              </div>
              <Select value={newSystemRole} onValueChange={(v) => setNewSystemRole(v as 'admin' | 'user')}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-purple-600" />
                      <span className="font-medium">Administrador</span>
                      <span className="text-xs text-muted-foreground">- Acesso total à plataforma</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-4 w-4" />
                      <span className="font-medium">Usuário</span>
                      <span className="text-xs text-muted-foreground">- Acesso às organizações vinculadas</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {newSystemRole !== userToChangeRole?.role && (
                <Button
                  size="sm"
                  onClick={confirmUpdateRole}
                  disabled={updateRoleMutation.isPending}
                  className="mt-2"
                >
                  {updateRoleMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 mr-2" />
                  )}
                  Salvar Role do Sistema
                </Button>
              )}
            </div>

            <Separator />

            {/* Organizações do Usuário */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <label className="text-sm font-medium">Organizações ({userToChangeRole?.organizations.length || 0})</label>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddOrgDialog(true)}
                  disabled={availableOrgs.length === 0 || loadingOrgs}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </Button>
              </div>

              {userToChangeRole?.organizations.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  Usuário não pertence a nenhuma organização
                </div>
              ) : (
                <div className="space-y-2">
                  {userToChangeRole?.organizations.map((org) => (
                    <div
                      key={org.organization.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{org.organization.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={org.role}
                          onValueChange={(v) => handleOrgRoleChange(org.organization.id, v as any)}
                          disabled={updateOrgRoleMutation.isPending}
                        >
                          <SelectTrigger className="w-[140px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="master">
                              <div className="flex items-center gap-2">
                                <Crown className="h-3 w-3 text-amber-500" />
                                Master
                              </div>
                            </SelectItem>
                            <SelectItem value="manager">
                              <div className="flex items-center gap-2">
                                <Shield className="h-3 w-3 text-blue-500" />
                                Gerente
                              </div>
                            </SelectItem>
                            <SelectItem value="agent">
                              <div className="flex items-center gap-2">
                                <UserIcon className="h-3 w-3" />
                                Agente
                              </div>
                            </SelectItem>
                            <SelectItem value="viewer">
                              <div className="flex items-center gap-2">
                                <Eye className="h-3 w-3 text-muted-foreground" />
                                Visualizador
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleRemoveFromOrg(org.organization.id)}
                          disabled={removeFromOrgMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Alertas */}
            {newSystemRole === 'admin' && userToChangeRole?.role !== 'admin' && (
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertDescription>
                  Como Administrador, o usuário terá acesso total à plataforma, independente das organizações.
                </AlertDescription>
              </Alert>
            )}

            {newSystemRole === 'user' && userToChangeRole?.role === 'admin' && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  O usuário perderá acesso às funcionalidades administrativas e só verá as organizações onde é membro.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangeRoleDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para adicionar a uma organização */}
      <Dialog open={showAddOrgDialog} onOpenChange={setShowAddOrgDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar à Organização</DialogTitle>
            <DialogDescription>
              Adicione {userToChangeRole?.name || userToChangeRole?.email} a uma organização
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Organização</label>
              {loadingOrgs ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando...
                </div>
              ) : availableOrgs.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  O usuário já pertence a todas as organizações disponíveis
                </div>
              ) : (
                <Select value={selectedOrgToAdd} onValueChange={setSelectedOrgToAdd}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma organização" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOrgs.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Role na Organização</label>
              <Select value={selectedOrgRole} onValueChange={(v) => setSelectedOrgRole(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="master">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-amber-500" />
                      <div>
                        <span className="font-medium">Master</span>
                        <span className="text-xs text-muted-foreground ml-2">- Controle total da org</span>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="manager">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-500" />
                      <div>
                        <span className="font-medium">Gerente</span>
                        <span className="text-xs text-muted-foreground ml-2">- Gerencia equipe e config</span>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="agent">
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-4 w-4" />
                      <div>
                        <span className="font-medium">Agente</span>
                        <span className="text-xs text-muted-foreground ml-2">- Atende conversas</span>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="font-medium">Visualizador</span>
                        <span className="text-xs text-muted-foreground ml-2">- Apenas visualiza</span>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddOrgDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddToOrg}
              disabled={!selectedOrgToAdd || addToOrgMutation.isPending}
            >
              {addToOrgMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adicionando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
