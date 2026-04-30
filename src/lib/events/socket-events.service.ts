/**
 * Socket Events Service
 *
 * Drop-in replacement for SSE Events Service.
 * Emits events via Socket.IO when available, falls back to Redis Pub/Sub (SSE) otherwise.
 *
 * This allows gradual migration: both SSE and Socket.IO work simultaneously
 * until all clients are migrated.
 */

import { getIO } from '@/server/services/socket'
import { sseEvents } from './sse-events.service'
import type {
  ContactLabelsChangedEvent,
  SessionLabelsChangedEvent,
  ContactUpdatedEvent,
  SessionUpdatedEvent,
  MessageReceivedEvent,
  MessageSentEvent,
  InstanceStatusChangedEvent,
} from './sse-events.service'

class SocketEventsService {
  /**
   * Emit to Socket.IO room + SSE (dual emit for backwards compatibility)
   */
  private emitToRoom(room: string, event: string, data: any) {
    // Socket.IO (new clients)
    const io = getIO()
    if (io) {
      io.to(room).emit(event, data)
    }

    // SSE fallback is handled by calling sseEvents directly from the original callers
    // No need to duplicate here — callers should migrate from sseEvents to socketEvents
  }

  // ============ Event Emitters ============

  emitContactLabelsChanged(data: ContactLabelsChangedEvent) {
    if (data.organizationId) {
      this.emitToRoom(`org:${data.organizationId}`, 'contact:labels:changed', data)
    }
    // SSE fallback
    sseEvents.emitContactLabelsChanged(data)
  }

  emitSessionLabelsChanged(data: SessionLabelsChangedEvent) {
    this.emitToRoom(`org:${data.organizationId}`, 'session:labels:changed', data)
    sseEvents.emitSessionLabelsChanged(data)
  }

  emitContactUpdated(data: ContactUpdatedEvent) {
    if (data.organizationId) {
      this.emitToRoom(`org:${data.organizationId}`, 'contact:updated', data)
    }
    sseEvents.emitContactUpdated(data)
  }

  emitSessionUpdated(data: SessionUpdatedEvent) {
    this.emitToRoom(`org:${data.organizationId}`, 'session:updated', data)
    this.emitToRoom(`session:${data.sessionId}`, 'session:updated', data)
    sseEvents.emitSessionUpdated(data)
  }

  emitMessageReceived(data: MessageReceivedEvent) {
    this.emitToRoom(`org:${data.organizationId}`, 'message:received', data)
    this.emitToRoom(`session:${data.sessionId}`, 'message:received', data)
    sseEvents.emitMessageReceived(data)
  }

  emitMessageSent(data: MessageSentEvent) {
    this.emitToRoom(`org:${data.organizationId}`, 'message:sent', data)
    this.emitToRoom(`session:${data.sessionId}`, 'message:sent', data)
    sseEvents.emitMessageSent(data)
  }

  emitInstanceStatusChanged(data: InstanceStatusChangedEvent) {
    this.emitToRoom(`org:${data.organizationId}`, 'instance:status:changed', data)
    this.emitToRoom(`instance:${data.connectionId}`, 'instance:status:changed', data)
    sseEvents.emitInstanceStatusChanged(data)
  }

  // ============ New Socket.IO-only events ============

  emitMessageStatus(data: { messageId: string; status: string; sessionId: string }) {
    this.emitToRoom(`session:${data.sessionId}`, 'message:status', data)
  }

  emitTypingStart(data: { sessionId: string; userId?: string; userName?: string; isCustomer?: boolean }) {
    this.emitToRoom(`session:${data.sessionId}`, 'typing:start', data)
  }

  emitTypingStop(data: { sessionId: string; userId?: string; isCustomer?: boolean }) {
    this.emitToRoom(`session:${data.sessionId}`, 'typing:stop', data)
  }

  emitPresenceUpdate(data: { userId: string; userName: string; status: string; organizationId: string }) {
    this.emitToRoom(`org:${data.organizationId}`, 'presence:update', data)
  }

  /**
   * Generic emit to organization
   */
  emit(event: string, data: any & { organizationId?: string }) {
    if (data.organizationId) {
      this.emitToRoom(`org:${data.organizationId}`, event, data)
    }
    sseEvents.emit(event, data)
  }
}

export const socketEvents = new SocketEventsService()
