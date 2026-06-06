/**
 * Webhook Event Processor
 *
 * Shared processor for webhook events that can be used by multiple routes.
 * This allows the per-instance webhook route to share logic with the main route.
 */

import type {
  BrokerType,
  MessageDeliveryStatus,
  NormalizedWebhook,
} from '@/lib/providers/core/provider.types';
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
  const { logger } = await import('@/server/services/logger');

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

    case 'message.updated': {
      const messageId = normalized.data.message?.id;
      const messageStatus = normalized.data.messageStatus;
      logger.info(`${logPrefix} Message status update`, {
        instanceId: normalized.instanceId,
        messageId,
        status: messageStatus,
      });
      if (messageId && messageStatus) {
        await markMessageDeliveryStatus(messageId, messageStatus, normalized.timestamp);
      }
      break;
    }

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
  const { database } = await import('@/server/services/database');

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
  const { database } = await import('@/server/services/database');

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
  const { database } = await import('@/server/services/database');
  const { getCachedConnection, sanitizeContent } = await import('@/lib/webhook');
  const { isBotEcho: hasBotSignature, stripBotSignature } = await import('@/lib/providers/core/provider.types');
  const { isBotEchoAny } = await import('@/server/communication/services/bot-echo-guard.service');

  const { instanceId, data } = webhook;
  const { from, message, contactName } = data;

  if (!from || !message) {
    console.log('[Webhook] Missing from or message data');
    return;
  }

  // Get instance
  const instance = await getCachedConnection(instanceId);
  if (!instance?.organizationId) {
    console.error(`[Webhook] Instance ${instanceId} not found`);
    return;
  }

  // Bot echo detection. Redis message-id matching is the primary mechanism;
  // the legacy invisible signature is kept only as a backwards-compatible read.
  if (await isBotEchoAny(instance.organizationId, [message.id])) {
    console.log('[Webhook] Bot echo detected by Redis - ignoring');
    return;
  }

  if (message.content && hasBotSignature(message.content)) {
    console.log('[Webhook] Bot echo detected - ignoring');
    return;
  }

  const session = await getOrCreateSession(instanceId, instance.organizationId, from);

  // Save message - MessageType enum uses lowercase (text, image, video, etc.)
  const cleanContent = message.content ? sanitizeContent(stripBotSignature(message.content)) : '';
  const messageType = (message.type?.toLowerCase() || 'text') as 'text' | 'image' | 'video' | 'audio' | 'voice' | 'document' | 'location' | 'contact' | 'sticker' | 'poll';

  await database.message.upsert({
    where: { waMessageId: message.id },
    update: {},
    create: {
      waMessageId: message.id,
      content: cleanContent,
      direction: 'INBOUND',
      type: messageType,
      status: 'delivered',
      author: 'CUSTOMER',
      sessionId: session.id,
      contactPhone: from,
      connectionId: instanceId,
      mediaUrl: message.media?.mediaUrl || undefined,
      mediaType: message.media?.type || undefined,
      mimeType: message.media?.mimeType || undefined,
      fileName: message.media?.fileName || undefined,
      mediaSize: message.media?.size || undefined,
      mediaDuration: message.media?.duration || undefined,
      latitude: message.latitude || undefined,
      longitude: message.longitude || undefined,
      locationName: message.locationName || undefined,
    },
  });

  await database.chatSession.update({
    where: { id: session.id },
    data: {
      totalMessages: { increment: 1 },
      lastMessageAt: new Date(),
      lastCustomerMessageAt: new Date(),
      whatsappWindowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  console.log(`[Webhook] Message saved for session ${session.id}`);

  if (_provider === 'cloudapi') {
    await dispatchCloudApiAgentResponse({
      connection: instance,
      contactPhone: from,
      messageContent: cleanContent,
      session,
      inboundMessageId: message.id,
    });
  }
}

/**
 * Simplified outgoing message processor
 */
async function processOutgoingMessageSimple(webhook: NormalizedWebhook): Promise<void> {
  const { database } = await import('@/server/services/database');

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

/**
 * Advance an outbound Message to its provider-reported delivery status.
 *
 * Monotonic by design: each status may only advance FROM an earlier state, so a
 * late `delivered` arriving after `read` (providers don't guarantee order) is a
 * no-op instead of a downgrade. Fail-open: a DB error is swallowed so a status
 * blip never breaks webhook ingestion. Only OUTBOUND rows carry these
 * waMessageIds, so inbound messages are never touched.
 */
async function markMessageDeliveryStatus(
  messageId: string,
  status: MessageDeliveryStatus,
  at: Date
): Promise<void> {
  // States a given status is allowed to advance FROM (empty = never applied directly).
  const allowedFrom: Record<MessageDeliveryStatus, MessageDeliveryStatus[]> = {
    pending: [],
    sent: ['pending'],
    delivered: ['pending', 'sent'],
    read: ['pending', 'sent', 'delivered'],
    failed: ['pending', 'sent'],
  };
  const from = allowedFrom[status];
  if (!from.length) return;

  const data: {
    status: MessageDeliveryStatus;
    sentAt?: Date;
    deliveredAt?: Date;
    readAt?: Date;
  } = { status };
  if (status === 'sent') data.sentAt = at;
  else if (status === 'delivered') data.deliveredAt = at;
  else if (status === 'read') data.readAt = at;

  try {
    const { database } = await import('@/server/services/database');
    await database.message.updateMany({
      where: { waMessageId: messageId, status: { in: from } },
      data,
    });
  } catch (err) {
    const { logger } = await import('@/server/services/logger');
    logger.debug?.(`[Webhook] delivery-status update failed for ${messageId}`, {
      err: String(err),
    });
  }
}

async function getOrCreateSession(
  connectionId: string,
  organizationId: string,
  contactPhone: string
) {
  const { database } = await import('@/server/services/database');

  const existing = await database.chatSession.findFirst({
    where: {
      connectionId,
      organizationId,
      contactPhone,
      status: { in: ['QUEUED', 'ACTIVE', 'PAUSED'] },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (existing) {
    return existing;
  }

  return database.chatSession.create({
    data: {
      connectionId,
      organizationId,
      contactPhone,
      status: 'ACTIVE',
      startedBy: 'CUSTOMER',
      lastCustomerMessageAt: new Date(),
      whatsappWindowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

type CachedConnectionWithAgentDeployments = {
  id: string;
  organizationId: string;
  agentDeployments?: Array<{
    agentConfigId?: string | null;
    status?: string | null;
  }> | null;
};

type ChatSessionForAgentDispatch = {
  id: string;
  aiEnabled?: boolean | null;
  aiBlockedUntil?: Date | string | null;
  aiAgentConfigId?: string | null;
};

async function resolveAgentConfigId(
  connection: CachedConnectionWithAgentDeployments,
  session: ChatSessionForAgentDispatch
): Promise<string | null> {
  const loadedDeployment = connection.agentDeployments?.find(
    (deployment) => deployment.status === 'ACTIVE' && deployment.agentConfigId
  );

  if (loadedDeployment?.agentConfigId) {
    return loadedDeployment.agentConfigId;
  }

  const { database } = await import('@/server/services/database');
  const activeDeployment = await (database as any).agentDeployment?.findFirst?.({
    where: {
      connectionId: connection.id,
      status: 'ACTIVE',
    },
    orderBy: { updatedAt: 'desc' },
    select: { agentConfigId: true },
  });

  if (activeDeployment?.agentConfigId) {
    return activeDeployment.agentConfigId;
  }

  return session.aiAgentConfigId ?? null;
}

function canDispatchAgent(session: ChatSessionForAgentDispatch): boolean {
  if (session.aiEnabled === false) {
    return false;
  }

  if (!session.aiBlockedUntil) {
    return true;
  }

  return new Date(session.aiBlockedUntil).getTime() <= Date.now();
}

async function dispatchCloudApiAgentResponse(params: {
  connection: CachedConnectionWithAgentDeployments;
  session: ChatSessionForAgentDispatch;
  contactPhone: string;
  messageContent: string;
  inboundMessageId?: string;
}): Promise<void> {
  const { connection, contactPhone, messageContent, session, inboundMessageId } = params;

  if (!messageContent.trim() || !canDispatchAgent(session)) {
    return;
  }

  try {
    const agentConfigId = await resolveAgentConfigId(connection, session);
    if (!agentConfigId) {
      return;
    }

    const { loadAgentRuntimeSettingsForAgent } = await import('@/server/communication/services/agent-runtime-settings.service');
    const { detectMessageLanguage, prependLanguageContext } = await import('@/server/communication/services/language-detection.service');
    const runtimeSettings = await loadAgentRuntimeSettingsForAgent(agentConfigId, connection.organizationId);
    const detectedLanguage = runtimeSettings.languageDetectionEnabled
      ? detectMessageLanguage(messageContent)?.code ?? null
      : null;
    const finalMessageContent = runtimeSettings.languageDetectionEnabled
      ? prependLanguageContext(messageContent, detectedLanguage)
      : messageContent;

    const { processAgentMessage } = await import('@/server/ai-module/ai-agents/agent-runtime.service');
    const result = await processAgentMessage({
      agentConfigId,
      sessionId: session.id,
      contactId: contactPhone,
      connectionId: connection.id,
      organizationId: connection.organizationId,
      messageContent: finalMessageContent,
      // Idempotência durável de turno: id da msg inbound da CloudAPI.
      inboundMessageId,
    });

    const aiText = result.text?.trim();
    if (!aiText) {
      return;
    }

    await sendCloudApiAgentText({
      agentConfigId,
      connection,
      contactPhone,
      sessionId: session.id,
      text: aiText,
      runtime: result,
    });
  } catch (error) {
    console.error('[Webhook] CloudAPI agent dispatch failed (non-fatal):', error);
  }
}

async function sendCloudApiAgentText(params: {
  agentConfigId: string;
  connection: CachedConnectionWithAgentDeployments;
  contactPhone: string;
  sessionId: string;
  text: string;
  runtime: {
    model?: string;
    provider?: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
    };
    cost?: {
      inputCost?: number;
      outputCost?: number;
      totalCost?: number;
    };
    latencyMs?: number;
  };
}): Promise<void> {
  const { agentConfigId, connection, contactPhone, runtime, sessionId, text } = params;

  try {
    const { database } = await import('@/server/services/database');
    const { orchestrator } = await import('@/lib/providers');
    const { markBotMessage } = await import('@/server/communication/services/bot-echo-guard.service');

    const sendResult = await orchestrator.sendText(connection.id, 'cloudapi', {
      to: contactPhone,
      text,
    });

    const externalMessageId = sendResult.messageId || `cloudapi-local:${sessionId}:${Date.now()}`;
    const outboundStatus = sendResult.status || 'sent';
    const sentAt = sendResult.timestamp || new Date();

    await database.message.upsert({
      where: { waMessageId: externalMessageId },
      update: {
        status: outboundStatus,
      },
      create: {
        waMessageId: externalMessageId,
        content: text,
        direction: 'OUTBOUND',
        type: 'text',
        status: outboundStatus,
        author: 'AI',
        sessionId,
        contactPhone,
        connectionId: connection.id,
        aiAgentId: agentConfigId,
        aiModel: runtime.model,
        aiProvider: runtime.provider,
        inputTokens: runtime.usage?.inputTokens,
        outputTokens: runtime.usage?.outputTokens,
        inputCost: runtime.cost?.inputCost,
        outputCost: runtime.cost?.outputCost,
        totalCost: runtime.cost?.totalCost,
        aiLatency: runtime.latencyMs,
        sentAt,
      },
    });

    await database.chatSession.update({
      where: { id: sessionId },
      data: {
        totalMessages: { increment: 1 },
        totalAiMessages: { increment: 1 },
        lastMessageAt: new Date(),
      },
    });

    if (sendResult.messageId) {
      await markBotMessage(connection.organizationId, sendResult.messageId);
    }

    console.log(`[Webhook] CloudAPI agent response sent for session ${sessionId}`);
  } catch (error) {
    console.error('[Webhook] CloudAPI outbound failed (non-fatal):', error);
  }
}
