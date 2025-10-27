'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
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
  Share2
} from 'lucide-react';

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
  onConfigure: (id: string) => void;
  onDelete: (id: string) => void;
  onReconnect: (id: string) => void;
  onGenerateQrCode?: (id: string) => void;
  onShare?: (id: string) => void;
}

export function IntegrationCard({ 
  instance, 
  onConfigure, 
  onDelete, 
  onReconnect,
  onGenerateQrCode,
  onShare
}: IntegrationCardProps) {
  
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'connected':
        return {
          icon: <Wifi className="h-4 w-4" />,
          label: 'Conectado',
          variant: 'default' as const,
          color: 'text-green-500',
          bgColor: 'bg-green-500/10 border-green-500/20'
        };
      case 'connecting':
        return {
          icon: <Clock className="h-4 w-4 animate-spin" />,
          label: 'Conectando',
          variant: 'secondary' as const,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10 border-yellow-500/20'
        };
      default:
        return {
          icon: <WifiOff className="h-4 w-4" />,
          label: 'Desconectado',
          variant: 'destructive' as const,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10 border-red-500/20'
        };
    }
  };

  const statusConfig = getStatusConfig(instance.status);
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatPhoneNumber = (phone?: string) => {
    if (!phone) return 'Não conectado';
    
    // Formatar número brasileiro: +55 11 99999-9999
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 11) {
      return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    return phone;
  };

  return (
    <Card
      data-instance-id={instance.id}
      className={`relative overflow-hidden transition-all duration-200 hover:shadow-lg ${statusConfig.bgColor}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Avatar da instância */}
            <Avatar className="h-12 w-12">
              <AvatarImage 
                src={instance.profilePictureUrl} 
                alt={instance.profileName || instance.name}
              />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {getInitials(instance.name)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg truncate">
                {instance.name}
              </h3>
              <p className="text-sm text-muted-foreground truncate">
                {instance.profileName || 'WhatsApp Business'}
              </p>
            </div>
          </div>

          {/* Menu de ações */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onConfigure(instance.id)}>
                <Settings className="h-4 w-4 mr-2" />
                Configurar
              </DropdownMenuItem>
              {instance.status === 'disconnected' && onGenerateQrCode && (
                <DropdownMenuItem onClick={() => onGenerateQrCode(instance.id)}>
                  <QrCode className="h-4 w-4 mr-2" />
                  Gerar QR Code
                </DropdownMenuItem>
              )}
              {instance.status === 'connecting' && onGenerateQrCode && (
                <DropdownMenuItem onClick={() => onGenerateQrCode(instance.id)}>
                  <QrCode className="h-4 w-4 mr-2" />
                  Ver QR Code
                </DropdownMenuItem>
              )}
              {instance.status === 'disconnected' && (
                <DropdownMenuItem onClick={() => onReconnect(instance.id)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reconectar
                </DropdownMenuItem>
              )}
              {onShare && (
                <DropdownMenuItem onClick={() => onShare(instance.id)}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Compartilhar Link
                </DropdownMenuItem>
              )}
              <DropdownMenuItem 
                onClick={() => onDelete(instance.id)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Status badge */}
        <div className="flex items-center justify-between mb-4">
          <Badge variant={statusConfig.variant} className={`${statusConfig.color} ${statusConfig.bgColor}`}>
            {statusConfig.icon}
            <span className="ml-1">{statusConfig.label}</span>
          </Badge>
          
          {/* Métricas */}
          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            {instance.messageCount !== undefined && (
              <div className="flex items-center space-x-1">
                <MessageSquare className="h-4 w-4" />
                <span>{instance.messageCount}</span>
              </div>
            )}
            {instance.unreadCount && instance.unreadCount > 0 && (
              <Badge variant="destructive" className="h-5 w-5 rounded-full p-0 flex items-center justify-center">
                {instance.unreadCount}
              </Badge>
            )}
          </div>
        </div>

        {/* Informações da conexão */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono">
              {formatPhoneNumber(instance.phoneNumber)}
            </span>
          </div>
          
          {instance.status === 'connected' && (
            <div className="text-xs text-muted-foreground">
              Conectado em {new Date(instance.createdAt).toLocaleDateString('pt-BR')}
            </div>
          )}
        </div>

        {/* Botões de ação */}
        <div className="flex space-x-2 mt-4">
          {instance.status === 'connected' ? (
            <Button 
              onClick={() => onConfigure(instance.id)}
              className="flex-1"
            >
              <Settings className="h-4 w-4 mr-2" />
              Configurar
            </Button>
          ) : instance.status === 'connecting' ? (
            <Button 
              disabled 
              variant="outline" 
              className="flex-1"
            >
              <Clock className="h-4 w-4 mr-2 animate-spin" />
              Conectando...
            </Button>
          ) : (
            <Button 
              onClick={() => onReconnect(instance.id)}
              variant="outline" 
              className="flex-1"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reconectar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
