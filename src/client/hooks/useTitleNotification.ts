'use client'

import { useEffect } from 'react'

const BASE_TITLE = 'Conversas — Quayer'

/**
 * Hook que atualiza o document.title com a contagem de mensagens não lidas.
 *
 * Uso em page.tsx:
 *   import { useTitleNotification } from '@/client/hooks/useTitleNotification'
 *   useTitleNotification(totalUnreadCount)
 */
export function useTitleNotification(unreadCount: number) {
  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount > 99 ? '99+' : unreadCount}) ${BASE_TITLE}`
    } else {
      document.title = BASE_TITLE
    }

    return () => {
      document.title = BASE_TITLE
    }
  }, [unreadCount])
}
