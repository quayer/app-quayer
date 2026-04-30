/**
 * Socket.IO Server Service
 *
 * Provides real-time bidirectional communication replacing SSE.
 * Uses Redis adapter for cross-process event distribution.
 *
 * Namespaces:
 *   /chat          — Conversations, messages, typing indicators
 *   /dashboard     — Analytics, session list updates
 *   /notifications — System notifications
 *
 * Rooms:
 *   session:{sessionId}  — Agents viewing a conversation
 *   org:{orgId}          — All agents in an organization
 *   instance:{connId}    — Instance status watchers
 */

import { Server as SocketIOServer, Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { Redis } from 'ioredis'
import type { Server as HTTPServer } from 'http'

let _io: SocketIOServer | null = null

// Event type definitions (matching existing SSE events)
export interface SocketEvents {
  // Messages
  'message:received': {
    sessionId: string
    messageId: string
    content: string
    author: 'CUSTOMER' | 'AGENT' | 'BOT' | 'SYSTEM'
    organizationId: string
  }
  'message:sent': {
    sessionId: string
    messageId: string
    content: string
    organizationId: string
  }
  'message:status': {
    messageId: string
    status: 'delivered' | 'read' | 'failed'
    sessionId: string
  }

  // Sessions
  'session:updated': {
    sessionId: string
    field: string
    oldValue: any
    newValue: any
    organizationId: string
  }
  'session:labels:changed': {
    sessionId: string
    action: 'replaced' | 'added' | 'removed'
    labelIds?: string[]
    labelId?: string
    organizationId: string
  }

  // Contacts
  'contact:updated': {
    contactId: string
    field: string
    oldValue: any
    newValue: any
    organizationId?: string
  }
  'contact:labels:changed': {
    contactId: string
    action: 'replaced' | 'added' | 'removed'
    labelIds?: string[]
    labelId?: string
    organizationId?: string
  }

  // Instances
  'instance:status:changed': {
    connectionId: string
    status: string
    organizationId: string
  }

  // Typing (bidirectional — new!)
  'typing:start': {
    sessionId: string
    userId?: string
    userName?: string
    isCustomer?: boolean
  }
  'typing:stop': {
    sessionId: string
    userId?: string
    isCustomer?: boolean
  }

  // Presence (new!)
  'presence:update': {
    userId: string
    userName: string
    status: 'online' | 'away' | 'offline'
    organizationId: string
  }
  'presence:heartbeat': {
    userId: string
    organizationId: string
  }
}

/**
 * Initialize Socket.IO server with Redis adapter.
 * Call this when your HTTP server is ready.
 */
export function initSocketIO(httpServer: HTTPServer): SocketIOServer {
  if (_io) return _io

  _io = new SocketIOServer(httpServer, {
    path: '/api/socket',
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
  })

  // Redis adapter for multi-process support
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    const pubClient = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true })
    const subClient = pubClient.duplicate()

    _io.adapter(createAdapter(pubClient, subClient))
    console.log('[Socket.IO] Redis adapter connected')
  } catch (error) {
    console.warn('[Socket.IO] Redis adapter failed, using in-memory adapter:', error)
  }

  // Auth middleware — validate JWT from cookie
  _io.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie
      if (!cookie) {
        return next(new Error('Authentication required'))
      }

      // Extract access token from cookie
      const tokenMatch = cookie.match(/access_token=([^;]+)/)
      if (!tokenMatch) {
        return next(new Error('No access token'))
      }

      // Lazy import to avoid circular dependencies
      const { verifyAccessToken } = await import('@/lib/auth/jwt')
      const payload = verifyAccessToken(tokenMatch[1])

      if (!payload) {
        return next(new Error('Invalid token'))
      }

      // Attach user info to socket
      ;(socket as any).userId = payload.userId
      ;(socket as any).orgId = payload.currentOrgId

      next()
    } catch {
      next(new Error('Authentication failed'))
    }
  })

  // Connection handler
  _io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId as string
    const orgId = (socket as any).orgId as string

    if (!userId || !orgId) {
      socket.disconnect(true)
      return
    }

    // Auto-join organization room
    socket.join(`org:${orgId}`)

    console.log(`[Socket.IO] User ${userId} connected (org: ${orgId})`)

    // Join session room
    socket.on('session:join', (sessionId: string) => {
      socket.join(`session:${sessionId}`)
    })

    // Leave session room
    socket.on('session:leave', (sessionId: string) => {
      socket.leave(`session:${sessionId}`)
    })

    // Join instance room
    socket.on('instance:join', (connectionId: string) => {
      socket.join(`instance:${connectionId}`)
    })

    socket.on('instance:leave', (connectionId: string) => {
      socket.leave(`instance:${connectionId}`)
    })

    // Typing indicators (client → server → broadcast)
    socket.on('typing:start', (data: { sessionId: string }) => {
      socket.to(`session:${data.sessionId}`).emit('typing:start', {
        sessionId: data.sessionId,
        userId,
        isCustomer: false,
      })
    })

    socket.on('typing:stop', (data: { sessionId: string }) => {
      socket.to(`session:${data.sessionId}`).emit('typing:stop', {
        sessionId: data.sessionId,
        userId,
        isCustomer: false,
      })
    })

    // Presence heartbeat
    socket.on('presence:heartbeat', () => {
      socket.to(`org:${orgId}`).emit('presence:update', {
        userId,
        userName: '',
        status: 'online',
        organizationId: orgId,
      })
    })

    // Disconnect
    socket.on('disconnect', () => {
      socket.to(`org:${orgId}`).emit('presence:update', {
        userId,
        userName: '',
        status: 'offline',
        organizationId: orgId,
      })
      console.log(`[Socket.IO] User ${userId} disconnected`)
    })
  })

  console.log('[Socket.IO] Server initialized')
  return _io
}

/**
 * Get the Socket.IO server instance.
 * Returns null if not initialized (e.g., during build or in serverless).
 */
export function getIO(): SocketIOServer | null {
  return _io
}

/**
 * Check if Socket.IO is initialized
 */
export function isSocketIOReady(): boolean {
  return _io !== null
}
