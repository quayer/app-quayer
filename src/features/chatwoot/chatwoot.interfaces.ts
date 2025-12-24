/**
 * Chatwoot Integration - Type Definitions & Schemas
 * 
 * @description Defines all types, interfaces, and Zod schemas for Chatwoot integration.
 * Supports bidirectional sync between WhatsApp (via Quayer) and Chatwoot.
 * 
 * @version 1.0.0
 */

import { z } from 'zod';

// ============================================
// Constants
// ============================================

/**
 * @constant BOT_SIGNATURE
 * @description Invisible Unicode marker to detect bot echo messages.
 * Combination: Zero Width Space + Zero Width Non-Joiner + Zero Width Joiner
 * Messages starting with this signature are ignored to prevent loops.
 */
export const BOT_SIGNATURE = '\u200B\u200C\u200D';

/**
 * @constant CHATWOOT_API_VERSION
 * @description Current Chatwoot API version supported
 */
export const CHATWOOT_API_VERSION = 'v1';

// ============================================
// Configuration Schemas
// ============================================

/**
 * @schema ChatwootConfigSchema
 * @description Zod schema for validating Chatwoot configuration.
 */
export const ChatwootConfigSchema = z.object({
  /** Enable/disable Chatwoot integration */
  enabled: z.boolean().default(false),
  
  /** Chatwoot instance URL (without trailing slash) */
  url: z.string().url('URL inválida').transform(url => url.replace(/\/$/, '')),
  
  /** Chatwoot API access token (from Profile Settings > Access Token) */
  accessToken: z.string().min(1, 'Token de acesso é obrigatório'),
  
  /** Chatwoot account ID (visible in account URL) */
  accountId: z.number().int().positive('Account ID deve ser um número positivo'),
  
  /** Chatwoot inbox ID (from inbox settings) */
  inboxId: z.number().int().positive('Inbox ID deve ser um número positivo'),
  
  /** Ignore group messages from WhatsApp */
  ignoreGroups: z.boolean().default(false),
  
  /** Sign outgoing messages with agent name */
  signMessages: z.boolean().default(true),
  
  /** Always create new conversation instead of reusing */
  createNewConversation: z.boolean().default(false),
  
  /** Show typing indicator before sending messages */
  typingIndicator: z.boolean().default(true),
  
  /** Delay in ms between typing and sending message */
  typingDelayMs: z.number().int().min(0).max(10000).default(1500),
});

export type ChatwootConfig = z.infer<typeof ChatwootConfigSchema>;

/**
 * @schema UpdateChatwootConfigSchema
 * @description Schema for updating Chatwoot configuration (all fields optional except enabled).
 */
export const UpdateChatwootConfigSchema = z.object({
  enabled: z.boolean(),
  url: z.string().url('URL inválida').transform(url => url.replace(/\/$/, '')).optional(),
  accessToken: z.string().min(1).optional(),
  accountId: z.number().int().positive().optional(),
  inboxId: z.number().int().positive().optional(),
  ignoreGroups: z.boolean().optional(),
  signMessages: z.boolean().optional(),
  createNewConversation: z.boolean().optional(),
  typingIndicator: z.boolean().optional(),
  typingDelayMs: z.number().int().min(0).max(10000).optional(),
});

export type UpdateChatwootConfigInput = z.infer<typeof UpdateChatwootConfigSchema>;

// ============================================
// Chatwoot API Types
// ============================================

/**
 * @interface ChatwootContact
 * @description Represents a contact in Chatwoot
 */
export interface ChatwootContact {
  id: number;
  name: string;
  email?: string | null;
  phone_number?: string | null;
  identifier?: string | null;
  thumbnail?: string | null;
  additional_attributes?: Record<string, any>;
  custom_attributes?: Record<string, any>;
  contact_inboxes?: ChatwootContactInbox[];
}

/**
 * @interface ChatwootContactInbox
 * @description Represents the relationship between a contact and an inbox
 */
export interface ChatwootContactInbox {
  source_id: string;
  inbox: {
    id: number;
    name: string;
  };
  pubsub_token?: string;
}

/**
 * @interface ChatwootConversation
 * @description Represents a conversation in Chatwoot
 */
export interface ChatwootConversation {
  id: number;
  inbox_id: number;
  status: 'open' | 'resolved' | 'pending' | 'snoozed';
  contact?: ChatwootContact;
  meta?: {
    sender?: ChatwootContact;
    channel?: string;
  };
  messages?: ChatwootMessage[];
  contact_inbox?: {
    source_id: string;
    pubsub_token?: string;
  };
  additional_attributes?: Record<string, any>;
  custom_attributes?: Record<string, any>;
}

