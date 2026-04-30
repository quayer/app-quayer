/**
 * @module Instagram Webhook Normalizer
 * @description Normalizes Instagram webhooks to NormalizedWebhook format
 */

import type { NormalizedWebhook, WebhookEvent } from '../../core/provider.types';
import type { InstagramWebhookPayload, InstagramWebhookMessaging } from './instagram.types';

export function normalizeInstagramWebhook(rawPayload: any): NormalizedWebhook {
  const payload = rawPayload as InstagramWebhookPayload;

  if (!payload.entry?.length || !payload.entry[0].messaging?.length) {
    return {
      event: 'message.received',
      instanceId: payload.entry?.[0]?.id || 'unknown',
      timestamp: new Date(),
      data: {},
      rawPayload,
    };
  }

  const entry = payload.entry[0];
  const messaging = entry.messaging[0];

  const event = resolveEvent(messaging);
  const instanceId = entry.id;

  return {
    event,
    instanceId,
    timestamp: new Date(messaging.timestamp * 1000),
    data: {
      chatId: messaging.sender.id,
      from: messaging.sender.id,
      to: messaging.recipient.id,
      message: messaging.message ? {
        id: messaging.message.mid,
        type: resolveMessageType(messaging),
        content: messaging.message.text || '',
        timestamp: new Date(messaging.timestamp * 1000),
      } : undefined,
    },
    rawPayload,
  };
}

function resolveEvent(messaging: InstagramWebhookMessaging): WebhookEvent {
  if (messaging.message?.is_echo) return 'message.sent';
  if (messaging.read) return 'message.updated';
  if (messaging.message || messaging.postback) return 'message.received';
  return 'message.received';
}

function resolveMessageType(messaging: InstagramWebhookMessaging): 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'contact' | 'location' {
  if (!messaging.message?.attachments?.length) return 'text';

  const attachment = messaging.message.attachments[0];
  switch (attachment.type) {
    case 'image': return 'image';
    case 'video': return 'video';
    case 'audio': return 'audio';
    case 'file': return 'document';
    case 'story_mention':
    case 'reel':
    case 'share':
      return 'image'; // Treat shares as image type
    default: return 'text';
  }
}
