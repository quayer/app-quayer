'use client'

import { useState } from 'react'
import { Plus, Search, MoreVertical, Users, UserCheck, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { api } from '@/igniter.client'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState('')

  // Query para buscar usuários
  const { data: users = [], isLoading, error } = api.auth.listUsers.useQuery()

  // Filtrar usuários
  const filteredUsers = (users || []).filter(user =>
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calcular estatísticas
  const stats = {
    total: (users || []).length,
    active: (users || []).filter(u => u.isActive).length,
    inactive: (users || []).filter(u => !u.isActive).length,
  }

  if (error) {
    return (
      <div className="pt-6">
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar clientes: {(error as any)?.message || 'Erro desconhecido'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 pt-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground mt-1">
            Lista de todos os clientes cadastrados no sistema
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Cliente
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total de Clientes
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
            <CardTitle className="text-4xl">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <UserX className="h-4 w-4 text-red-500" />
              Inativos
            </CardDescription>
            <CardTitle className="text-4xl">{stats.inactive}</CardTitle>
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
                Nenhum cliente encontrado
              </h3>
              <p className="text-muted-foreground mb-4">
                Adicione o primeiro cliente para começar
              </p>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Cliente
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cadastrado em</TableHead>
                  <TableHead>Último Acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name || 'Sem nome'}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'default' : 'secondary'}>
                        {user.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(user.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell>
                      {(user as any).lastLoginAt
                        ? formatDistanceToNow(new Date((user as any).lastLoginAt), {
                            addSuffix: true,
                            locale: ptBR,
                          })
                        : 'Nunca'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Ver Detalhes</DropdownMenuItem>
                          <DropdownMenuItem>Editar</DropdownMenuItem>
                          <DropdownMenuItem>
                            {user.isActive ? 'Desativar' : 'Ativar'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

