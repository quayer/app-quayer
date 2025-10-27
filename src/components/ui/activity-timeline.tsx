'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Check, X, AlertCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface TimelineEvent {
  id: string
  title: string
  description?: string
  timestamp: Date
  type: 'success' | 'error' | 'warning' | 'info'
  icon?: React.ReactNode
}

interface ActivityTimelineProps {
  events: TimelineEvent[]
  title?: string
  description?: string
}

const iconMap = {
  success: <Check className="h-4 w-4" />,
  error: <X className="h-4 w-4" />,
  warning: <AlertCircle className="h-4 w-4" />,
  info: <Clock className="h-4 w-4" />,
}

const colorMap = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
}

export function ActivityTimeline({ events, title, description }: ActivityTimelineProps) {
  return (
    <Card>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <div className="relative space-y-4">
          {/* Vertical line */}
          <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />

          {events.map((event, index) => (
            <div key={event.id} className="relative flex gap-4 items-start">
              {/* Icon */}
              <div
                className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full ${
                  colorMap[event.type]
                } text-white`}
              >
                {event.icon || iconMap[event.type]}
              </div>

              {/* Content */}
              <div className="flex-1 space-y-1 pt-0.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{event.title}</p>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(event.timestamp, {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>
                </div>
                {event.description && (
                  <p className="text-sm text-muted-foreground">{event.description}</p>
                )}
              </div>
            </div>
          ))}

          {events.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhuma atividade recente</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