/**
 * @interface ChatwootMessage
 * @description Represents a message in Chatwoot
 */
export interface ChatwootMessage {
  id: number;
  content?: string | null;
  content_type?: 'text' | 'input_select' | 'cards' | 'form' | 'article' | 'incoming_email';
  content_attributes?: Record<string, any>;
  message_type: 0 | 1 | 2 | 3; // 0=incoming, 1=outgoing, 2=activity, 3=template
  private?: boolean;
  source_id?: string | null;
  sender?: {
    id: number;
    type: 'user' | 'agent_bot' | 'contact';
    name?: string;
    avatar_url?: string;
  };
  attachments?: ChatwootAttachment[];
  created_at: string;
  conversation_id?: number;
}

/**
 * @interface ChatwootAttachment
 * @description Represents an attachment in Chatwoot
 */
export interface ChatwootAttachment {
  id?: number;
  message_id?: number;
  file_type: 'image' | 'audio' | 'video' | 'file' | 'location' | 'contact' | 'fallback';
  account_id?: number;
  extension?: string | null;
  data_url: string;
  thumb_url?: string | null;
  file_size?: number;
}

/**
 * @interface ChatwootUser
 * @description Represents an agent/user in Chatwoot
 */
export interface ChatwootUser {
  id: number;
  name: string;
  email: string;
  type: 'user' | 'agent_bot';
  avatar_url?: string;
}

/**
 * @interface ChatwootAccount
 * @description Represents a Chatwoot account
 */
export interface ChatwootAccount {
  id: number;
  name: string;
  locale?: string;
  domain?: string;
}

/**
 * @interface ChatwootInbox
 * @description Represents a Chatwoot inbox
 */
export interface ChatwootInbox {
  id: number;
  name: string;
  channel_id?: number;
  channel_type?: string;
  greeting_enabled?: boolean;
  greeting_message?: string;
  working_hours_enabled?: boolean;
  out_of_office_message?: string;
  timezone?: string;
  callback_webhook_url?: string;
  allow_messages_after_resolved?: boolean;
  widget_color?: string;
}

// ============================================
// Webhook Payload Types
// ============================================

/**
 * @interface ChatwootWebhookPayload
 * @description Raw webhook payload from Chatwoot
 */
export interface ChatwootWebhookPayload {
  event: ChatwootWebhookEvent;
  id?: number;
  content?: string | null;
  content_type?: string;
  content_attributes?: Record<string, any>;
  message_type?: 0 | 1 | 2 | 3;
  private?: boolean;
  source_id?: string | null;
  created_at?: string;
  account?: ChatwootAccount;
  inbox?: ChatwootInbox;
  conversation?: ChatwootConversation;
  sender?: ChatwootUser;
  attachments?: ChatwootAttachment[];
  // For conversation events
  changed_attributes?: Array<{
    [key: string]: {
      current_value: any;
      previous_value: any;
    };
  }>;
  // For contact events
  contact?: ChatwootContact;
}

/**
 * @type ChatwootWebhookEvent
 * @description Possible webhook events from Chatwoot
 */
export type ChatwootWebhookEvent =
  | 'message_created'
  | 'message_updated'
  | 'conversation_created'
  | 'conversation_updated'
  | 'conversation_status_changed'
  | 'conversation_opened'
  | 'conversation_resolved'
  | 'contact_created'
  | 'contact_updated'
  | 'webwidget_triggered';

// ============================================
// Normalized Event Types
// ============================================

/**
 * @type MessageDirection
 * @description Direction of the message
 */
export type MessageDirection = 'IN' | 'OUT';

/**
 * @type MessageAuthor
 * @description Author type of the message
 */
export type MessageAuthor = 'CUSTOMER' | 'HUMAN' | 'AI' | 'SYSTEM';

/**
 * @interface NormalizedChatwootContact
 * @description Normalized contact data from Chatwoot
 */
export interface NormalizedChatwootContact {
  id?: number;
  phoneNumber: string;
  name: string;
  identifier?: string;
  thumbnailUrl?: string;
}

/**
 * @interface NormalizedChatwootMessage
 * @description Normalized message data from Chatwoot
 */
export interface NormalizedChatwootMessage {
  content: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contact';
  attachments?: ChatwootAttachment[];
  sourceId?: string;
}

