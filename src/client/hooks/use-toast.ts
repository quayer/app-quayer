'use client'

import * as React from 'react'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
}

export interface ToastFn {
  (props: Omit<Toast, 'id'>): void
}

export function useToast() {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const toast: ToastFn = React.useCallback((props) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...props, id }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
  }, [])

  return { toasts, toast }
}
