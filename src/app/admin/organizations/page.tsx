'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, MoreHorizontal, Pencil, Trash2, Building2, Plus, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
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
import { PageContainer, PageHeader } from '@/components/layout/page-layout'
import { CreateOrganizationDialog } from './create-organization-dialog'
import { EditOrganizationDialog } from './edit-organization-dialog'
import { listOrganizationsAction, deleteOrganizationAction } from '../actions'
import { useSwitchOrganization } from '@/hooks/useOrganization'

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

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const ITEMS_PER_PAGE = 10

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: ITEMS_PER_PAGE,
    total: 0,
    totalPages: 1,
  })
  const switchOrganization = useSwitchOrganization()

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setCurrentPage(1) // Reset to first page on search
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    loadOrganizations()
  }, [debouncedSearch, currentPage])

  const loadOrganizations = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await listOrganizationsAction({
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        search: debouncedSearch || undefined,
      })

      // Verificar se houve erro
      if ('error' in response && response.error) {
        console.error('Erro ao carregar organizações:', response.error)
        setOrganizations([])
      } else if ('data' in response && response.data) {
        setOrganizations((response.data?.data || []) as unknown as Organization[])
        if (response.data?.pagination) {
          setPagination(response.data.pagination as Pagination)
        }
      } else {
        setOrganizations([])
      }
    } catch (error) {
      console.error('Erro ao carregar organizações:', error)
      setOrganizations([])
    } finally {
      setIsLoading(false)
    }
  }, [debouncedSearch, currentPage])

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setCurrentPage(newPage)
    }
  }

  const handleEdit = (org: Organization) => {
    setEditingOrg(org)
    setEditDialogOpen(true)
  }

  const handleDeleteClick = (org: Organization) => {
    setOrgToDelete(org)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!orgToDelete) return

    try {
      setIsDeleting(true)
      const result = await deleteOrganizationAction(orgToDelete.id)

      if ('error' in result && result.error) {
        console.error('Erro ao excluir organização:', result.error)
      } else {
        loadOrganizations()
      }
    } catch (error) {
      console.error('Erro ao excluir organização:', error)
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setOrgToDelete(null)
    }
  }

  const handleSwitchOrg = (orgId: string) => {
    switchOrganization.mutate(orgId)
  }

  return (
    <PageContainer maxWidth="full">
      <PageHeader
        title="Organizações"
        description="Gerencie todas as organizações do sistema."
        actions={<CreateOrganizationDialog onSuccess={loadOrganizations} />}
      />

      <EditOrganizationDialog
        organization={editingOrg}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={loadOrganizations}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Excluir Organização
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a organização{' '}
              <strong>{orgToDelete?.name}</strong>? Esta ação não pode ser desfeita
              e todos os dados associados serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou documento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {!isLoading && (
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {pagination.total} {pagination.total === 1 ? 'organização' : 'organizações'} encontrada{pagination.total !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Table with horizontal scroll for mobile */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Nome</TableHead>
              <TableHead className="min-w-[140px]">Documento</TableHead>
              <TableHead className="min-w-[120px]">Tipo</TableHead>
              <TableHead className="min-w-[100px]">Plano</TableHead>
              <TableHead className="min-w-[100px]">Instâncias</TableHead>
              <TableHead className="min-w-[100px]">Usuários</TableHead>
              <TableHead className="min-w-[80px]">Status</TableHead>
              <TableHead className="text-right min-w-[80px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : organizations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-40">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <Building2 className="h-10 w-10 text-muted-foreground/50" />
                    <div>
                      <p className="font-medium text-muted-foreground">
                        Nenhuma organização encontrada
                      </p>
                      <p className="text-sm text-muted-foreground/70">
                        {search ? 'Tente ajustar sua busca' : 'Crie a primeira organização para começar'}
                      </p>
                    </div>
                    {!search && (
                      <CreateOrganizationDialog onSuccess={loadOrganizations}>
                        <Button size="sm" className="mt-2">
                          <Plus className="h-4 w-4 mr-2" />
                          Nova Organização
                        </Button>
                      </CreateOrganizationDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell className="font-mono text-sm">{org.document}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {org.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge>{org.billingType.toUpperCase()}</Badge>
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
                        <DropdownMenuItem onClick={() => handleSwitchOrg(org.id)}>
                          <Building2 className="mr-2 h-4 w-4" />
                          Acessar Painel
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(org)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDeleteClick(org)}
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

      {/* Pagination Controls */}
      {!isLoading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <div className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a{' '}
            {Math.min(currentPage * ITEMS_PER_PAGE, pagination.total)} de{' '}
            {pagination.total} organizações
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum: number
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'outline'}
                    size="sm"
                    className="w-9"
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === pagination.totalPages}
            >
              Próximo
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