/**
 * @interface NormalizedChatwootEvent
 * @description Normalized webhook event from Chatwoot
 */
export interface NormalizedChatwootEvent {
  /** Whether this event should be ignored (e.g., bot echo) */
  ignore?: boolean;
  /** Reason for ignoring */
  ignoreReason?: string;
  
  /** Event type */
  event: ChatwootWebhookEvent;
  
  /** Message direction */
  direction: MessageDirection;
  
  /** Author type */
  author: MessageAuthor;
  
  /** Contact information */
  contact: NormalizedChatwootContact;
  
  /** Message data */
  message: NormalizedChatwootMessage;
  
  /** Agent who sent (if outgoing) */
  agent?: {
    id: number;
    name: string;
    type: 'user' | 'agent_bot';
  };
  
  /** Chatwoot-specific IDs */
  chatwoot: {
    accountId?: number;
    inboxId?: number;
    conversationId?: number;
    messageId?: number;
    contactId?: number;
  };
  
  /** Raw payload for debugging */
  raw?: ChatwootWebhookPayload;
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * @interface CreateChatwootContactInput
 * @description Input for creating a contact in Chatwoot
 */
export interface CreateChatwootContactInput {
  name: string;
  phone_number?: string;
  email?: string;
  identifier?: string;
  avatar_url?: string;
  custom_attributes?: Record<string, any>;
}

/**
 * @interface CreateChatwootConversationInput
 * @description Input for creating a conversation in Chatwoot
 */
export interface CreateChatwootConversationInput {
  source_id: string;
  inbox_id: number;
  contact_id: number;
  additional_attributes?: Record<string, any>;
  custom_attributes?: Record<string, any>;
  status?: 'open' | 'resolved' | 'pending';
}

/**
 * @interface SendChatwootMessageInput
 * @description Input for sending a message in Chatwoot
 */
export interface SendChatwootMessageInput {
  content: string;
  message_type?: 'incoming' | 'outgoing';
  private?: boolean;
  content_type?: 'input_select' | 'cards' | 'form' | 'article';
  content_attributes?: Record<string, any>;
}

/**
 * @interface ChatwootConfigResponse
 * @description Response structure for GET /chatwoot/config
 */
export interface ChatwootConfigResponse {
  chatwoot_enabled: boolean;
  chatwoot_url?: string;
  chatwoot_account_id?: number;
  chatwoot_inbox_id?: number;
  chatwoot_access_token?: string; // Masked in response
  chatwoot_ignore_groups: boolean;
  chatwoot_sign_messages: boolean;
  chatwoot_create_new_conversation: boolean;
  chatwoot_typing_indicator: boolean;
  chatwoot_typing_delay_ms: number;
  chatwoot_inbox_webhook_url?: string;
}

/**
 * @interface ChatwootUpdateResponse
 * @description Response structure for PUT /chatwoot/config
 */
export interface ChatwootUpdateResponse {
  message: string;
  chatwoot_inbox_webhook_url: string;
  config: ChatwootConfigResponse;
}

// ============================================
// Internal Types
// ============================================

/**
 * @interface ChatwootIntegrationState
 * @description Internal state for a Chatwoot integration
 */
export interface ChatwootIntegrationState {
  connectionId: string;
  organizationId: string;
  config: ChatwootConfig;
  lastSyncAt?: Date;
  lastErrorAt?: Date;
  lastError?: string;
  stats?: {
    messagesSent: number;
    messagesReceived: number;
    contactsSynced: number;
    errorsCount: number;
  };
}

/**
 * @interface ChatwootSyncResult
 * @description Result of a sync operation
 */
export interface ChatwootSyncResult {
  success: boolean;
  action: 'contact_created' | 'contact_updated' | 'conversation_created' | 'message_sent' | 'message_received';
  chatwootId?: number;
  error?: string;
}

// ============================================
// Sync Service Types (moved here to avoid circular deps)
// ============================================

/**
 * @interface SyncMessageInput
 * @description Input for syncing a WhatsApp message to Chatwoot
 */
export interface SyncMessageInput {
  instanceId: string;
  organizationId: string;
  phoneNumber: string;
  contactName?: string;
  messageContent: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contact';
  mediaUrl?: string;
  mediaMimeType?: string;
  isFromGroup?: boolean;
}

/**
 * @interface SyncResult
 * @description Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  synced: boolean;
  reason?: string;
  chatwootMessageId?: number;
  chatwootConversationId?: number;
  error?: string;
}
