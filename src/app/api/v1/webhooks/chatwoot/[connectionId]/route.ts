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
// Import directly from source files to avoid circular dependency
import {
  normalizeChatwootWebhook,
  shouldSendToWhatsApp,
} from '@/features/chatwoot/services/chatwoot.normalizer';
import type { ChatwootWebhookPayload } from '@/features/chatwoot/chatwoot.interfaces';
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

    // Business Rule: Ignore bot echo and non-message events
    if (normalized.ignore) {
      console.log(`[Chatwoot Webhook] Ignoring: ${normalized.ignoreReason}`);
      return NextResponse.json({ 
        success: true, 
        ignored: true, 
        reason: normalized.ignoreReason 
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
    // STEP 7: Send message to WhatsApp
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
    } catch (error: any) {
      console.error('[Chatwoot Webhook] Failed to send to WhatsApp:', error);
      return NextResponse.json({
        success: false,
        error: `Failed to send message: ${error.message}`,
      }, { status: 500 });
    }

    // =========================================================================
    // STEP 8: Stop typing indicator
    // =========================================================================
    if (config.typingIndicator) {
      try {
        await orchestrator.sendPresence(connectionId, brokerType, phoneNumber, 'paused');
      } catch (error) {
        // Ignore errors on stopping typing
      }
    }

    // =========================================================================
    // STEP 9: Return success
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
