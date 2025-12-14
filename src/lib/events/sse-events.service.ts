/**
 * SSE Events Service
 *
 * Serviço para emitir eventos SSE em tempo real usando Redis Pub/Sub.
 * Suporta distribuição de eventos entre múltiplas instâncias do servidor.
 */

import { redis } from '@/services/redis';
import { Redis } from 'ioredis';

// Event Types
export type ContactLabelsChangedEvent = {
  contactId: string;
  action: 'replaced' | 'added' | 'removed';
  labelIds?: string[];
  labelId?: string;
  organizationId?: string;
};

export type SessionLabelsChangedEvent = {
  sessionId: string;
  action: 'replaced' | 'added' | 'removed';
  labelIds?: string[];
  labelId?: string;
  organizationId: string;
};

export type ContactUpdatedEvent = {
  contactId: string;
  field: string;
  oldValue: any;
  newValue: any;
  organizationId?: string;
};

export type SessionUpdatedEvent = {
  sessionId: string;
  field: string;
  oldValue: any;
  newValue: any;
  organizationId: string;
};

export type MessageReceivedEvent = {
  sessionId: string;
  messageId: string;
  content: string;
  author: 'CUSTOMER' | 'AGENT' | 'BOT' | 'SYSTEM';
  organizationId: string;
};

export type MessageSentEvent = {
  sessionId: string;
  messageId: string;
  content: string;
  organizationId: string;
};

export type InstanceStatusChangedEvent = {
  connectionId: string;
  status: string;
  organizationId: string;
};

export type SSEEventPayload = {
  event: string;
  data: any;
  timestamp: number;
};

// Channel prefixes
const CHANNELS = {
  ORG_EVENTS: 'org:events:',
  GLOBAL_EVENTS: 'global:events',
  INSTANCE_STATUS: 'instance:status:',
  SESSION_EVENTS: 'session:events:',
} as const;

/**
 * SSE Events Service with Redis Pub/Sub
 */
class SSEEventsService {
  private debug = process.env.NODE_ENV === 'development';
  private subscribers = new Map<string, Redis>();

  private log(event: string, data: any) {
    if (this.debug) {
      console.log(`[SSE Pub/Sub] ${event}`);
    }
  }

  /**
   * Publish event to Redis channel
   */
  private async publish(channel: string, event: string, data: any): Promise<void> {
    try {
      const payload: SSEEventPayload = {
        event,
        data,
        timestamp: Date.now(),
      };
      await redis.publish(channel, JSON.stringify(payload));
      this.log(event, data);
    } catch (error) {
      console.error(`[SSE Pub/Sub] Publish error:`, error);
    }
  }

  /**
   * Get channel for organization events
   */
  getOrgChannel(organizationId: string): string {
    return `${CHANNELS.ORG_EVENTS}${organizationId}`;
  }

  /**
   * Subscribe to organization events
   */
  async subscribeToOrg(
    organizationId: string,
    callback: (payload: SSEEventPayload) => void
  ): Promise<() => void> {
    const channel = this.getOrgChannel(organizationId);
    return this.subscribe(channel, callback);
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(
    channel: string,
    callback: (payload: SSEEventPayload) => void
  ): Promise<() => void> {
    // Create a dedicated subscriber for this channel
    const subscriber = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    });

    subscriber.subscribe(channel);
    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        try {
          const payload = JSON.parse(message) as SSEEventPayload;
          callback(payload);
        } catch (error) {
          console.error(`[SSE Pub/Sub] Parse error:`, error);
        }
      }
    });

    this.subscribers.set(channel, subscriber);

    // Return unsubscribe function
    return () => {
      subscriber.unsubscribe(channel);
      subscriber.disconnect();
      this.subscribers.delete(channel);
    };
  }

  // ============ Event Emitters ============

  /**
   * Emit contact labels changed event
   */
  emitContactLabelsChanged(data: ContactLabelsChangedEvent) {
    if (data.organizationId) {
      this.publish(
        this.getOrgChannel(data.organizationId),
        'contact.labels.changed',
        data
      );
    }
  }

  /**
   * Emit session labels changed event
   */
  emitSessionLabelsChanged(data: SessionLabelsChangedEvent) {
    this.publish(
      this.getOrgChannel(data.organizationId),
      'session.labels.changed',
      data
    );
  }

  /**
   * Emit contact updated event
   */
  emitContactUpdated(data: ContactUpdatedEvent) {
    if (data.organizationId) {
      this.publish(
        this.getOrgChannel(data.organizationId),
        'contact.updated',
        data
      );
    }
  }

  /**
   * Emit session updated event
   */
  emitSessionUpdated(data: SessionUpdatedEvent) {
    this.publish(
      this.getOrgChannel(data.organizationId),
      'session.updated',
      data
    );
  }

  /**
   * Emit message received event
   */
  emitMessageReceived(data: MessageReceivedEvent) {
    // Publish to org channel
    this.publish(
      this.getOrgChannel(data.organizationId),
      'message.received',
      data
    );
    // Also publish to session-specific channel
    this.publish(
      `${CHANNELS.SESSION_EVENTS}${data.sessionId}`,
      'message.received',
      data
    );
  }

  /**
   * Emit message sent event
   */
  emitMessageSent(data: MessageSentEvent) {
    this.publish(
      this.getOrgChannel(data.organizationId),
      'message.sent',
      data
    );
    this.publish(
      `${CHANNELS.SESSION_EVENTS}${data.sessionId}`,
      'message.sent',
      data
    );
  }

  /**
   * Emit instance status changed event
   */
  emitInstanceStatusChanged(data: InstanceStatusChangedEvent) {
    this.publish(
      this.getOrgChannel(data.organizationId),
      'instance.status.changed',
      data
    );
    this.publish(
      `${CHANNELS.INSTANCE_STATUS}${data.connectionId}`,
      'status.changed',
      data
    );
  }

  /**
   * Emit generic event to organization
   */
  emit(event: string, data: any & { organizationId?: string }) {
    if (data.organizationId) {
      this.publish(this.getOrgChannel(data.organizationId), event, data);
    } else {
      this.publish(CHANNELS.GLOBAL_EVENTS, event, data);
    }
  }

  /**
   * Emit event to specific channel
   */
  emitToChannel(channel: string, event: string, data: any) {
    this.publish(channel, event, data);
  }

  /**
   * Cleanup all subscribers
   */
  async cleanup() {
    for (const [channel, subscriber] of this.subscribers) {
      await subscriber.unsubscribe(channel);
      subscriber.disconnect();
    }
    this.subscribers.clear();
  }
}

export const sseEvents = new SSEEventsService();
