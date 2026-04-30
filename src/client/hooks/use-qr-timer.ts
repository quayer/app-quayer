'use client'

import { useState, useEffect, useCallback } from 'react'

export type TimerState = 'normal' | 'warning' | 'critical' | 'refreshing'

const WARNING_AT = 30
const CRITICAL_AT = 10

export function useQRTimer(initial: number, onExpire: () => void) {
  const [left, setLeft] = useState(initial)
  const [state, setState] = useState<TimerState>('normal')

  useEffect(() => { setLeft(initial) }, [initial])

  useEffect(() => {
    if (initial <= 0) return  // not started — don't fire onExpire
    if (left <= 0) { setState('refreshing'); onExpire(); return }
    if (left <= CRITICAL_AT) setState('critical')
    else if (left <= WARNING_AT) setState('warning')
    else setState('normal')
    const t = setInterval(() => setLeft(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(t)
  }, [left, onExpire, initial])

  const reset = useCallback((n: number) => { setLeft(n); setState('normal') }, [])
  const fmt = useCallback((s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`, [])

  return { left, state, reset, fmt }
}
