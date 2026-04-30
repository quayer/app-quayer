'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  MoreVertical,
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Trash2,
  Copy,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import { Badge } from '@/client/components/ui/badge'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Alert, AlertDescription } from '@/client/components/ui/alert'
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
import { toast } from 'sonner'

import { safeFormatDate } from '@/lib/utils/format'

import {
  getInvitationsAction,
  resendInvitationAction,
  deleteInvitationAction,
} from './actions'

interface Invitation {
  id: string
  email: string
  role: string
  organizationId: string
  invitedById: string
  usedAt: Date | null
  expiresAt: Date
  createdAt: Date
  invitedBy: {
    id: string
    name: string
    email: string
  }
  organization?: {
    id: string
    name: string
  }
}

type InvitationStatus = 'all' | 'pending' | 'accepted' | 'expired'

export default function AdminInvitationsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvitationStatus>('all')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedInvitation, setSelectedInvitation] = useState<Invitation | null>(null)

  // Data state
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Pagination state
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // Stats reais do servidor (totais independentes da paginação)
  const [stats, setStats] = useState({ total: 0, pending: 0, accepted: 0, expired: 0 })

  // Debounce da busca — reseta para página 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Reload quando statusFilter muda
  useEffect(() => {
    setPage(1)
  }, [statusFilter])

  const loadInvitations = useCallback(async (currentPage: number) => {
    try {
      setIsLoading(true)
      setError(null)

      const result = await getInvitationsAction({
        page: currentPage,
        limit: 20,
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      })

      if (result.success && result.data) {
        setInvitations(result.data as unknown as Invitation[])
        if (result.pagination) {
          setTotalPages(result.pagination.totalPages)
          setTotal(result.pagination.total)
        }
        if (result.stats) {
          setStats(result.stats)
        }
      } else {
        setError(result.error || 'Erro ao carregar convites')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar convites'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [debouncedSearch, statusFilter])

  // Reload quando page, busca ou filtro mudam
  useEffect(() => {
    loadInvitations(page)
  }, [loadInvitations, page])

  // Get invitation status (apenas para renderizar o badge na tabela)
  const now = new Date()
  const getInvitationStatus = (invitation: Invitation): 'pending' | 'accepted' | 'expired' => {
    if (invitation.usedAt) return 'accepted'
    if (new Date(invitation.expiresAt) <= now) return 'expired'
    return 'pending'
  }

  // Sem filtro client-side — o servidor já filtrou e paginou
  const filteredInvitations = invitations

  // Handle resend invitation
  const handleResendInvitation = async (invitationId: string) => {
    try {
      const result = await resendInvitationAction(invitationId)

      if (result.success) {
        toast.success('Convite reenviado com sucesso!')
        await loadInvitations(page)
      } else {
        toast.error(result.error || 'Erro ao reenviar convite')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao reenviar convite'
      toast.error(message)
    }
  }

  // Handle delete invitation
  const handleDeleteInvitation = async () => {
    if (!selectedInvitation) return

    try {
      const result = await deleteInvitationAction(selectedInvitation.id)

      if (result.success) {
        toast.success('Convite cancelado com sucesso!')
        setDeleteModalOpen(false)
        setSelectedInvitation(null)
        await loadInvitations(page)
      } else {
        toast.error(result.error || 'Erro ao cancelar convite')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao cancelar convite'
      toast.error(message)
    }
  }

  // Pagination handlers
  const handlePreviousPage = () => {
    if (page > 1) {
      loadInvitations(page - 1)
    }
  }

  const handleNextPage = () => {
    if (page < totalPages) {
      loadInvitations(page + 1)
    }
  }

  if (error) {
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
                <BreadcrumbPage>Histórico de Convites</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="p-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Erro ao carregar convites: {error || 'Erro desconhecido'}
            </AlertDescription>
          </Alert>
        </div>
      </>
    )
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
              <BreadcrumbPage>Convites</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex flex-col gap-6 p-8 pt-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Histórico de Convites</h1>
            <p className="text-muted-foreground mt-1">
              Visualize o histórico de convites de todas as organizações do sistema
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Total de Convites
              </CardDescription>
              <CardTitle className="text-4xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                Pendentes
              </CardDescription>
              <CardTitle className="text-4xl">{stats.pending}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Aceitos
              </CardDescription>
              <CardTitle className="text-4xl">{stats.accepted}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Expirados
              </CardDescription>
              <CardTitle className="text-4xl">{stats.expired}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por email, role ou quem convidou..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value: InvitationStatus) => setStatusFilter(value)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="accepted">Aceitos</SelectItem>
                <SelectItem value="expired">Expirados</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Organização</TableHead>
                <TableHead>Convidado por</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expira em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredInvitations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10">
                    <div className="flex flex-col items-center gap-2">
                      <Mail className="h-10 w-10 text-muted-foreground" />
                      <p className="text-muted-foreground">
                        {searchTerm || statusFilter !== 'all'
                          ? 'Nenhum convite encontrado com os filtros aplicados'
                          : 'Nenhum convite criado ainda'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvitations.map((invitation: Invitation) => {
                  const status = getInvitationStatus(invitation)
                  return (
                    <TableRow key={invitation.id}>
                      <TableCell className="font-medium">{invitation.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{invitation.role}</Badge>
                      </TableCell>
                      <TableCell>{invitation.organization?.name || 'N/A'}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{invitation.invitedBy.name}</span>
                          <span className="text-xs text-muted-foreground">{invitation.invitedBy.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {status === 'accepted' && (
                          <Badge variant="default" className="bg-green-500">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Aceito
                          </Badge>
                        )}
                        {status === 'pending' && (
                          <Badge variant="default" className="bg-blue-500">
                            <Clock className="h-3 w-3 mr-1" />
                            Pendente
                          </Badge>
                        )}
                        {status === 'expired' && (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            Expirado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {invitation.usedAt
                          ? `Aceito ${safeFormatDate(invitation.usedAt)}`
                          : safeFormatDate(invitation.expiresAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {status !== 'accepted' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleResendInvitation(invitation.id)}>
                                <Send className="h-4 w-4 mr-2" />
                                {status === 'expired' ? 'Reenviar (Renovar)' : 'Reenviar Email'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedInvitation(invitation)
                                  setDeleteModalOpen(true)
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Cancelar Convite
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Página {page} de {totalPages} ({total} convites)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={page <= 1 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={page >= totalPages || isLoading}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Delete Invitation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Convite</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar o convite para{' '}
              <strong>{selectedInvitation?.email}</strong>?
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Esta ação não pode ser desfeita. O link do convite será invalidado.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={handleDeleteInvitation}>
              <Trash2 className="h-4 w-4 mr-2" />
              Sim, Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
