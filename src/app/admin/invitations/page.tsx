'use client'

import { useState, useEffect } from 'react'
import {
  Plus,
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
} from 'lucide-react'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
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
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Helper para formatar datas com segurança
function safeFormatDate(date: any): string {
  if (!date) return 'N/A'
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return 'N/A'
    return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
  } catch {
    return 'N/A'
  }
}

import {
  getInvitationsAction,
  createInvitationAction,
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
    name: string
    email: string
  }
  organization?: {
    name: string
  }
}

type InvitationStatus = 'all' | 'pending' | 'accepted' | 'expired'

export default function AdminInvitationsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvitationStatus>('all')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedInvitation, setSelectedInvitation] = useState<Invitation | null>(null)

  // Data state
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    role: 'user',
    organizationId: '',
    expiresInDays: 7,
  })

  // Load invitations on mount
  useEffect(() => {
    loadInvitations()
  }, [])

  const loadInvitations = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // ✅ CORREÇÃO BRUTAL: Passar token do localStorage para Server Action
      // Fallback para compatibilidade com auth atual que usa localStorage
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined

      const result = await getInvitationsAction(token)

      if (result.success && result.data) {
        setInvitations(result.data)
      } else {
        setError(result.error || 'Erro ao carregar convites')
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar convites')
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate statistics
  const now = new Date()
  const stats = {
    total: invitations.length,
    pending: invitations.filter(
      (i: Invitation) => !i.usedAt && new Date(i.expiresAt) > now
    ).length,
    accepted: invitations.filter((i: Invitation) => !!i.usedAt).length,
    expired: invitations.filter(
      (i: Invitation) => !i.usedAt && new Date(i.expiresAt) <= now
    ).length,
  }

  // Get invitation status
  const getInvitationStatus = (invitation: Invitation): 'pending' | 'accepted' | 'expired' => {
    if (invitation.usedAt) return 'accepted'
    if (new Date(invitation.expiresAt) <= now) return 'expired'
    return 'pending'
  }

  // Filter invitations
  const filteredInvitations = invitations.filter((invitation: Invitation) => {
    const matchesSearch =
      invitation.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invitation.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invitation.invitedBy.name.toLowerCase().includes(searchTerm.toLowerCase())

    const status = getInvitationStatus(invitation)
    const matchesStatus = statusFilter === 'all' || status === statusFilter

    return matchesSearch && matchesStatus
  })

  // Handle create invitation
  const handleCreateInvitation = async () => {
    if (!formData.email || !formData.organizationId) {
      toast.error('Email e organização são obrigatórios')
      return
    }

    try {
      const result = await createInvitationAction(formData)

      if (result.success) {
        toast.success('Convite criado com sucesso!', {
          description: `Um email foi enviado para ${formData.email}`,
        })
        setCreateModalOpen(false)
        setFormData({
          email: '',
          role: 'user',
          organizationId: '',
          expiresInDays: 7,
        })
        await loadInvitations()
      } else {
        toast.error(result.error || 'Erro ao criar convite')
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar convite')
    }
  }

  // Handle resend invitation
  const handleResendInvitation = async (invitationId: string) => {
    try {
      const result = await resendInvitationAction(invitationId)

      if (result.success) {
        toast.success('Convite reenviado com sucesso!')
        await loadInvitations()
      } else {
        toast.error(result.error || 'Erro ao reenviar convite')
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao reenviar convite')
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
        await loadInvitations()
      } else {
        toast.error(result.error || 'Erro ao cancelar convite')
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao cancelar convite')
    }
  }

  // Handle copy invite link
  const handleCopyInviteLink = (token: string) => {
    const baseUrl = window.location.origin
    const inviteUrl = `${baseUrl}/connect?token=${token}`
    navigator.clipboard.writeText(inviteUrl)
    toast.success('Link copiado para a área de transferência!')
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
                <BreadcrumbPage>Convites</BreadcrumbPage>
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
            <h1 className="text-3xl font-bold">Convites de Organização</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie convites para todas as organizações do sistema
            </p>
          </div>
          <Button onClick={() => setCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Convite
          </Button>
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
                      {!searchTerm && statusFilter === 'all' && (
                        <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Criar Primeiro Convite
                        </Button>
                      )}
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {status !== 'accepted' && (
                              <>
                                <DropdownMenuItem onClick={() => handleCopyInviteLink(invitation.id)}>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copiar Link
                                </DropdownMenuItem>
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
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Create Invitation Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Convite</DialogTitle>
            <DialogDescription>
              Envie um convite para adicionar um novo membro a uma organização
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@exemplo.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organizationId">ID da Organização *</Label>
              <Input
                id="organizationId"
                placeholder="uuid-da-organizacao"
                value={formData.organizationId}
                onChange={(e) => setFormData({ ...formData, organizationId: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Encontre o ID na página de organizações
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="master">Master</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiresInDays">Validade (dias)</Label>
              <Select
                value={formData.expiresInDays.toString()}
                onValueChange={(value) => setFormData({ ...formData, expiresInDays: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 dia</SelectItem>
                  <SelectItem value="3">3 dias</SelectItem>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="14">14 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateInvitation}>
              <Send className="h-4 w-4 mr-2" />
              Enviar Convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
