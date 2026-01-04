/**
 * Chatwoot Webhook Handler
 * 
 * @description Receives webhooks from Chatwoot and processes them.
 * - Forwards agent messages to WhatsApp via the provider orchestrator
 * - Handles typing indicators
 * - Filters bot echo messages
 * 
 * POST /api/v1/webhooks/chatwoot/:connectionId
 * 
 * @version 1.0.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/services/database';
import { orchestrator } from '@/lib/providers';
import { sessionsManager } from '@/lib/sessions/sessions.manager';
// Import directly from source files to avoid circular dependency
import {
  normalizeChatwootWebhook,
  shouldSendToWhatsApp,
} from '@/features/chatwoot/services/chatwoot.normalizer';
import type { ChatwootWebhookPayload, NormalizedChatwootEvent } from '@/features/chatwoot/chatwoot.interfaces';
import { ChatwootRepository } from '@/features/chatwoot/repositories/chatwoot.repository';
import type { BrokerType } from '@/lib/providers/core/provider.types';

/**
 * Map database provider to BrokerType
 */
function mapProviderToBrokerType(provider: string): BrokerType {
  switch (provider) {
    case 'WHATSAPP_CLOUD_API':
      return 'cloudapi';
    case 'WHATSAPP_WEB':
    case 'WHATSAPP_BUSINESS_API':
    default:
      return 'uazapi';
  }
}

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * POST /api/v1/webhooks/chatwoot/:connectionId
 * Receives webhooks from Chatwoot
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;

  console.log(`[Chatwoot Webhook] Received for connection: ${connectionId}`);

  try {
    // =========================================================================
    // STEP 1: Parse and validate payload
    // =========================================================================
    const rawPayload = await request.json() as ChatwootWebhookPayload;
    
    console.log('[Chatwoot Webhook] Event:', rawPayload.event);
    console.log('[Chatwoot Webhook] Payload:', JSON.stringify(rawPayload, null, 2).substring(0, 1000));

    // =========================================================================
    // STEP 2: Normalize the webhook
    // =========================================================================
    const normalized = normalizeChatwootWebhook(rawPayload);

    // Business Rule: Ignore bot echo and other ignorable events
    if (normalized.ignore) {
      console.log(`[Chatwoot Webhook] Ignoring: ${normalized.ignoreReason}`);
      return NextResponse.json({
        success: true,
        ignored: true,
        reason: normalized.ignoreReason
      });
    }

    // =========================================================================
    // STEP 2b: Handle Conversation Status Events
    // =========================================================================
    if (normalized.chatwoot.conversationStatus) {
      console.log(`[Chatwoot Webhook] Conversation status change: ${normalized.chatwoot.conversationStatus}`);

      const result = await handleConversationStatusChange(
        connectionId,
        normalized
      );

      return NextResponse.json({
        success: true,
        action: 'status_synced',
        ...result,
      });
    }

    // =========================================================================
    // STEP 3: Validate connection and get config
    // =========================================================================
    const connection = await database.connection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        organizationId: true,
        provider: true,
        status: true,
      },
    });

    if (!connection) {
      console.error(`[Chatwoot Webhook] Connection not found: ${connectionId}`);
      return NextResponse.json({ 
        success: false, 
        error: 'Connection not found' 
      }, { status: 404 });
    }

    // Business Rule: Check if connection is active
    if (connection.status !== 'CONNECTED') {
      console.warn(`[Chatwoot Webhook] Connection not connected: ${connection.status}`);
      return NextResponse.json({ 
        success: true, 
        warning: 'Connection not connected' 
      });
    }

    // Get Chatwoot configuration
    const chatwootRepo = new ChatwootRepository(database);
    const config = await chatwootRepo.getConfig(connectionId, connection.organizationId!);

    if (!config || !config.enabled) {
      console.warn(`[Chatwoot Webhook] Chatwoot not enabled for connection ${connectionId}`);
      return NextResponse.json({ 
        success: true, 
        warning: 'Chatwoot integration not enabled' 
      });
    }

    // =========================================================================
    // STEP 4: Handle outgoing messages (Agent -> WhatsApp)
    // =========================================================================
    if (!shouldSendToWhatsApp(normalized)) {
      console.log('[Chatwoot Webhook] Message should not be sent to WhatsApp');
      return NextResponse.json({ success: true, action: 'no_action' });
    }

    const phoneNumber = normalized.contact.phoneNumber;
    const messageContent = normalized.message.content;
    const brokerType = mapProviderToBrokerType(connection.provider);

    console.log(`[Chatwoot Webhook] Sending to WhatsApp:`, {
      phoneNumber,
      contentPreview: messageContent.substring(0, 50),
      brokerType,
      agent: normalized.agent?.name,
    });

    // =========================================================================
    // STEP 5: Send typing indicator (if enabled)
    // =========================================================================
    if (config.typingIndicator) {
      try {
        await orchestrator.sendPresence(connectionId, brokerType, phoneNumber, 'composing');
        console.log('[Chatwoot Webhook] Typing indicator sent');
      } catch (error) {
        console.error('[Chatwoot Webhook] Failed to send typing:', error);
        // Continue anyway
      }

      // Delay before sending message
      if (config.typingDelayMs > 0) {
        await delay(config.typingDelayMs);
      }
    }

    // =========================================================================
    // STEP 6: Sign message with agent name (if enabled)
    // =========================================================================
    let finalContent = messageContent;
    if (config.signMessages && normalized.agent?.name) {
      finalContent = `*${normalized.agent.name}:* ${messageContent}`;
    }

    // =========================================================================
    // STEP 7: Save OUTBOUND message to database BEFORE sending
    // =========================================================================
    let savedMessageId: string | null = null;
    try {
      // Find or create contact and session for this phone number
      let contact = await database.contact.findFirst({
        where: { phoneNumber },
      });

      if (!contact) {
        contact = await database.contact.create({
          data: {
            phoneNumber,
            name: normalized.contact.name || phoneNumber,
          },
        });
        console.log(`[Chatwoot Webhook] Created contact: ${contact.id}`);
      }

      // Get or create session
      const session = await sessionsManager.getOrCreateSession({
        contactId: contact.id,
        connectionId,
        organizationId: connection.organizationId!,
      });

      // Save outbound message
      // Generate a unique waMessageId for Chatwoot-originated messages
      const waMessageId = `cw_${normalized.chatwoot.messageId || Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const savedMessage = await database.message.create({
        data: {
          sessionId: session.id,
          contactId: contact.id,
          connectionId,
          waMessageId,
          direction: 'OUTBOUND',
          type: normalized.message.type,
          content: finalContent,
          author: normalized.author === 'AI' ? 'AI' : 'AGENT',
          aiAgentName: normalized.agent?.name,
          status: 'pending',
          mediaUrl: normalized.message.attachments?.[0]?.data_url,
        },
      });

      savedMessageId = savedMessage.id;
      console.log(`[Chatwoot Webhook] Saved OUTBOUND message: ${savedMessageId}`);

      // Update session lastMessageAt
      await database.chatSession.update({
        where: { id: session.id },
        data: { lastMessageAt: new Date() },
      });
    } catch (dbError: any) {
      console.error('[Chatwoot Webhook] Failed to save message to database:', dbError);
      // Continue anyway - sending to WhatsApp is more important
    }

    // =========================================================================
    // STEP 8: Send message to WhatsApp
    // =========================================================================
    try {
      // Check message type
      if (normalized.message.type === 'text') {
        await orchestrator.sendText(connectionId, brokerType, {
          to: phoneNumber,
          text: finalContent,
        });
      } else if (normalized.message.attachments && normalized.message.attachments.length > 0) {
        // Handle media attachments
        const attachment = normalized.message.attachments[0];
        await orchestrator.sendMedia(connectionId, brokerType, {
          to: phoneNumber,
          mediaUrl: attachment.data_url,
          mediaType: normalized.message.type as any,
          caption: finalContent || undefined,
        });
      } else {
        // Default to text
        await orchestrator.sendText(connectionId, brokerType, {
          to: phoneNumber,
          text: finalContent,
        });
      }

      console.log('[Chatwoot Webhook] Message sent to WhatsApp successfully');

      // Update message status to sent
      if (savedMessageId) {
        await database.message.update({
          where: { id: savedMessageId },
          data: { status: 'sent', sentAt: new Date() },
        });
      }
    } catch (error: any) {
      console.error('[Chatwoot Webhook] Failed to send to WhatsApp:', error);

      // Update message status to failed
      if (savedMessageId) {
        await database.message.update({
          where: { id: savedMessageId },
          data: { status: 'failed' },
        });
      }

      return NextResponse.json({
        success: false,
        error: `Failed to send message: ${error.message}`,
      }, { status: 500 });
    }

    // =========================================================================
    // STEP 9: Stop typing indicator
    // =========================================================================
    if (config.typingIndicator) {
      try {
        await orchestrator.sendPresence(connectionId, brokerType, phoneNumber, 'paused');
      } catch (error) {
        // Ignore errors on stopping typing
      }
    }

    // =========================================================================
    // STEP 10: Return success
    // =========================================================================
    return NextResponse.json({
      success: true,
      action: 'message_sent',
      to: phoneNumber,
      agent: normalized.agent?.name,
    });

  } catch (error: any) {
    console.error('[Chatwoot Webhook] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * GET /api/v1/webhooks/chatwoot/:connectionId
 * Health check endpoint
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;

  // Verify connection exists
  const connection = await database.connection.findUnique({
    where: { id: connectionId },
    select: { id: true },
  });

  if (!connection) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'Connection not found' 
    }, { status: 404 });
  }

  return NextResponse.json({
    status: 'ok',
    connectionId,
    message: 'Chatwoot webhook endpoint is ready',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Handle conversation status changes from Chatwoot
 * Maps Chatwoot conversation status to Quayer session status
 */
async function handleConversationStatusChange(
  connectionId: string,
  normalized: NormalizedChatwootEvent
): Promise<{ sessionUpdated: boolean; newStatus?: string; reason?: string }> {
  const phoneNumber = normalized.contact.phoneNumber;
  const chatwootStatus = normalized.chatwoot.conversationStatus;

  if (!phoneNumber) {
    console.log('[Chatwoot Webhook] No phone number for status change');
    return { sessionUpdated: false, reason: 'no_phone_number' };
  }

  // Find contact by phone number
  const contact = await database.contact.findFirst({
    where: { phoneNumber },
  });

  if (!contact) {
    console.log(`[Chatwoot Webhook] Contact not found for ${phoneNumber}`);
    return { sessionUpdated: false, reason: 'contact_not_found' };
  }

  // Find active session for this contact and connection
  const session = await database.chatSession.findFirst({
    where: {
      contactId: contact.id,
      connectionId,
      status: { not: 'CLOSED' },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!session) {
    console.log(`[Chatwoot Webhook] No active session for contact ${contact.id}`);
    return { sessionUpdated: false, reason: 'no_active_session' };
  }

  // Map Chatwoot status to session action
  let newSessionStatus: 'ACTIVE' | 'PAUSED' | 'CLOSED' | null = null;

  switch (chatwootStatus) {
    case 'resolved':
      // Chatwoot conversation resolved = close session in Quayer
      newSessionStatus = 'CLOSED';
      break;
    case 'open':
      // Chatwoot conversation opened/reopened = activate session
      newSessionStatus = 'ACTIVE';
      break;
    case 'pending':
      // Chatwoot pending = keep as is or pause
      // Don't change status for pending
      break;
    case 'snoozed':
      // Chatwoot snoozed = pause session
      newSessionStatus = 'PAUSED';
      break;
  }

  if (!newSessionStatus) {
    console.log(`[Chatwoot Webhook] No status change needed for ${chatwootStatus}`);
    return { sessionUpdated: false, reason: 'no_status_change_needed' };
  }

  // Update session status
  if (newSessionStatus === 'CLOSED') {
    await sessionsManager.closeSession(session.id);
    console.log(`[Chatwoot Webhook] Session ${session.id} closed (Chatwoot resolved)`);
  } else if (newSessionStatus === 'PAUSED') {
    await sessionsManager.pauseSession(session.id, 24); // Pause for 24 hours
    console.log(`[Chatwoot Webhook] Session ${session.id} paused (Chatwoot snoozed)`);
  } else if (newSessionStatus === 'ACTIVE') {
    await sessionsManager.resumeSession(session.id);
    console.log(`[Chatwoot Webhook] Session ${session.id} resumed (Chatwoot opened)`);
  }

  return {
    sessionUpdated: true,
    newStatus: newSessionStatus,
  };
}
