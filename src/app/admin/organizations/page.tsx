'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight, Building2, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/client/components/ui/alert-dialog'
import { Badge } from '@/client/components/ui/badge'
import { Skeleton } from '@/client/components/ui/skeleton'
import { CreateOrganizationDialog } from './create-organization-dialog'

import { EditOrganizationDialog } from './edit-organization-dialog'
import { OrgDetailDialog } from './components/OrgDetailDialog'
import { listOrganizationsAction, deleteOrganizationAction, type PaginationMeta } from '../actions'
import { SidebarTrigger } from '@/client/components/ui/sidebar'
import { Separator } from '@/client/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/client/components/ui/breadcrumb'
import type { Organization } from './types'

export type { Organization } from './types'

const PAGE_LIMIT = 20

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const loadOrganizations = useCallback(async (currentPage?: number) => {
    const targetPage = currentPage ?? page
    try {
      setIsLoading(true)
      const response = await listOrganizationsAction({
        page: targetPage,
        limit: PAGE_LIMIT,
        search: debouncedSearch || undefined,
      })

      if (!response.success) {
        console.error('Erro ao carregar organizações:', response.error)
        toast.error(typeof response.error === 'string' ? response.error : 'Erro ao carregar organizações')
        setOrganizations([])
        setTotalPages(1)
        setTotal(0)
      } else if (response.data) {
        setOrganizations((response.data.data as Organization[]) || [])
        setTotalPages(response.data.pagination?.totalPages || 1)
        setTotal(response.data.pagination?.total || 0)
      }
    } catch (error) {
      console.error('Erro ao carregar organizações:', error)
      toast.error('Erro ao carregar organizações')
      setOrganizations([])
      setTotalPages(1)
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [page, debouncedSearch])

  useEffect(() => {
    loadOrganizations()
  }, [loadOrganizations])

  const handleOpenDetail = (org: Organization) => {
    setSelectedOrg(org)
    setDetailOpen(true)
  }

  const handleEdit = (org: Organization) => {
    setEditingOrg(org)
    setEditDialogOpen(true)
  }

  const handleDeleteRequest = (org: Organization) => {
    setDeleteTarget({ id: org.id, name: org.name })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const result = await deleteOrganizationAction(deleteTarget.id)
      if ('error' in result && result.error) {
        const msg = typeof result.error === 'string' ? result.error : 'Erro desconhecido'
        toast.error('Erro ao excluir organização: ' + msg)
      } else {
        toast.success('Organização excluída com sucesso')
        loadOrganizations()
      }
    } catch (error) {
      console.error('Erro ao excluir organização:', error)
      toast.error('Erro ao excluir organização')
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
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
              <BreadcrumbLink href="/admin">Administração</BreadcrumbLink>
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

        <OrgDetailDialog
          org={selectedOrg}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          allOrganizations={organizations}
          onOrgUpdated={loadOrganizations}
        />

        <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir organização</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir a organização <strong>{deleteTarget?.name}</strong>?
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
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

        <div className="flex items-center space-x-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou documento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              aria-label="Buscar organizações"
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
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow aria-label="Carregando organizações" role="status">
                  <TableCell colSpan={6}>
                    <div className="space-y-3 py-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ) : organizations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24" aria-live="polite">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground py-4">
                      <Building2 className="h-8 w-8 opacity-40" />
                      {debouncedSearch ? (
                        <>
                          <span className="text-sm">Nenhuma organização encontrada para &apos;{debouncedSearch}&apos;</span>
                          <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                            Limpar busca
                          </Button>
                        </>
                      ) : (
                        <span className="text-sm">Nenhuma organização encontrada</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                organizations.map((org) => (
                  <TableRow
                    key={org.id}
                    className="cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() => handleOpenDetail(org)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDetail(org) } }}
                  >
                    <TableCell>
                      <div className="font-medium">{org.name}</div>
                      <div className="text-xs text-muted-foreground">{org.userCount ?? 0} usuários</div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {org.document || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {org.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge>{(org.billingType ?? 'free').toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={org.isActive ? 'default' : 'secondary'}>
                        {org.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-9 w-9 p-0">
                            <span className="sr-only">Abrir menu</span>
                            <MoreHorizontal className="h-5 w-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleOpenDetail(org)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Ver detalhes
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleEdit(org)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteRequest(org)}
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

        {!isLoading && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              Mostrando {organizations.length} de {total} organizações
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Próximo
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
