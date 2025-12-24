'use client'

import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Check, CheckCheck, MessageCircle, Users, AlertTriangle, Info, X, Settings, XCircle, Wifi, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

export type NotificationType = 'MESSAGE' | 'USER' | 'WARNING' | 'INFO' | 'SUCCESS' | 'ERROR' | 'SYSTEM' | 'CONNECTION'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  description: string
  createdAt: string
  read: boolean
  actionUrl?: string | null
  actionLabel?: string | null
}

const notificationIcons: Record<NotificationType, React.ReactNode> = {
  MESSAGE: <MessageCircle className="h-4 w-4 text-blue-500" aria-hidden="true" />,
  USER: <Users className="h-4 w-4 text-purple-500" aria-hidden="true" />,
  WARNING: <AlertTriangle className="h-4 w-4 text-yellow-500" aria-hidden="true" />,
  INFO: <Info className="h-4 w-4 text-sky-500" aria-hidden="true" />,
  SUCCESS: <Check className="h-4 w-4 text-green-500" aria-hidden="true" />,
  ERROR: <XCircle className="h-4 w-4 text-red-500" aria-hidden="true" />,
  SYSTEM: <Settings className="h-4 w-4 text-gray-500" aria-hidden="true" />,
  CONNECTION: <Wifi className="h-4 w-4 text-emerald-500" aria-hidden="true" />,
}

function formatRelativeTime(date: string): string {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `${diffMins}min atras`
  if (diffHours < 24) return `${diffHours}h atras`
  if (diffDays < 7) return `${diffDays}d atras`
  return d.toLocaleDateString('pt-BR')
}

// Helper to fetch with auth
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.message || 'Erro na requisicao')
  }
  return data
}

interface NotificationCenterProps {
  className?: string
}

export function NotificationCenter({ className }: NotificationCenterProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)

  // Fetch notifications for current user
  const { data: notificationsData, isLoading, error } = useQuery({
    queryKey: ['my-notifications'],
    queryFn: async () => {
      return fetchWithAuth('/api/v1/notifications/my')
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider fresh for 10 seconds
  })

  // Fetch unread count separately for badge
  const { data: countData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      return fetchWithAuth('/api/v1/notifications/unread-count')
    },
    refetchInterval: 15000, // Refetch every 15 seconds
    staleTime: 5000,
  })

  // Mark single notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return fetchWithAuth(`/api/v1/notifications/${id}/read`, {
        method: 'POST',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  // Mark all as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return fetchWithAuth('/api/v1/notifications/mark-all-read', {
        method: 'POST',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  // API returns { data: { data: [...], pagination: {...} } }
  const notifications: Notification[] = useMemo(() => {
    const data = notificationsData?.data
    return Array.isArray(data) ? data : (data?.data ?? [])
  }, [notificationsData])
  const unreadCount = countData?.data?.count || notifications.filter(n => !n.read).length

  const handleNotificationClick = useCallback((notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id)
    }

    // Navigate if actionUrl exists
    if (notification.actionUrl) {
      setIsOpen(false)
      router.push(notification.actionUrl)
    }
  }, [markAsReadMutation, router])

  const handleMarkAllAsRead = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    markAllAsReadMutation.mutate()
  }, [markAllAsReadMutation])

  const handleGoToSettings = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOpen(false)
    router.push('/admin/notificacoes')
  }, [router])

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
          aria-label={`Notificacoes${unreadCount > 0 ? `, ${unreadCount} nao lidas` : ''}`}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5"
              >
                <Badge
                  variant="destructive"
                  className="h-5 w-5 p-0 flex items-center justify-center text-[10px] font-bold"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 md:w-96"
        sideOffset={8}
      >
        <DropdownMenuLabel className="flex items-center justify-between py-3">
          <span className="text-base font-semibold">Notificacoes</span>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleMarkAllAsRead}
                disabled={markAllAsReadMutation.isPending}
                aria-label="Marcar todas como lidas"
              >
                {markAllAsReadMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                )}
                Marcar todas
              </Button>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {isLoading ? (
          <div className="py-8 text-center">
            <Loader2 className="h-8 w-8 mx-auto text-muted-foreground animate-spin mb-3" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Carregando notificacoes...
            </p>
          </div>
        ) : (error || notifications.length === 0) ? (
          <div className="py-8 text-center">
            <Bell className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Nenhuma notificacao
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Voce vera suas notificacoes aqui
            </p>
          </div>
        ) : (
          <>
            <ScrollArea className="h-[300px]">
              <div className="space-y-1 p-1">
                <AnimatePresence>
                  {notifications.map((notification, index) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20, height: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <DropdownMenuItem
                        className={cn(
                          "flex items-start gap-3 p-3 cursor-pointer rounded-lg transition-colors group",
                          !notification.read && "bg-accent/50"
                        )}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className={cn(
                          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                          !notification.read ? "bg-primary/10" : "bg-muted"
                        )}>
                          {notificationIcons[notification.type] || notificationIcons.INFO}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={cn(
                              "text-sm truncate",
                              !notification.read && "font-medium"
                            )}>
                              {notification.title}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {notification.description}
                          </p>
                          <p className="text-[10px] text-muted-foreground/70 mt-1">
                            {formatRelativeTime(notification.createdAt)}
                          </p>
                        </div>

                        {!notification.read && (
                          <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" aria-label="Nao lida" />
                        )}
                      </DropdownMenuItem>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>

            <DropdownMenuSeparator />

            <div className="p-2 flex items-center justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={handleGoToSettings}
                aria-label="Configurar notificacoes"
              >
                <Settings className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Gerenciar
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
