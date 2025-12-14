'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  MoreVertical,
  Phone,
  PhoneOff,
  Settings,
  Trash2,
  QrCode,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Share2,
  User
} from 'lucide-react'
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
import { ConnectionStatus, type Connection as Instance } from '@prisma/client'
import { useDisconnectInstance, useDeleteInstance, useProfilePicture } from '@/hooks/useInstance'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface InstanceCardProps {
  instance: Instance
  onConnect: (instance: Instance) => void
  onEdit?: (instance: Instance) => void
  onShare?: (instance: Instance) => void
  isLoadingConnect?: boolean
  isLoadingDelete?: boolean
}

/**
 * @component InstanceCard
 * @description Card para exibir informações de uma instância WhatsApp
 * Inclui status visual, ações de conexão e menu de configurações
 */
export function InstanceCard({
  instance,
  onConnect,
  onEdit,
  onShare,
  isLoadingConnect = false,
  isLoadingDelete = false
}: InstanceCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const disconnectMutation = useDisconnectInstance()
  const deleteMutation = useDeleteInstance()

  // Business Logic: Buscar foto de perfil se instância estiver conectada
  const { data: profileData } = useProfilePicture(instance.status === ConnectionStatus.CONNECTED ? instance.id : '')

  // Business Logic: Determinar cor e ícone do status
  const getStatusConfig = (status: ConnectionStatus) => {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return {
          color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          icon: CheckCircle,
          label: 'Conectado'
        }
      case ConnectionStatus.CONNECTING:
        return {
          color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
          icon: Loader2,
          label: 'Conectando'
        }
      case ConnectionStatus.DISCONNECTED:
      default:
        return {
          color: 'bg-red-500/10 text-red-400 border-red-500/20',
          icon: XCircle,
          label: 'Desconectado'
        }
    }
  }

  const statusConfig = getStatusConfig(instance.status)
  const StatusIcon = statusConfig.icon

  // Business Logic: Formatar última conexão
  const formatLastConnected = () => {
    if (!instance.lastConnected) return 'Nunca conectado'
    try {
      const d = new Date(instance.lastConnected)
      if (isNaN(d.getTime())) return 'Data inválida'
      return formatDistanceToNow(d, {
        addSuffix: true,
        locale: ptBR
      })
    } catch {
      return 'Data inválida'
    }
  }

  // Business Logic: Verificar se pode conectar
  const canConnect = instance.status === ConnectionStatus.DISCONNECTED
  const canDisconnect = instance.status === ConnectionStatus.CONNECTED
  const isLoading = isLoadingConnect || isLoadingDelete || disconnectMutation.isPending || deleteMutation.isPending

  const handleConnect = () => {
    onConnect(instance)
  }

  const handleDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync(instance.id)
    } catch (error) {
      console.error('Erro ao desconectar instância:', error)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(instance.id)
      setShowDeleteDialog(false)
    } catch (error) {
      console.error('Erro ao deletar instância:', error)
    }
  }

  return (
    <>
      <Card className="bg-gray-800/50 border-gray-700 hover:border-gray-600 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              {/* Avatar com foto de perfil */}
              <Avatar className="h-12 w-12 border-2 border-gray-700">
                <AvatarImage
                  src={(profileData as any)?.profilePictureUrl || instance.profilePictureUrl || undefined}
                  alt={instance.name}
                />
                <AvatarFallback className="bg-gray-700 text-gray-300">
                  <User className="h-6 w-6" />
                </AvatarFallback>
              </Avatar>

              <div className="space-y-1 flex-1">
                <CardTitle className="text-white text-lg font-medium">
                  {instance.name}
                </CardTitle>
                {instance.phoneNumber && (
                  <p className="text-gray-400 text-sm flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {instance.phoneNumber}
                  </p>
                )}
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-gray-400 hover:text-white hover:bg-gray-700"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700">
                {onShare && (
                  <DropdownMenuItem
                    onClick={() => onShare(instance)}
                    className="text-gray-300 hover:text-white hover:bg-gray-700"
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Compartilhar
                  </DropdownMenuItem>
                )}
                {onEdit && (
                  <DropdownMenuItem
                    onClick={() => onEdit(instance)}
                    className="text-gray-300 hover:text-white hover:bg-gray-700"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Configurar
                  </DropdownMenuItem>
                )}
                {(onEdit || onShare) && <DropdownMenuSeparator className="bg-gray-700" />}
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Deletar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={`${statusConfig.color} border`}
            >
              <StatusIcon className={`h-3 w-3 mr-1 ${instance.status === ConnectionStatus.CONNECTING ? 'animate-spin' : ''}`} />
              {statusConfig.label}
            </Badge>
            
            {instance.status === ConnectionStatus.CONNECTED && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                {formatLastConnected()}
              </div>
            )}
          </div>

          {/* Informações Adicionais */}
          <div className="space-y-2 text-sm text-gray-400">
            <div className="flex items-center justify-between">
              <span>Broker:</span>
              <span className="text-gray-300 capitalize">{(instance as any).brokerType || instance.provider}</span>
            </div>
            {(instance as any).brokerId && (
              <div className="flex items-center justify-between">
                <span>ID Broker:</span>
                <span className="text-gray-300 font-mono text-xs">
                  {(instance as any).brokerId.slice(0, 8)}...
                </span>
              </div>
            )}
          </div>

          {/* Botões de Ação */}
          <div className="flex gap-2 pt-2">
            {canConnect && (
              <Button
                onClick={handleConnect}
                disabled={isLoading}
                className="flex-1 bg-theme-secondary hover:bg-theme-secondary-hover text-white"
              >
                <QrCode className="h-4 w-4 mr-2" />
                Conectar
              </Button>
            )}
            
            {canDisconnect && (
              <Button 
                onClick={handleDisconnect}
                disabled={isLoading}
                variant="outline"
                className="flex-1 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
              >
                <PhoneOff className="h-4 w-4 mr-2" />
                Desconectar
              </Button>
            )}
            
            {instance.status === ConnectionStatus.CONNECTING && (
              <Button 
                disabled
                variant="outline"
                className="flex-1 border-yellow-500/20 text-yellow-400"
              >
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Conectando...
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-800 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Tem certeza que deseja deletar a instância "{instance.name}"? 
              Esta ação não pode ser desfeita e todos os dados relacionados serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deletando...
                </>
              ) : (
                'Deletar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
