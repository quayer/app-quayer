/**
 * Connection Status Badge
 *
 * Badge visual para mostrar o status da conexão
 */

import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react'
import { getStatusMetadata, type ConnectionStatus } from '../connection.constants'
import { cn } from '@/lib/utils'

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const STATUS_ICONS = {
  pending: Clock,
  connecting: Loader2,
  connected: CheckCircle2,
  disconnected: XCircle,
  error: AlertCircle,
}

export function ConnectionStatusBadge({
  status,
  showIcon = true,
  size = 'md',
  className,
}: ConnectionStatusBadgeProps) {
  const metadata = getStatusMetadata(status)
  const Icon = STATUS_ICONS[metadata.icon]

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  }

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  }

  return (
    <Badge
      variant="secondary"
      className={cn(
        'inline-flex items-center gap-1.5 font-medium',
        metadata.bgColor,
        metadata.textColor,
        metadata.borderColor,
        'border',
        sizeClasses[size],
        className
      )}
    >
      {showIcon && (
        <Icon
          className={cn(
            iconSizes[size],
            status === 'CONNECTING' && 'animate-spin'
          )}
        />
      )}
      <span>{metadata.label}</span>
    </Badge>
  )
}
