'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  MoreVertical,
  Users,
  UserCheck,
  UserX,
  Building2,
  Shield,
  ShieldAlert,
  Loader2,
  Eye,
  Power,
  PowerOff,
  Mail,
  Calendar,
  Clock,
  RefreshCw,
  AlertTriangle,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api } from '@/igniter.client'
import { useAuth } from '@/lib/auth/auth-provider'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

// User type from the API
interface User {
  id: string
  email: string
  name: string
  role: string
  isActive: boolean
  emailVerified: string | null
  currentOrgId: string | null
  createdAt: string
  updatedAt: string
  organizations?: {
    id: string
    name: string
    role: string
  }[]
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

function getRoleBadge(role: string) {
  switch (role) {
    case 'admin':
      return (
        <Badge variant="destructive" className="gap-1">
          <ShieldAlert className="h-3 w-3" />
          GOD Admin
        </Badge>
      )
    case 'user':
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <Shield className="h-3 w-3" />
          Usuario
        </Badge>
      )
  }
}

export default function ClientsPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showToggleDialog, setShowToggleDialog] = useState(false)
  const [userToToggle, setUserToToggle] = useState<User | null>(null)

  // Check if current user is GOD admin
  const isGodAdmin = currentUser?.role === 'admin'

  // Query to fetch all users (admin only)
  const {
    data: usersResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const response = await api.auth.listUsers.query()
      return response as unknown as User[]
    },
    enabled: isGodAdmin,
  })

  // Toggle user active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return (api.auth.toggleUserActive as any).mutate({
        userId,
        body: { isActive },
      })
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.isActive
          ? 'Usuario ativado com sucesso'
          : 'Usuario desativado com sucesso'
      )
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setShowToggleDialog(false)
      setUserToToggle(null)
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao alterar status do usuario')
    },
  })

  // Ensure users is always an array
  const users = Array.isArray(usersResponse) ? usersResponse : []

  // Filter users by search term
  const filteredUsers = users.filter(
    (user) =>
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate statistics
  const stats = {
    total: users.length,
    active: users.filter((u) => u.isActive).length,
    inactive: users.filter((u) => !u.isActive).length,
    admins: users.filter((u) => u.role === 'admin').length,
  }

  // Handle view user details
  const handleViewDetails = (user: User) => {
    setSelectedUser(user)
    setShowDetailsDialog(true)
  }

  // Handle toggle active confirmation
  const handleToggleActive = (user: User) => {
    setUserToToggle(user)
    setShowToggleDialog(true)
  }

  // Confirm toggle active
  const confirmToggleActive = () => {
    if (userToToggle) {
      toggleActiveMutation.mutate({
        userId: userToToggle.id,
        isActive: !userToToggle.isActive,
      })
    }
  }

  // If not GOD admin, show access denied
  if (!isGodAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">Acesso Negado</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Esta pagina e exclusiva para administradores GOD do sistema.
          <br />
          Apenas administradores com nivel maximo podem gerenciar usuarios.
        </p>
        <Button variant="outline" onClick={() => window.history.back()}>
          Voltar
        </Button>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pt-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar usuarios</AlertTitle>
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
    <div className="flex flex-col gap-6 pt-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">Usuarios do Sistema</h1>
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" />
              Admin Only
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Gerenciamento de todos os usuarios cadastrados na plataforma
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total de Usuarios
            </CardDescription>
            <CardTitle className="text-4xl">{stats.total}</CardTitle>
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
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-orange-500" />
              GOD Admins
            </CardDescription>
            <CardTitle className="text-4xl text-orange-600">{stats.admins}</CardTitle>
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
          {isLoading ? (
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
                  ? 'Nenhum usuario encontrado'
                  : 'Nenhum usuario cadastrado'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm
                  ? 'Tente buscar por outro termo'
                  : 'Os usuarios aparecerao aqui quando se registrarem'}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Funcao</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Email Verificado</TableHead>
                    <TableHead>Cadastrado</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback
                              className={
                                user.role === 'admin'
                                  ? 'bg-orange-100 text-orange-700'
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
                        </div>
                      </TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={user.isActive ? 'default' : 'secondary'}
                          className={
                            user.isActive
                              ? 'bg-green-100 text-green-700 hover:bg-green-100'
                              : 'bg-red-100 text-red-700 hover:bg-red-100'
                          }
                        >
                          {user.isActive ? (
                            <>
                              <Power className="h-3 w-3 mr-1" />
                              Ativo
                            </>
                          ) : (
                            <>
                              <PowerOff className="h-3 w-3 mr-1" />
                              Inativo
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.emailVerified ? (
                          <Badge
                            variant="outline"
                            className="bg-green-50 text-green-700 border-green-200"
                          >
                            <Mail className="h-3 w-3 mr-1" />
                            Verificado
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-yellow-50 text-yellow-700 border-yellow-200"
                          >
                            <Mail className="h-3 w-3 mr-1" />
                            Pendente
                          </Badge>
                        )}
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
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleToggleActive(user)}
                              disabled={user.id === currentUser?.id}
                              className={
                                user.isActive
                                  ? 'text-red-600 focus:text-red-600'
                                  : 'text-green-600 focus:text-green-600'
                              }
                            >
                              {user.isActive ? (
                                <>
                                  <PowerOff className="h-4 w-4 mr-2" />
                                  Desativar
                                </>
                              ) : (
                                <>
                                  <Power className="h-4 w-4 mr-2" />
                                  Ativar
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* User Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Usuario</DialogTitle>
            <DialogDescription>
              Informacoes completas do usuario selecionado
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
                        ? 'bg-orange-100 text-orange-700 text-xl'
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
                    {getRoleBadge(selectedUser.role)}
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
                    <p className="text-sm text-muted-foreground">Email Verificado</p>
                    <p className="font-medium">
                      {selectedUser.emailVerified
                        ? format(new Date(selectedUser.emailVerified), "dd/MM/yyyy 'as' HH:mm", {
                            locale: ptBR,
                          })
                        : 'Nao verificado'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Data de Cadastro</p>
                    <p className="font-medium">
                      {format(new Date(selectedUser.createdAt), "dd/MM/yyyy 'as' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ultima Atualizacao</p>
                    <p className="font-medium">
                      {formatDistanceToNow(new Date(selectedUser.updatedAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Organizacao Atual</p>
                    <p className="font-medium">
                      {selectedUser.currentOrgId || 'Nenhuma selecionada'}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* User ID */}
              <div>
                <p className="text-sm text-muted-foreground mb-1">ID do Usuario</p>
                <code className="text-xs bg-muted px-2 py-1 rounded block overflow-auto">
                  {selectedUser.id}
                </code>
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

      {/* Toggle Active Confirmation Dialog */}
      <AlertDialog open={showToggleDialog} onOpenChange={setShowToggleDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {userToToggle?.isActive ? 'Desativar Usuario?' : 'Ativar Usuario?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {userToToggle?.isActive ? (
                <>
                  Ao desativar o usuario <strong>{userToToggle?.name || userToToggle?.email}</strong>,
                  ele nao podera mais acessar o sistema ate ser reativado.
                </>
              ) : (
                <>
                  Ao ativar o usuario <strong>{userToToggle?.name || userToToggle?.email}</strong>,
                  ele podera acessar o sistema normalmente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggleActive}
              disabled={toggleActiveMutation.isPending}
              className={
                userToToggle?.isActive
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }
            >
              {toggleActiveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : userToToggle?.isActive ? (
                'Desativar'
              ) : (
                'Ativar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
