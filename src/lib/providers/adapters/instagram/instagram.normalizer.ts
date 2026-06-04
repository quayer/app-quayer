/**
 * @module Instagram Normalizer
 * @description Normalizes Instagram Messaging webhook payloads to internal format
 * @see https://developers.facebook.com/docs/messenger-platform/instagram
 */

import type { NormalizedWebhook, MediaMessage } from '../../core/provider.types';
import type {
  InstagramWebhookPayload,
  InstagramMessagingEvent,
  InstagramIncomingMessage,
} from './instagram.types';

/**
 * Normalize an Instagram webhook payload to the internal format.
 */
export function normalizeInstagramWebhook(payload: InstagramWebhookPayload): NormalizedWebhook {
  if (!payload?.entry?.length) {
    return createEmptyWebhook('unknown');
  }

  const entry = payload.entry[0];
  const instanceId = entry?.id || 'unknown';
  const event = entry?.messaging?.[0];

  if (!event?.message) {
    return createEmptyWebhook(instanceId);
  }

  // Skip echoes of our own outbound messages (anti-loop).
  if (event.message.is_echo) {
    return createEmptyWebhook(instanceId);
  }

  return normalizeIncomingMessage(event, instanceId, payload);
}

/**
 * Normalize an incoming message event.
 */
function normalizeIncomingMessage(
  event: InstagramMessagingEvent,
  instanceId: string,
  rawPayload: any,
): NormalizedWebhook {
  const timestamp = new Date(event.timestamp);
  const message = event.message as InstagramIncomingMessage;
  const { content, media, type } = extractMessageContent(message);

  return {
    event: 'message.received',
    instanceId,
    timestamp,
    data: {
      from: event.sender?.id,
      to: event.recipient?.id,
      chatId: event.sender?.id,
      message: {
        id: message.mid,
        type,
        content,
        media,
        timestamp,
      },
    },
    rawPayload,
  };
}

/**
 * Extract content/media/type from an incoming message.
 */
function extractMessageContent(message: InstagramIncomingMessage): {
  content: string;
  media?: MediaMessage;
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
} {
  const attachment = message.attachments?.[0];

  if (attachment) {
    switch (attachment.type) {
      case 'image':
      case 'story_mention':
        return { content: '', type: 'image', media: buildMedia(attachment.payload.url, 'image') };
      case 'video':
        return { content: '', type: 'video', media: buildMedia(attachment.payload.url, 'video') };
      case 'audio':
        return { content: '', type: 'audio', media: buildMedia(attachment.payload.url, 'audio') };
      case 'file':
        return { content: '', type: 'document', media: buildMedia(attachment.payload.url, 'document') };
      default:
        return { content: message.text || '', type: 'text' };
    }
  }

  return { content: message.text || '', type: 'text' };
}

/**
 * Build a normalized media object from an attachment URL.
 */
function buildMedia(
  url: string | undefined,
  type: 'image' | 'video' | 'audio' | 'document',
): MediaMessage {
  return {
    id: '',
    type,
    mediaUrl: url || '',
  };
}

/**
 * Create an empty webhook for error/unknown cases.
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
 * Verify a webhook signature (HMAC-SHA256) using the App Secret.
 * Validates that the webhook came from Meta (header `X-Hub-Signature-256`).
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string,
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
      Buffer.from(receivedSignature),
    );
  } catch (error) {
    console.error('[Instagram] Signature verification error:', error);
    return false;
  }
}

/**
 * Handle the webhook verification challenge (GET request) required by Meta.
 */
export function handleVerificationChallenge(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined,
  verifyToken: string,
): { valid: boolean; challenge?: string } {
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return { valid: true, challenge };
  }
  return { valid: false };
}
