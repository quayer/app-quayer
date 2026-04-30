/**
 * Webhooks Feature - Type Definitions
 */

import type { Webhook, WebhookDelivery } from '@prisma/client';

// ============================================
// Database Types with Relations
// ============================================

export type WebhookWithRelations = Webhook & {
  deliveries?: WebhookDelivery[];
  _count?: {
    deliveries: number;
  };
};

export type WebhookDeliveryWithWebhook = WebhookDelivery & {
  webhook?: Webhook;
};

// ============================================
// API Request/Response Types
// ============================================

export interface CreateWebhookInput {
  url: string;
  events: string[];
  description?: string;
  secret?: string;
  organizationId: string;
}

export interface UpdateWebhookInput {
  url?: string;
  events?: string[];
  description?: string;
  secret?: string;
  isActive?: boolean;
}

export interface ListWebhooksQuery {
  page?: number;
  limit?: number;
  organizationId?: string;
  isActive?: boolean;
}

export interface ListDeliveriesQuery {
  page?: number;
  limit?: number;
  webhookId?: string;
  status?: 'success' | 'failure' | 'pending';
}

export interface WebhookPayload {
  event: string;
  data: any;
  timestamp: string;
  webhookId: string;
}

// ============================================
// Webhook Events
// ============================================

export const WEBHOOK_EVENTS = {
  // Instance events
  INSTANCE_CREATED: 'instance.created',
  INSTANCE_UPDATED: 'instance.updated',
  INSTANCE_DELETED: 'instance.deleted',
  INSTANCE_CONNECTED: 'instance.connected',
  INSTANCE_DISCONNECTED: 'instance.disconnected',

  // Message events
  MESSAGE_RECEIVED: 'message.received',
  MESSAGE_SENT: 'message.sent',

  // Organization events
  ORGANIZATION_UPDATED: 'organization.updated',

  // User events
  USER_INVITED: 'user.invited',
  USER_JOINED: 'user.joined',
  USER_REMOVED: 'user.removed',
} as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[keyof typeof WEBHOOK_EVENTS];

// ============================================
// API Response Types
// ============================================

export interface WebhookResponse {
  id: string;
  url: string;
  events: string[];
  description: string | null;
  secret: string | null;
  organizationId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  stats?: {
    deliveriesCount: number;
    successRate?: number;
  };
}

export interface WebhookDeliveryResponse {
  id: string;
  webhookId: string;
  event: string;
  payload: any;
  response: any;
  status: string;
  attempts: number;
  createdAt: Date;
  completedAt: Date | null;
}

export interface PaginatedWebhooksResponse {
  data: WebhookResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginatedDeliveriesResponse {
  data: WebhookDeliveryResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
