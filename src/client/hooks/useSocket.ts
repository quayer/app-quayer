'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

let globalSocket: Socket | null = null

/**
 * Global Socket.IO connection hook.
 * Maintains a single connection per client, shared across components.
 */
export function useSocket() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')

  useEffect(() => {
    if (globalSocket?.connected) {
      setStatus('connected')
      return
    }

    if (!globalSocket) {
      globalSocket = io({
        path: '/api/socket',
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
      })
    }

    const socket = globalSocket

    const onConnect = () => setStatus('connected')
    const onDisconnect = () => setStatus('disconnected')
    const onReconnecting = () => setStatus('reconnecting')
    const onConnectError = () => setStatus('disconnected')

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('reconnect_attempt', onReconnecting)
    socket.on('connect_error', onConnectError)

    if (!socket.connected) {
      setStatus('connecting')
      socket.connect()
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('reconnect_attempt', onReconnecting)
      socket.off('connect_error', onConnectError)
    }
  }, [])

  return { socket: globalSocket, status }
}

/**
 * Hook for chat-specific Socket.IO events.
 * Joins/leaves session room and listens for messages + typing.
 */
export function useChatSocket(sessionId: string | null) {
  const { socket, status } = useSocket()
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout>(undefined)

  // Join/leave session room
  useEffect(() => {
    if (!socket || !sessionId || status !== 'connected') return

    socket.emit('session:join', sessionId)

    return () => {
      socket.emit('session:leave', sessionId)
    }
  }, [socket, sessionId, status])

  // Listen for typing events
  useEffect(() => {
    if (!socket || !sessionId) return

    const onTypingStart = (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) {
        setIsTyping(true)
        // Auto-clear after 5s
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 5000)
      }
    }

    const onTypingStop = (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) {
        setIsTyping(false)
        clearTimeout(typingTimeoutRef.current)
      }
    }

    socket.on('typing:start', onTypingStart)
    socket.on('typing:stop', onTypingStop)

    return () => {
      socket.off('typing:start', onTypingStart)
      socket.off('typing:stop', onTypingStop)
      clearTimeout(typingTimeoutRef.current)
    }
  }, [socket, sessionId])

  // Emit typing
  const emitTyping = useCallback((typing: boolean) => {
    if (!socket || !sessionId) return
    socket.emit(typing ? 'typing:start' : 'typing:stop', { sessionId })
  }, [socket, sessionId])

  // Listen for events
  const onMessage = useCallback((event: string, callback: (data: any) => void) => {
    if (!socket) return () => {}
    socket.on(event, callback)
    return () => { socket.off(event, callback) }
  }, [socket])

  return {
    socket,
    status,
    isTyping,
    emitTyping,
    onMessage,
  }
}

/**
 * Hook for presence tracking.
 * Sends heartbeat and tracks online agents.
 */
export function usePresence() {
  const { socket, status } = useSocket()
  const [onlineUsers, setOnlineUsers] = useState<Map<string, { userName: string; status: string }>>(new Map())

  // Heartbeat
  useEffect(() => {
    if (!socket || status !== 'connected') return

    const interval = setInterval(() => {
      socket.emit('presence:heartbeat')
    }, 30000)

    // Initial heartbeat
    socket.emit('presence:heartbeat')

    return () => clearInterval(interval)
  }, [socket, status])

  // Listen for presence updates
  useEffect(() => {
    if (!socket) return

    const onPresence = (data: { userId: string; userName: string; status: string }) => {
      setOnlineUsers(prev => {
        const next = new Map(prev)
        if (data.status === 'offline') {
          next.delete(data.userId)
        } else {
          next.set(data.userId, { userName: data.userName, status: data.status })
        }
        return next
      })
    }

    socket.on('presence:update', onPresence)
    return () => { socket.off('presence:update', onPresence) }
  }, [socket])

  return { onlineUsers, status }
}
