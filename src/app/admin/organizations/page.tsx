'use client'

import { useEffect, useState } from 'react'
import { Plus, Search, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { api } from '@/igniter.client'
import { Skeleton } from '@/components/ui/skeleton'
import { CreateOrganizationDialog } from './create-organization-dialog'
import { EditOrganizationDialog } from './edit-organization-dialog'
import { listOrganizationsAction, deleteOrganizationAction } from '../actions'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface Organization {
  id: string
  name: string
  document: string
  type: 'pf' | 'pj'
  billingType: string
  maxInstances: number
  maxUsers: number
  isActive: boolean
  createdAt: string
}

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  useEffect(() => {
    loadOrganizations()
  }, [search])

  const loadOrganizations = async () => {
    try {
      setIsLoading(true)
      // ✅ CORREÇÃO BRUTAL: Usar Server Action para evitar problema de token
      const response = await listOrganizationsAction({
        page: 1,
        limit: 20,
        search: search || undefined,
      })

      // Verificar se houve erro
      if ('error' in response && response.error) {
        console.error('Erro ao carregar organizações:', response.error)
        setOrganizations([])
      } else if ('data' in response && response.data) {
        setOrganizations((response.data?.data || []) as unknown as Organization[])
      } else {
        setOrganizations([])
      }
    } catch (error) {
      console.error('Erro ao carregar organizações:', error)
      setOrganizations([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (org: Organization) => {
    setEditingOrg(org)
    setEditDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta organização?')) return

    try {
      // ✅ CORREÇÃO BRUTAL: Usar Server Action
      const result = await deleteOrganizationAction(id)
      
      // Verificar se houve erro
      if ('error' in result && result.error) {
        alert('Erro ao excluir organização: ' + result.error)
      } else {
        loadOrganizations()
      }
    } catch (error) {
      console.error('Erro ao excluir organização:', error)
      alert('Erro ao excluir organização')
    }
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/admin">
                Administração
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Organizações</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">Organizações</h2>
          <CreateOrganizationDialog onSuccess={loadOrganizations} />
        </div>

      <EditOrganizationDialog
        organization={editingOrg}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={loadOrganizations}
      />

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou documento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Instâncias</TableHead>
              <TableHead>Usuários</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                </TableRow>
              ))
            ) : organizations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                  Nenhuma organização encontrada
                </TableCell>
              </TableRow>
            ) : (
              organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell>{org.document}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {org.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge>
                      {org.billingType.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{org.maxInstances}</TableCell>
                  <TableCell>{org.maxUsers}</TableCell>
                  <TableCell>
                    <Badge variant={org.isActive ? 'default' : 'secondary'}>
                      {org.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleEdit(org)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(org.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      </div>
    </>
  )
}
