/**
 * Provider Icon
 *
 * Ícone visual para representar o provider da conexão
 */

import { getProviderMetadata, type Provider } from '../connection.constants'
import { cn } from '@/lib/utils'

interface ProviderIconProps {
  provider: Provider
  size?: 'sm' | 'md' | 'lg' | 'xl'
  withBackground?: boolean
  className?: string
}

const SIZE_CLASSES = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
}

const BG_SIZE_CLASSES = {
  sm: 'p-1.5',
  md: 'p-2',
  lg: 'p-2.5',
  xl: 'p-3',
}

export function ProviderIcon({
  provider,
  size = 'md',
  withBackground = false,
  className,
}: ProviderIconProps) {
  const metadata = getProviderMetadata(provider)
  const Icon = metadata.icon

  if (withBackground) {
    return (
      <div
        className={cn(
          'inline-flex items-center justify-center rounded-lg',
          metadata.bgColor,
          metadata.color,
          'border',
          metadata.color.replace('text-', 'border-').replace('600', '200'),
          BG_SIZE_CLASSES[size],
          className
        )}
      >
        <Icon className={SIZE_CLASSES[size]} />
      </div>
    )
  }

  return (
    <Icon
      className={cn(
        SIZE_CLASSES[size],
        metadata.color,
        className
      )}
    />
  )
}
