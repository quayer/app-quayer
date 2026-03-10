'use client'

import { useEffect, useState, useMemo } from 'react'
import { Plus, Search, MoreVertical, Plug, Building2 } from 'lucide-react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConnectionModal } from '@/components/whatsapp/connection-modal'
import { CreateInstanceModal } from '@/components/whatsapp/create-instance-modal'
import { ShareModal } from '@/components/whatsapp/share-modal'
import { EditInstanceModal } from '@/components/whatsapp/edit-instance-modal'
import { DetailsModal } from '@/components/whatsapp/details-modal'
import { listAllInstancesAdminAction, type AdminInstance } from '../actions'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function getBrokerLabel(brokerType: string): string {
  const lower = brokerType.toLowerCase()
  if (lower.includes('uazapi') || lower.includes('uaz')) return 'UAZapi'
  if (lower.includes('whatsapp') || lower.includes('cloud')) return 'WhatsApp Cloud'
  return brokerType
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'connected') return <Badge variant="default">Conectado</Badge>
  if (status === 'disconnected') return <Badge variant="destructive">Desconectado</Badge>
  return <Badge variant="secondary">Pendente</Badge>
}

export default function IntegracoesAdminPage() {
  const [instances, setInstances] = useState<AdminInstance[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState<AdminInstance | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const loadInstances = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const result = await listAllInstancesAdminAction()
      if (result.success) {
        setInstances(result.data)
      } else {
        setLoadError(result.error || 'Erro ao carregar integrações')
      }
    } catch (err: any) {
      setLoadError(err.message || 'Erro inesperado')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadInstances()
  }, [])

  const filtered = useMemo(() => {
    return instances.filter((i) => {
      const matchSearch =
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.phoneNumber ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.organization?.name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'connected' && i.status === 'connected') ||
        (statusFilter === 'disconnected' && i.status !== 'connected')
      return matchSearch && matchStatus
    })
  }, [instances, searchTerm, statusFilter])

  const stats = useMemo(() => ({
    total: instances.length,
    connected: instances.filter((i) => i.status === 'connected').length,
    disconnected: instances.filter((i) => i.status !== 'connected').length,
    noOrg: instances.filter((i) => !i.organization).length,
  }), [instances])

  const handleConnect = (instance: AdminInstance) => {
    setSelectedInstance(instance)
    setIsConnectModalOpen(true)
  }

  const handleEdit = (instance: AdminInstance) => {
    setSelectedInstance(instance)
    setIsEditModalOpen(true)
  }

  const handleShare = (instance: AdminInstance) => {
    setSelectedInstance(instance)
    setIsShareModalOpen(true)
  }

  const handleDetails = (instance: AdminInstance) => {
    setSelectedInstance(instance)
    setIsDetailModalOpen(true)
  }

  if (loadError) {
    return (
      <div className="pt-6">
        <Alert variant="destructive">
          <AlertDescription>Erro ao carregar integrações: {loadError}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-6 pt-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Integrações</h1>
            <p className="text-muted-foreground mt-1">
              Todas as instâncias do sistema — visão global por organização
            </p>
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Integração
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total</CardDescription>
              <CardTitle className="text-3xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-green-600">Conectadas</CardDescription>
              <CardTitle className="text-3xl text-green-600">{stats.connected}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-destructive">Desconectadas</CardDescription>
              <CardTitle className="text-3xl text-destructive">{stats.disconnected}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground">Sem organização</CardDescription>
              <CardTitle className="text-3xl">{stats.noOrg}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters + Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, telefone ou organização..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="connected">Conectadas</SelectItem>
                  <SelectItem value="disconnected">Desconectadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <Plug className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhuma integração encontrada</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm || statusFilter !== 'all'
                    ? 'Tente ajustar os filtros'
                    : 'Crie a primeira integração para começar'}
                </p>
                {!searchTerm && statusFilter === 'all' && (
                  <Button onClick={() => setIsCreateModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Integração
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Organização</TableHead>
                    <TableHead>Provedor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((instance) => (
                    <TableRow key={instance.id}>
                      <TableCell className="font-medium">{instance.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {instance.phoneNumber || '—'}
                      </TableCell>
                      <TableCell>
                        {instance.organization ? (
                          <span className="flex items-center gap-1.5 text-sm">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            {instance.organization.name}
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-xs">Sem organização</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {getBrokerLabel(instance.brokerType)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={instance.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(instance.createdAt), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleDetails(instance)}>
                              Ver Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(instance)}>
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleConnect(instance)}>
                              {instance.status === 'connected' ? 'Reconectar' : 'Conectar'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleShare(instance)}>
                              Compartilhar
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

      {/* Modals */}
      <CreateInstanceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          loadInstances()
          setIsCreateModalOpen(false)
        }}
      />

      <ConnectionModal
        instance={selectedInstance as any}
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
      />

      <ShareModal
        instance={selectedInstance as any}
        isOpen={isShareModalOpen}
        onClose={() => {
          setIsShareModalOpen(false)
          setSelectedInstance(null)
        }}
      />

      <EditInstanceModal
        instance={selectedInstance as any}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedInstance(null)
        }}
        onSuccess={() => {
          loadInstances()
          setIsEditModalOpen(false)
          setSelectedInstance(null)
        }}
      />

      <DetailsModal
        instance={selectedInstance as any}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false)
          setSelectedInstance(null)
        }}
        onEdit={handleEdit as any}
      />
    </>
  )
}
