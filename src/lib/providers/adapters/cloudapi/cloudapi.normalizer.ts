/**
 * @module CloudAPI Normalizer
 * @description Normalizes Cloud API webhook payloads to internal format
 */

import type { NormalizedWebhook, WebhookEvent, MediaMessage } from '../../core/provider.types';
import type {
  CloudAPIWebhookPayload,
  CloudAPIIncomingMessage,
  CloudAPIMessageStatus,
  CloudAPIWebhookValue,
} from './cloudapi.types';

/**
 * Normalize Cloud API webhook payload to internal format
 */
export function normalizeCloudAPIWebhook(payload: CloudAPIWebhookPayload): NormalizedWebhook {
  // Validate payload structure
  if (!payload?.entry?.length) {
    return createEmptyWebhook('unknown');
  }

  const entry = payload.entry[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  if (!value) {
    return createEmptyWebhook(entry?.id || 'unknown');
  }

  const phoneNumberId = value.metadata?.phone_number_id || '';

  // Handle message status updates (sent, delivered, read)
  if (value.statuses?.length) {
    return normalizeStatusUpdate(value.statuses[0], phoneNumberId, payload);
  }

  // Handle incoming messages
  if (value.messages?.length) {
    return normalizeIncomingMessage(value.messages[0], value, phoneNumberId, payload);
  }

  // Handle errors
  if (value.errors?.length) {
    console.error('[CloudAPI] Webhook error:', value.errors);
    return createEmptyWebhook(phoneNumberId);
  }

  return createEmptyWebhook(phoneNumberId);
}

/**
 * Normalize message status update
 */
function normalizeStatusUpdate(
  status: CloudAPIMessageStatus,
  phoneNumberId: string,
  rawPayload: any
): NormalizedWebhook {
  const timestamp = new Date(parseInt(status.timestamp) * 1000);

  return {
    event: 'message.updated',
    instanceId: phoneNumberId,
    timestamp,
    data: {
      message: {
        id: status.id,
        type: 'text',
        content: '',
        timestamp,
      },
      status: mapMessageStatus(status.status),
    },
    rawPayload,
  };
}

/**
 * Normalize incoming message
 */
function normalizeIncomingMessage(
  message: CloudAPIIncomingMessage,
  value: CloudAPIWebhookValue,
  phoneNumberId: string,
  rawPayload: any
): NormalizedWebhook {
  const contact = value.contacts?.[0];
  const timestamp = new Date(parseInt(message.timestamp) * 1000);

  // Extract message content based on type
  const { content, media } = extractMessageContent(message);

  return {
    event: 'message.received',
    instanceId: phoneNumberId,
    timestamp,
    data: {
      from: message.from,
      chatId: message.from, // In Cloud API, chatId is the sender's number
      message: {
        id: message.id,
        type: mapMessageType(message.type),
        content,
        media,
        timestamp,
      },
      // Additional context
      ...(contact && {
        contact: {
          name: contact.profile?.name || '',
          phone: contact.wa_id,
        },
      }),
      // Quoted message context
      ...(message.context && {
        quotedMessage: {
          id: message.context.id,
          from: message.context.from,
        },
      }),
    },
    rawPayload,
  };
}

/**
 * Extract content and media from message based on type
 */
function extractMessageContent(message: CloudAPIIncomingMessage): { content: string; media?: MediaMessage } {
  switch (message.type) {
    case 'text':
      return {
        content: message.text?.body || '',
      };

    case 'image':
      return {
        content: message.image?.caption || '',
        media: {
          id: message.image?.id || '',
          type: 'image',
          mediaUrl: '', // Will be filled after downloading
          mimeType: message.image?.mime_type,
          caption: message.image?.caption,
        },
      };

    case 'video':
      return {
        content: message.video?.caption || '',
        media: {
          id: message.video?.id || '',
          type: 'video',
          mediaUrl: '',
          mimeType: message.video?.mime_type,
          caption: message.video?.caption,
        },
      };

    case 'audio':
      return {
        content: '',
        media: {
          id: message.audio?.id || '',
          type: 'audio',
          mediaUrl: '',
          mimeType: message.audio?.mime_type,
        },
      };

    case 'document':
      return {
        content: message.document?.caption || '',
        media: {
          id: message.document?.id || '',
          type: 'document',
          mediaUrl: '',
          mimeType: message.document?.mime_type,
          fileName: message.document?.filename,
          caption: message.document?.caption,
        },
      };

    case 'sticker':
      return {
        content: '',
        media: {
          id: message.sticker?.id || '',
          type: 'image', // Treat sticker as image
          mediaUrl: '',
          mimeType: message.sticker?.mime_type,
        },
      };

    case 'location':
      return {
        content: JSON.stringify({
          latitude: message.location?.latitude,
          longitude: message.location?.longitude,
          name: message.location?.name,
          address: message.location?.address,
        }),
      };

    case 'contacts':
      const contact = message.contacts?.[0];
      return {
        content: JSON.stringify({
          name: contact?.name?.formatted_name || '',
          phone: contact?.phones?.[0]?.phone || '',
        }),
      };

    case 'button':
      return {
        content: message.button?.text || message.button?.payload || '',
      };

    case 'interactive':
      if (message.interactive?.button_reply) {
        return {
          content: message.interactive.button_reply.title,
        };
      }
      if (message.interactive?.list_reply) {
        return {
          content: message.interactive.list_reply.title,
        };
      }
      return { content: '' };

    default:
      return { content: '' };
  }
}

/**
 * Map Cloud API message type to internal type
 */
function mapMessageType(type: string): 'text' | 'image' | 'video' | 'audio' | 'voice' | 'document' | 'location' | 'contact' {
  const mapping: Record<string, any> = {
    text: 'text',
    image: 'image',
    video: 'video',
    audio: 'audio',
    voice: 'voice',
    document: 'document',
    sticker: 'image',
    location: 'location',
    contacts: 'contact',
    button: 'text',
    interactive: 'text',
  };
  return mapping[type] || 'text';
}

/**
 * Map Cloud API status to internal status
 */
function mapMessageStatus(status: string): any {
  const mapping: Record<string, string> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
  };
  return mapping[status] || 'pending';
}

/**
 * Create empty webhook for error/unknown cases
 */
function createEmptyWebhook(instanceId: string): NormalizedWebhook {
  return {
    event: 'message.received',
    instanceId,
    timestamp: new Date(),
    data: {},
  };
}

/**
 * Verify webhook signature (HMAC-SHA256)
 * Used to validate that the webhook came from Meta
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  if (!signature || !appSecret) {
    return false;
  }

  try {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex');

    const receivedSignature = signature.replace('sha256=', '');
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(receivedSignature)
    );
  } catch (error) {
    console.error('[CloudAPI] Signature verification error:', error);
    return false;
  }
}

/**
 * Handle webhook verification challenge (GET request)
 * Required by Meta when setting up webhooks
 */
export function handleVerificationChallenge(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined,
  verifyToken: string
): { valid: boolean; challenge?: string } {
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return { valid: true, challenge };
  }
  return { valid: false };
}
