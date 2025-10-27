'use client'

import { useState } from 'react'
import { Plus, Search, MoreVertical, Plug, PlugZap, Activity, XCircle, CheckCircle2 } from 'lucide-react'
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
import { ConnectionModal } from '@/components/whatsapp/connection-modal'
import { CreateInstanceModal } from '@/components/whatsapp/create-instance-modal'
import { ShareModal } from '@/components/whatsapp/share-modal'
import { EditInstanceModal } from '@/components/whatsapp/edit-instance-modal'
import { DetailsModal } from '@/components/whatsapp/details-modal'
import { useInstances } from '@/hooks/useInstance'
import type { Instance } from '@prisma/client'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function IntegracoesPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const { data: instancesData, isLoading, error, refetch } = useInstances()
  const instances = instancesData?.data || []

  // Calcular estatísticas
  const stats = {
    total: instances.length,
    connected: instances.filter(i => i.status === 'connected').length,
    disconnected: instances.filter(i => i.status === 'disconnected').length,
    active: instances.filter(i => i.status === 'connected').length,
    inactive: instances.filter(i => i.status !== 'connected').length,
  }

  // Filtrar instâncias
  const filteredInstances = instances.filter(instance =>
    instance.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    instance.phoneNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Integração
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total</CardDescription>
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
                <Activity className="h-4 w-4 text-blue-500" />
                Ativas
              </CardDescription>
              <CardTitle className="text-4xl">{stats.active}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <PlugZap className="h-4 w-4 text-gray-500" />
                Inativas
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
                  placeholder="Buscar por nome ou telefone..."
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
                  {filteredInstances.map((instance) => (
                    <TableRow key={instance.id}>
                      <TableCell className="font-medium">{instance.name}</TableCell>
                      <TableCell>{instance.phoneNumber || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <img
                            src="/logo.svg"
                            alt="WhatsApp"
                            className="h-4 w-4"
                          />
                          <span className="text-sm">WhatsApp falecomigo.ai</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={instance.status === 'connected' ? 'default' : 'secondary'}>
                          {instance.status === 'connected' ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={instance.status === 'connected' ? 'default' : 'destructive'}>
                          {instance.status === 'connected' ? 'Conectado' : 'Desconectado'}
                        </Badge>
                      </TableCell>
                      <TableCell>0 agente(s)</TableCell>
                      <TableCell>
                        {formatDistanceToNow(new Date(instance.createdAt), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell>
                        {formatDistanceToNow(new Date(instance.updatedAt), {
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
          refetch()
          setIsCreateModalOpen(false)
        }}
      />

      <ConnectionModal
        instance={selectedInstance}
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
      />

      <ShareModal
        instance={selectedInstance}
        isOpen={isShareModalOpen}
        onClose={() => {
          setIsShareModalOpen(false)
          setSelectedInstance(null)
        }}
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
    </>
  )
}
