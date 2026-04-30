'use client'

import { CheckCircle2, XCircle, Info, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Activity {
  id: string
  type: 'success' | 'error' | 'info' | 'pending'
  message: string
  instanceName?: string
  timestamp: Date
}

interface ActivityFeedProps {
  activities: Activity[]
  className?: string
}

const ActivityItem = ({
  activity,
  index,
}: {
  activity: Activity
  index: number
}) => {
  const icons = {
    success: CheckCircle2,
    error: XCircle,
    info: Info,
    pending: Clock,
  }

  const colors = {
    success: 'text-green-400 bg-green-500/10 border-green-500/20',
    error: 'text-red-400 bg-red-500/10 border-red-500/20',
    info: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  }

  const Icon = icons[activity.type]

  return (
    <div
      className={cn(
        'activity-item flex items-start gap-3 p-4 rounded-lg border backdrop-blur-sm',
        'transition-all duration-300 hover:scale-[1.02]',
        colors[activity.type]
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{activity.message}</p>
        {activity.instanceName && (
          <p className="text-xs text-gray-400 mt-1">
            Instância: {activity.instanceName}
          </p>
        )}
        <time className="text-xs text-gray-500 mt-1 block">
          {new Intl.DateTimeFormat('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }).format(activity.timestamp)}
        </time>
      </div>
    </div>
  )
}

export function ActivityFeed({ activities, className }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <div
        className={cn('text-center py-8 text-gray-500', className)}
        role="status"
        aria-live="polite"
      >
        <Info className="h-8 w-8 mx-auto mb-2 opacity-50" aria-hidden="true" />
        <p className="text-sm">Nenhuma atividade recente</p>
      </div>
    )
  }

  return (
    <div
      className={cn('space-y-2', className)}
      role="log"
      aria-live="polite"
      aria-label="Feed de atividades"
    >
      {activities.map((activity, index) => (
        <ActivityItem key={activity.id} activity={activity} index={index} />
      ))}
    </div>
  )
}