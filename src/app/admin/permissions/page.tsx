'use client'

import { useState } from 'react'
import { ShieldCheck, Search, Plus, Users, Building2, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

// Sistema de permissões documentativo - Define as roles e permissões do sistema
const systemRoles = [
  {
    id: '1',
    name: 'admin',
    label: 'Administrador do Sistema',
    description: 'Acesso total ao sistema, incluindo todas organizações',
    users: 2,
    permissions: ['*'],
  },
  {
    id: '2',
    name: 'user',
    label: 'Usuário Padrão',
    description: 'Acesso apenas à organização vinculada',
    users: 45,
    permissions: ['instances:read', 'messages:read', 'conversations:read'],
  },
]

const organizationRoles = [
  {
    id: '1',
    name: 'master',
    label: 'Master',
    description: 'Controle total da organização',
    users: 12,
    permissions: ['org:*'],
  },
  {
    id: '2',
    name: 'manager',
    label: 'Gerente',
    description: 'Gerenciamento de integrações e usuários',
    users: 23,
    permissions: ['instances:*', 'users:read', 'users:write', 'messages:*'],
  },
  {
    id: '3',
    name: 'user',
    label: 'Usuário',
    description: 'Acesso limitado a próprias integrações',
    users: 89,
    permissions: ['instances:read', 'messages:read'],
  },
]

const allPermissions = [
  { id: '1', resource: 'organizations', action: 'read', description: 'Visualizar organizações' },
  { id: '2', resource: 'organizations', action: 'write', description: 'Criar/editar organizações' },
  { id: '3', resource: 'organizations', action: 'delete', description: 'Excluir organizações' },
  { id: '4', resource: 'instances', action: 'read', description: 'Visualizar instâncias' },
  { id: '5', resource: 'instances', action: 'write', description: 'Criar/editar instâncias' },
  { id: '6', resource: 'instances', action: 'delete', description: 'Excluir instâncias' },
  { id: '7', resource: 'instances', action: 'connect', description: 'Conectar instâncias' },
  { id: '8', resource: 'messages', action: 'read', description: 'Visualizar mensagens' },
  { id: '9', resource: 'messages', action: 'send', description: 'Enviar mensagens' },
  { id: '10', resource: 'users', action: 'read', description: 'Visualizar usuários' },
  { id: '11', resource: 'users', action: 'write', description: 'Criar/editar usuários' },
  { id: '12', resource: 'users', action: 'delete', description: 'Excluir usuários' },
  { id: '13', resource: 'webhooks', action: 'read', description: 'Visualizar webhooks' },
  { id: '14', resource: 'webhooks', action: 'write', description: 'Criar/editar webhooks' },
  { id: '15', resource: 'webhooks', action: 'delete', description: 'Excluir webhooks' },
]

export default function AdminPermissionsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRole, setSelectedRole] = useState<any>(null)

  const filteredPermissions = allPermissions.filter(p =>
    p.resource.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-6 pt-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Permissões e Controle de Acesso</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie funções e permissões de usuários no sistema
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nova Função
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Funções do Sistema
            </CardDescription>
            <CardTitle className="text-4xl">{systemRoles.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Funções de Organização
            </CardDescription>
            <CardTitle className="text-4xl">{organizationRoles.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Permissões Totais
            </CardDescription>
            <CardTitle className="text-4xl">{allPermissions.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="system" className="space-y-4">
        <TabsList>
          <TabsTrigger value="system">Funções do Sistema</TabsTrigger>
          <TabsTrigger value="organization">Funções de Organização</TabsTrigger>
          <TabsTrigger value="permissions">Todas as Permissões</TabsTrigger>
        </TabsList>

        {/* System Roles Tab */}
        <TabsContent value="system">
          <Card>
            <CardHeader>
              <CardTitle>Funções do Sistema</CardTitle>
              <CardDescription>
                Funções que controlam acesso global ao sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Usuários</TableHead>
                    <TableHead>Permissões</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {systemRoles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4" />
                          {role.label}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {role.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{role.users} usuários</Badge>
                      </TableCell>
                      <TableCell>
                        {role.permissions.includes('*') ? (
                          <Badge>Acesso Total</Badge>
                        ) : (
                          <Badge variant="outline">
                            {role.permissions.length} permissões
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedRole(role)}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organization Roles Tab */}
        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle>Funções de Organização</CardTitle>
              <CardDescription>
                Funções que controlam acesso dentro de organizações
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Usuários</TableHead>
                    <TableHead>Permissões</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizationRoles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          {role.label}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {role.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{role.users} usuários</Badge>
                      </TableCell>
                      <TableCell>
                        {role.permissions.some(p => p.includes('*')) ? (
                          <Badge>Acesso Total (Org)</Badge>
                        ) : (
                          <Badge variant="outline">
                            {role.permissions.length} permissões
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedRole(role)}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Permissions Tab */}
        <TabsContent value="permissions">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar permissões..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(
                  filteredPermissions.reduce((acc, p) => {
                    if (!acc[p.resource]) acc[p.resource] = []
                    acc[p.resource].push(p)
                    return acc
                  }, {} as Record<string, typeof allPermissions>)
                ).map(([resource, permissions]) => (
                  <div key={resource} className="space-y-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      {resource}
                    </h3>
                    <div className="space-y-2 pl-4 border-l-2">
                      {permissions.map((permission) => (
                        <div
                          key={permission.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {resource}:{permission.action}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {permission.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`perm-${permission.id}`} className="text-xs">
                              Ativo
                            </Label>
                            <Switch id={`perm-${permission.id}`} defaultChecked />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
