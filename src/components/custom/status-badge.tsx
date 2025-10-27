import { Badge } from '@/components/ui/badge'
import { Circle, CircleOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: 'connected' | 'disconnected' | 'connecting' | 'error'
  size?: 'default' | 'sm'
  className?: string
}

export function StatusBadge({ status, size = 'default', className }: StatusBadgeProps) {
  const config = {
    connected: {
      label: 'Conectado',
      icon: Circle,
      variant: 'default' as const,
      iconClassName: 'fill-current text-green-500',
    },
    disconnected: {
      label: 'Desconectado',
      icon: CircleOff,
      variant: 'secondary' as const,
      iconClassName: '',
    },
    connecting: {
      label: 'Conectando',
      icon: Loader2,
      variant: 'outline' as const,
      iconClassName: 'animate-spin text-yellow-500',
    },
    error: {
      label: 'Erro',
      icon: CircleOff,
      variant: 'destructive' as const,
      iconClassName: '',
    },
  }

  const { label, icon: Icon, variant, iconClassName } = config[status] || config.disconnected

  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : ''

  return (
    <Badge variant={variant} className={cn('gap-1', sizeClasses, className)}>
      <Icon className={cn(size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3', iconClassName)} />
      <span>{label}</span>
    </Badge>
  )
}
