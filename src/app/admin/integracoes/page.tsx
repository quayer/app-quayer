'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Search, MoreVertical, Plug, XCircle, CheckCircle2, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react'
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
  DropdownMenuSeparator,
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
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConnectionModal } from '@/components/whatsapp/connection-modal'
import { CreateInstanceModal } from '@/components/whatsapp/create-instance-modal'
import { ShareLinkModal } from '@/components/whatsapp/share-link-modal'
import { EditInstanceModal } from '@/components/whatsapp/edit-instance-modal'
import { DetailsModal } from '@/components/whatsapp/details-modal'
import { AssignOrganizationModal } from './assign-organization-modal'
import { useAllInstances } from '@/hooks/useAllInstances'
import type { Connection as Instance } from '@prisma/client'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Helper para formatar datas com segurança
function safeFormatDate(date: any): string | null {
  if (!date) return null
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return null
    return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
  } catch {
    return null
  }
}

export default function IntegracoesPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isAssignOrgModalOpen, setIsAssignOrgModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState<any | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isMounted, setIsMounted] = useState(false)

  // Hydration fix: esperar montagem no cliente
  useEffect(() => {
    setIsMounted(true)
  }, [])

  const { data: allInstancesData, isLoading, error, refetch } = useAllInstances()
  const instances = allInstancesData?.data || []
  const meta = allInstancesData?.success ? (allInstancesData as any)?.meta : undefined

  // Calcular estatísticas baseado nos dados do UAZapi
  // UAZapi retorna status em lowercase: 'connected', 'disconnected'
  const normalizeStatus = (status: string | undefined) => (status || '').toLowerCase()
  const isConnectedStatus = (s: string) => s === 'connected' || s === 'open'
  const isDisconnectedStatus = (s: string) => s === 'disconnected' || s === 'close'

  const stats = {
    total: meta?.totalUAZapi || instances.length,
    connected: instances.filter((i: any) => isConnectedStatus(normalizeStatus(i.uazStatus || i.status))).length,
    disconnected: instances.filter((i: any) => isDisconnectedStatus(normalizeStatus(i.uazStatus || i.status))).length,
    active: instances.filter((i: any) => isConnectedStatus(normalizeStatus(i.uazStatus || i.status))).length,
    inactive: instances.filter((i: any) => !isConnectedStatus(normalizeStatus(i.uazStatus || i.status))).length,
    inQuayerDB: meta?.totalLocal || instances.filter((i: any) => i.inQuayerDB).length,
  }

  // Filtrar instâncias (buscar em nome local ou do UAZapi)
  const filteredInstances = instances.filter((instance: any) => {
    const name = instance.name || instance.uazInstanceName || ''
    const phone = instance.phoneNumber || instance.uazPhoneNumber || ''
    return name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      phone.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const handleConnect = (instance: Instance) => {
    setSelectedInstance(instance)
    setIsConnectModalOpen(true)
  }

  const handleEdit = (instance: Instance) => {
    setSelectedInstance(instance)
    setIsEditModalOpen(true)
  }

  const handleShare = (instance: Instance) => {
    setSelectedInstance(instance)
    setIsShareModalOpen(true)
  }

  const handleDetails = (instance: Instance) => {
    setSelectedInstance(instance)
    setIsDetailModalOpen(true)
  }

  const handleAssignOrganization = (instance: any) => {
    setSelectedInstance(instance)
    setIsAssignOrgModalOpen(true)
  }

  const handleDeleteClick = (instance: any) => {
    setSelectedInstance(instance)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!selectedInstance) return

    setIsDeleting(true)
    try {
      // Se está no Quayer DB, deletar usando o controller (que também remove do UAZapi)
      if (selectedInstance.inQuayerDB && selectedInstance.id) {
        const response = await fetch(`/api/v1/instances/${selectedInstance.id}`, {
          method: 'DELETE',
        })
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.message || data.error || 'Erro ao excluir instância')
        }
      } else {
        // Se não está no banco local, deletar diretamente do UAZapi pelo token
        const token = selectedInstance.uazToken || selectedInstance.token
        if (token) {
          const response = await fetch('/api/v1/instances/delete-by-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          })
          if (!response.ok) {
            const data = await response.json()
            throw new Error(data.message || data.error || 'Erro ao excluir no UAZapi')
          }
        } else {
          throw new Error('Instância não possui token para exclusão')
        }
      }

      toast.success('Instância excluída com sucesso')
      refetch()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir instância')
    } finally {
      setIsDeleting(false)
      setIsDeleteDialogOpen(false)
      setSelectedInstance(null)
    }
  }

  if (error) {
    return (
      <div className="pt-6">
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar integrações: {error.message}
          </AlertDescription>
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
              Gerencie todas as integrações do sistema
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Link href="/admin/settings">
              <Button variant="outline" size="sm">
                <Plug className="h-4 w-4 mr-2" />
                Configurações UAZapi
              </Button>
            </Link>
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Integração
            </Button>
          </div>
        </div>

        {/* Alerta de erro UAZapi */}
        {meta?.uazApiError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                <strong>Erro ao conectar com UAZapi:</strong> {meta.uazApiError}.
                Mostrando apenas instâncias do banco local ({meta.totalLocal}).
              </span>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-4">
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total (UAZapi)</CardDescription>
              <CardTitle className="text-4xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Conectadas
              </CardDescription>
              <CardTitle className="text-4xl">{stats.connected}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Desconectadas
              </CardDescription>
              <CardTitle className="text-4xl">{stats.disconnected}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <Plug className="h-4 w-4 text-purple-500" />
                No Quayer DB
              </CardDescription>
              <CardTitle className="text-4xl">{stats.inQuayerDB}</CardTitle>
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
                  placeholder="Buscar por nome ou telefone..."
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
            ) : filteredInstances.length === 0 ? (
              <div className="text-center py-12">
                <Plug className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  Nenhuma integração encontrada
                </h3>
                <p className="text-muted-foreground mb-4">
                  Crie sua primeira integração para começar
                </p>
                <Button onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Integração
                </Button>
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
                    <TableHead>Conexão</TableHead>
                    <TableHead>Agentes</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Atualizado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInstances.map((instance: any) => {
                    const displayName = instance.name || instance.uazInstanceName || 'Sem nome'
                    const displayPhone = instance.phoneNumber || instance.uazPhoneNumber || '-'
                    const rawStatus = instance.uazStatus || instance.status || 'unknown'
                    const displayStatus = rawStatus.toLowerCase()
                    const isConnected = isConnectedStatus(displayStatus)
                    const rowKey = instance.id || instance.uazInstanceId

                    return (
                      <TableRow key={rowKey}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {displayName}
                            {!instance.inQuayerDB && (
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                                UAZapi only
                              </Badge>
                            )}
                            {instance.uazApiOrphan && (
                              <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-300">
                                Local only
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{displayPhone}</TableCell>
                        <TableCell>
                          {instance.organization ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                {instance.organization.name}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Sem organização</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <img
                              src="/logo.svg"
                              alt="WhatsApp"
                              className="h-4 w-4"
                            />
                            <span className="text-sm">
                              {instance.inQuayerDB ? 'Quayer (UAZapi)' : 'UAZapi (não importado)'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={isConnected ? 'default' : 'secondary'}>
                            {isConnected ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={isConnected ? 'default' : 'destructive'}>
                            {isConnected ? 'Conectado' : 'Desconectado'}
                          </Badge>
                        </TableCell>
                        <TableCell>0 agente(s)</TableCell>
                        <TableCell>
                          {safeFormatDate(instance.createdAt) || <span className="text-muted-foreground text-sm">-</span>}
                        </TableCell>
                        <TableCell>
                          {safeFormatDate(instance.updatedAt) || <span className="text-muted-foreground text-sm">-</span>}
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
                              {instance.inQuayerDB ? (
                                <>
                                  <DropdownMenuItem onClick={() => handleEdit(instance)}>
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleConnect(instance)}>
                                    {isConnected ? 'Reconectar' : 'Conectar'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleShare(instance)}>
                                    Compartilhar Link
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleAssignOrganization(instance)}>
                                    {instance.organization ? 'Alterar Organização' : 'Atribuir Organização'}
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem onClick={() => handleAssignOrganization(instance)}>
                                  Importar para Quayer
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDeleteClick(instance)}
                                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
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
          refetch()
          setIsCreateModalOpen(false)
        }}
      />

      <ConnectionModal
        instance={selectedInstance}
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        onSuccess={() => {
          refetch()
          setIsConnectModalOpen(false)
          setSelectedInstance(null)
        }}
      />

      <ShareLinkModal
        open={isShareModalOpen}
        onOpenChange={(open) => {
          setIsShareModalOpen(open)
          if (!open) setSelectedInstance(null)
        }}
        instanceId={selectedInstance?.id || ''}
        instanceName={selectedInstance?.name || ''}
      />

      <EditInstanceModal
        instance={selectedInstance}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedInstance(null)
        }}
        onSuccess={() => {
          refetch()
          setIsEditModalOpen(false)
          setSelectedInstance(null)
        }}
      />

      <DetailsModal
        instance={selectedInstance}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false)
          setSelectedInstance(null)
        }}
        onEdit={handleEdit}
      />

      <AssignOrganizationModal
        instance={selectedInstance}
        isOpen={isAssignOrgModalOpen}
        onClose={() => {
          setIsAssignOrgModalOpen(false)
          setSelectedInstance(null)
        }}
        onSuccess={() => {
          refetch()
          setIsAssignOrgModalOpen(false)
          setSelectedInstance(null)
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-muted-foreground text-sm">
                <p>
                  Tem certeza que deseja excluir a instância{' '}
                  <strong className="text-foreground">{selectedInstance?.name || selectedInstance?.uazInstanceName}</strong>?
                </p>
                <p className="mt-3">Esta ação irá:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {(selectedInstance?.uazToken || selectedInstance?.token) && (
                    <li>Excluir a instância do UAZapi</li>
                  )}
                  {selectedInstance?.inQuayerDB && (
                    <li>Remover do banco de dados local</li>
                  )}
                </ul>
                <p className="mt-3 text-red-600 font-medium">Esta ação não pode ser desfeita.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
