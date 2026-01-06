/**
 * Webhook Event Processor
 *
 * Shared processor for webhook events that can be used by multiple routes.
 * This allows the per-instance webhook route to share logic with the main route.
 */

import type { BrokerType, NormalizedWebhook } from '@/lib/providers/core/provider.types';
import type { TraceContext } from './tracing';

/**
 * Process a normalized webhook event
 *
 * This function delegates to the main webhook route's processing logic.
 * It's designed to be called by both:
 * - /api/v1/webhooks/[provider] (legacy route)
 * - /api/v1/webhooks/cloudapi/[instanceId] (new per-instance route)
 */
export async function processWebhookEvent(
  normalized: NormalizedWebhook,
  provider: BrokerType,
  traceCtx?: TraceContext
): Promise<void> {
  // Dynamically import to avoid circular dependencies
  const { logger } = await import('@/lib/logging/logger');

  const logPrefix = traceCtx ? `[Webhook:${traceCtx.traceId.slice(0, 8)}]` : '[Webhook]';

  switch (normalized.event) {
    case 'message.received':
      // For now, log and let the main route handle complex message processing
      // The per-instance route should call the main route's handler
      logger.info(`${logPrefix} Message received event`, {
        instanceId: normalized.instanceId,
        from: normalized.data.from,
        messageType: normalized.data.message?.type,
      });

      // Import and call the processIncomingMessage from the main route
      // This is a simplified version - the full implementation is in the route file
      await processIncomingMessageSimple(normalized, provider, traceCtx);
      break;

    case 'message.sent':
      logger.info(`${logPrefix} Message sent event`, {
        instanceId: normalized.instanceId,
        to: normalized.data.to,
      });
      await processOutgoingMessageSimple(normalized);
      break;

    case 'message.updated':
      logger.info(`${logPrefix} Message status update`, {
        instanceId: normalized.instanceId,
        messageId: normalized.data.message?.id,
      });
      break;

    case 'instance.connected':
      await updateInstanceStatus(normalized.instanceId, 'connected');
      break;

    case 'instance.disconnected':
      await updateInstanceStatus(normalized.instanceId, 'disconnected');
      break;

    case 'instance.qr':
      if (normalized.data.qrCode) {
        await updateInstanceQRCode(normalized.instanceId, normalized.data.qrCode);
      }
      break;

    default:
      logger.debug(`${logPrefix} Unhandled event: ${normalized.event}`);
  }
}

/**
 * Update instance connection status
 */
async function updateInstanceStatus(instanceId: string, status: 'connected' | 'disconnected'): Promise<void> {
  const { database } = await import('@/services/database');

  const dbStatus = status === 'connected' ? 'CONNECTED' : 'DISCONNECTED';

  await database.connection.update({
    where: { id: instanceId },
    data: {
      status: dbStatus,
      lastConnected: status === 'connected' ? new Date() : undefined,
    },
  });

  console.log(`[Webhook] Instance ${instanceId} status updated to ${dbStatus}`);
}

/**
 * Update instance QR code
 */
async function updateInstanceQRCode(instanceId: string, _qrCode: string): Promise<void> {
  const { database } = await import('@/services/database');

  await database.connection.update({
    where: { id: instanceId },
    data: {
      status: 'CONNECTING', // QR code means waiting for scan
      // QR code is typically stored temporarily or sent via websocket
    },
  });

  console.log(`[Webhook] Instance ${instanceId} QR code received`);
}

/**
 * Simplified incoming message processor
 * For full implementation, the main route's processIncomingMessage is used
 */
async function processIncomingMessageSimple(
  webhook: NormalizedWebhook,
  _provider: BrokerType,
  _traceCtx?: TraceContext
): Promise<void> {
  const { database } = await import('@/services/database');
  const { sessionsManager } = await import('@/lib/sessions/sessions.manager');
  const { getCachedContact, getCachedConnection, updateContactCache, sanitizeContactName, sanitizeContent } = await import('@/lib/webhook');
  const { isBotEcho, stripBotSignature } = await import('@/lib/providers/core/provider.types');

  const { instanceId, data } = webhook;
  const { from, message, contactName } = data;

  if (!from || !message) {
    console.log('[Webhook] Missing from or message data');
    return;
  }

  // Bot echo detection
  if (message.content && isBotEcho(message.content)) {
    console.log('[Webhook] Bot echo detected - ignoring');
    return;
  }

  // Get or create contact
  let contact = await getCachedContact(from);
  if (!contact) {
    const displayName = sanitizeContactName(contactName) || from;
    contact = await database.contact.create({
      data: { phoneNumber: from, name: displayName },
    });
    await updateContactCache(contact);
  }

  // Get instance
  const instance = await getCachedConnection(instanceId);
  if (!instance?.organizationId) {
    console.error(`[Webhook] Instance ${instanceId} not found`);
    return;
  }

  // Get or create session
  const session = await sessionsManager.getOrCreateSession({
    contactId: contact.id,
    connectionId: instanceId,
    organizationId: instance.organizationId,
  });

  // Save message - MessageType enum uses lowercase (text, image, video, etc.)
  const cleanContent = message.content ? sanitizeContent(stripBotSignature(message.content)) : '';
  const messageType = (message.type?.toLowerCase() || 'text') as 'text' | 'image' | 'video' | 'audio' | 'voice' | 'document' | 'location' | 'contact' | 'sticker' | 'poll';

  await database.message.create({
    data: {
      waMessageId: message.id,
      content: cleanContent,
      direction: 'INBOUND',
      type: messageType,
      status: 'delivered', // MessageStatus enum uses lowercase
      sessionId: session.id,
      contactId: contact.id,
      connectionId: instanceId,
      // createdAt is auto-generated by Prisma @default(now())
    },
  });

  console.log(`[Webhook] Message saved for session ${session.id}`);
}

/**
 * Simplified outgoing message processor
 */
async function processOutgoingMessageSimple(webhook: NormalizedWebhook): Promise<void> {
  const { database } = await import('@/services/database');

  const { data } = webhook;
  const messageId = data.message?.id;

  if (!messageId) return;

  // Update message status if exists (MessageStatus enum uses lowercase)
  await database.message.updateMany({
    where: { waMessageId: messageId },
    data: { status: 'sent' },
  });

  console.log(`[Webhook] Outgoing message ${messageId} marked as sent`);
}
