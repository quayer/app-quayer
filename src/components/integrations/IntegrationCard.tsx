'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MoreVertical,
  Settings,
  Trash2,
  RefreshCw,
  MessageSquare,
  Phone,
  Wifi,
  WifiOff,
  Clock,
  QrCode,
  Share2,
  Power,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

interface IntegrationCardProps {
  instance: {
    id: string;
    name: string;
    status: 'connected' | 'disconnected' | 'connecting';
    phoneNumber?: string;
    profileName?: string;
    profilePictureUrl?: string;
    createdAt: Date;
    messageCount?: number;
    unreadCount?: number;
  };
  onConfigure?: (id: string) => void;
  onDelete: (id: string) => void;
  onReconnect: (id: string) => void;
  onGenerateQrCode?: (id: string) => void;
  onShare?: (id: string) => void;
  onDisconnect?: (id: string) => void;
}

export function IntegrationCard({
  instance,
  onConfigure,
  onDelete,
  onReconnect,
  onGenerateQrCode,
  onShare,
  onDisconnect,
}: IntegrationCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'connected':
        return {
          icon: Wifi,
          animatedIcon: CheckCircle2,
          label: 'Conectado',
          variant: 'default' as const,
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-500/10 border-green-500/30',
          pulseColor: 'bg-green-500',
          gradient: 'from-green-500/20 via-transparent to-transparent',
        };
      case 'connecting':
        return {
          icon: Clock,
          animatedIcon: Loader2,
          label: 'Conectando',
          variant: 'secondary' as const,
          color: 'text-yellow-600 dark:text-yellow-400',
          bgColor: 'bg-yellow-500/10 border-yellow-500/30',
          pulseColor: 'bg-yellow-500',
          gradient: 'from-yellow-500/20 via-transparent to-transparent',
        };
      default:
        return {
          icon: WifiOff,
          animatedIcon: AlertCircle,
          label: 'Desconectado',
          variant: 'destructive' as const,
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-500/10 border-red-500/30',
          pulseColor: 'bg-red-500',
          gradient: 'from-red-500/20 via-transparent to-transparent',
        };
    }
  };

  const statusConfig = getStatusConfig(instance.status);
  const StatusIcon = statusConfig.icon;
  const AnimatedIcon = statusConfig.animatedIcon;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatPhoneNumber = (phone?: string) => {
    if (!phone) return 'Não conectado';

    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 11) {
      return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    return phone;
  };

  return (
    <TooltipProvider>
      <Card
        data-instance-id={instance.id}
        role="listitem"
        aria-label={`Integração ${instance.name} - ${statusConfig.label}`}
        className={cn(
          'relative overflow-hidden transition-all duration-300 group',
          'hover:shadow-lg hover:shadow-primary/5',
          'border-2',
          statusConfig.bgColor,
          isHovered && 'scale-[1.01]'
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Gradient overlay */}
        <div
          className={cn(
            'absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300',
            statusConfig.gradient,
            isHovered && 'opacity-100'
          )}
        />

        {/* Status indicator line */}
        <div
          className={cn(
            'absolute top-0 left-0 right-0 h-1 transition-all duration-300',
            statusConfig.pulseColor,
            instance.status === 'connecting' && 'animate-pulse'
          )}
        />

        <CardHeader className="relative pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* Avatar com indicador de status */}
              <div className="relative">
                <Avatar className="h-12 w-12 ring-2 ring-background shadow-md">
                  <AvatarImage
                    src={instance.profilePictureUrl}
                    alt={instance.profileName || instance.name}
                  />
                  <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                    {getInitials(instance.name)}
                  </AvatarFallback>
                </Avatar>
                {/* Pulse indicator */}
                <span
                  className={cn(
                    'absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center',
                    statusConfig.pulseColor
                  )}
                >
                  {instance.status === 'connected' && (
                    <span className="absolute inline-flex w-full h-full rounded-full animate-ping opacity-75 bg-green-400" />
                  )}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{instance.name}</h3>
                <p className="text-sm text-muted-foreground truncate">
                  {instance.profileName || 'WhatsApp Business'}
                </p>
              </div>
            </div>

            {/* Menu de ações */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                  aria-label={`Mais opções para ${instance.name}`}
                >
                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {onConfigure && (
                  <DropdownMenuItem onClick={() => onConfigure(instance.id)}>
                    <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
                    Configurar
                  </DropdownMenuItem>
                )}

                {instance.status !== 'connected' && onGenerateQrCode && (
                  <DropdownMenuItem onClick={() => onGenerateQrCode(instance.id)}>
                    <QrCode className="h-4 w-4 mr-2" aria-hidden="true" />
                    {instance.status === 'connecting' ? 'Ver QR Code' : 'Gerar QR Code'}
                  </DropdownMenuItem>
                )}

                {instance.status === 'disconnected' && (
                  <DropdownMenuItem onClick={() => onReconnect(instance.id)}>
                    <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                    Reconectar
                  </DropdownMenuItem>
                )}

                {instance.status === 'connected' && onDisconnect && (
                  <DropdownMenuItem onClick={() => onDisconnect(instance.id)}>
                    <Power className="h-4 w-4 mr-2" aria-hidden="true" />
                    Desconectar
                  </DropdownMenuItem>
                )}

                {onShare && (
                  <DropdownMenuItem onClick={() => onShare(instance.id)}>
                    <Share2 className="h-4 w-4 mr-2" aria-hidden="true" />
                    Compartilhar Link
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => onDelete(instance.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="relative pt-0">
          {/* Status badge */}
          <div className="flex items-center justify-between mb-4">
            <Badge
              variant={statusConfig.variant}
              className={cn(
                'gap-1.5 py-1 px-2.5 font-medium transition-all duration-300',
                statusConfig.color,
                statusConfig.bgColor
              )}
            >
              {instance.status === 'connecting' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <AnimatedIcon className="h-3.5 w-3.5" />
              )}
              <span>{statusConfig.label}</span>
            </Badge>

            {/* Métricas */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {instance.messageCount !== undefined && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-default">
                      <MessageSquare className="h-4 w-4" />
                      <span className="font-medium">{instance.messageCount.toLocaleString()}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Total de mensagens</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {instance.unreadCount && instance.unreadCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="destructive"
                      className="h-6 min-w-[24px] rounded-full p-0 flex items-center justify-center text-xs font-bold animate-pulse"
                    >
                      {instance.unreadCount > 99 ? '99+' : instance.unreadCount}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Mensagens não lidas</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Informações da conexão */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-muted-foreground">
                {formatPhoneNumber(instance.phoneNumber)}
              </span>
            </div>

            <div className="text-xs text-muted-foreground">
              Criado {safeFormatDate(instance.createdAt)}
            </div>
          </div>

          {/* Botões de ação */}
          <div className="flex gap-2 mt-4">
            {instance.status === 'connected' ? (
              <>
                {onConfigure && (
                  <Button
                    onClick={() => onConfigure(instance.id)}
                    className="flex-1 gap-2"
                    size="sm"
                  >
                    <Settings className="h-4 w-4" />
                    Configurar
                  </Button>
                )}
                {onShare && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => onShare(instance.id)}
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Compartilhar link de conexão</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </>
            ) : instance.status === 'connecting' ? (
              <Button
                variant="outline"
                className="flex-1 gap-2"
                size="sm"
                onClick={() => onGenerateQrCode?.(instance.id)}
              >
                <QrCode className="h-4 w-4" />
                Ver QR Code
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => setConnectDialogOpen(true)}
                  className="flex-1 gap-2"
                  size="sm"
                  aria-label={`Conectar instância ${instance.name}`}
                >
                  <QrCode className="h-4 w-4" aria-hidden="true" />
                  Conectar
                </Button>
                {onConfigure && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => onConfigure(instance.id)}
                        aria-label={`Configurar ${instance.name}`}
                      >
                        <Settings className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Configurações</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de escolha de método de conexão */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby="connect-method-description">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-green-500" aria-hidden="true" />
              Conectar WhatsApp
            </DialogTitle>
            <DialogDescription id="connect-method-description">
              Escolha como você deseja conectar o WhatsApp à instância "{instance.name}".
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Opção QR Code */}
            <Button
              variant="outline"
              className="h-auto py-4 px-4 justify-start gap-4 hover:bg-primary/5 hover:border-primary/50"
              onClick={() => {
                setConnectDialogOpen(false);
                onGenerateQrCode?.(instance.id);
              }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <QrCode className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold">Escanear QR Code</p>
                <p className="text-sm text-muted-foreground">
                  Conecte agora escaneando o código com seu celular
                </p>
              </div>
            </Button>

            {/* Opção Compartilhar Link */}
            {onShare && (
              <Button
                variant="outline"
                className="h-auto py-4 px-4 justify-start gap-4 hover:bg-green-500/5 hover:border-green-500/50"
                onClick={() => {
                  setConnectDialogOpen(false);
                  onShare(instance.id);
                }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
                  <Share2 className="h-6 w-6 text-green-600" aria-hidden="true" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold">Compartilhar Link</p>
                  <p className="text-sm text-muted-foreground">
                    Gere um link para enviar a outra pessoa conectar
                  </p>
                </div>
              </Button>
            )}
          </div>

          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConnectDialogOpen(false)}
              className="text-muted-foreground"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
