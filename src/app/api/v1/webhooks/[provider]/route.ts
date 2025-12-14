/**
 * Unified Webhook Endpoint
 *
 * POST /api/v1/webhooks/uazapi
 * POST /api/v1/webhooks/evolution
 * POST /api/v1/webhooks/baileys
 * POST /api/v1/webhooks/cloudapi
 * GET  /api/v1/webhooks/cloudapi (Meta verification challenge)
 *
 * Recebe webhooks de qualquer provider, normaliza e processa
 */

import { NextRequest, NextResponse } from 'next/server';
import { ConnectionStatus } from '@prisma/client';
import { orchestrator } from '@/lib/providers';
import { sessionsManager } from '@/lib/sessions/sessions.manager';
import { messageConcatenator } from '@/lib/concatenation';
import { transcriptionQueue } from '@/lib/transcription';
import { database } from '@/services/database';
import { redis } from '@/services/redis';
import { chatwootSyncService } from '@/features/chatwoot';
import type { BrokerType, NormalizedWebhook } from '@/lib/providers/core/provider.types';

/**
 * GET /api/v1/webhooks/cloudapi
 * Handles Meta webhook verification challenge
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerParam } = await params;
  
  // Only Cloud API uses GET for verification
  if (providerParam !== 'cloudapi') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('[Webhook] Cloud API verification request:', { mode, token, challenge });

  // Verify token should be configured in environment
  const verifyToken = process.env.CLOUDAPI_WEBHOOK_VERIFY_TOKEN || 'quayer-cloudapi-verify';

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    console.log('[Webhook] Cloud API verification successful');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[Webhook] Cloud API verification failed');
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

/**
 * POST /api/v1/webhooks/:provider
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerParam } = await params;
  const provider = providerParam as BrokerType; // 'uazapi' | 'evolution' | 'baileys' | 'cloudapi'
  const rawBody = await request.json();

  console.log(`[Webhook] Received from ${provider}:`, JSON.stringify(rawBody, null, 2));

  try {
    // 1. NORMALIZAR WEBHOOK
    const normalized = await orchestrator.normalizeWebhook(provider, rawBody);
    
    // 2. CLOUD API: Map phoneNumberId to real instanceId
    if (provider === 'cloudapi' && normalized.instanceId) {
      const instance = await database.instance.findFirst({
        where: { cloudApiPhoneNumberId: normalized.instanceId },
        select: { id: true },
      });
      
      if (instance) {
        console.log(`[Webhook] CloudAPI: Mapped phoneNumberId ${normalized.instanceId} to instanceId ${instance.id}`);
        normalized.instanceId = instance.id;
      } else {
        console.warn(`[Webhook] CloudAPI: No instance found for phoneNumberId ${normalized.instanceId}`);
        // Return success to avoid Meta retrying, but don't process
        return NextResponse.json({ success: true, message: 'Instance not found' });
      }
    }

    console.log(`[Webhook] Normalized event: ${normalized.event}`);

    // 3. PROCESSAR POR TIPO DE EVENTO
    switch (normalized.event) {
      case 'message.received':
        await processIncomingMessage(normalized, provider);
        break;

      case 'message.sent':
        await processOutgoingMessage(normalized);
        break;

      case 'message.updated':
        await updateMessageStatus(normalized);
        break;

      case 'instance.connected':
        await updateInstanceStatus(normalized.instanceId, 'connected');
        break;

      case 'instance.disconnected':
        await updateInstanceStatus(normalized.instanceId, 'disconnected');
        break;

      case 'instance.qr':
        await updateInstanceQRCode(normalized.instanceId, normalized.data.qrCode!);
        break;

      case 'chat.created':
        console.log('[Webhook] Chat created event received');
        break;

      case 'contact.updated':
        console.log('[Webhook] Contact updated event received');
        break;

      default:
        console.log(`[Webhook] Unhandled event: ${normalized.event}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Processar mensagem recebida (INBOUND)
 */
async function processIncomingMessage(webhook: NormalizedWebhook, provider: BrokerType): Promise<void> {
  const { instanceId, data } = webhook;
  const { from, message } = data;

  if (!from || !message) {
    console.log('[Webhook] Missing from or message data');
    return;
  }

  console.log(`[Webhook] Processing incoming message from ${from} (provider: ${provider})`);

  // 1. Buscar ou criar contato
  let contact = await database.contact.findUnique({
    where: { phoneNumber: from },
  });

  const isNewContact = !contact;

  if (!contact) {
    console.log(`[Webhook] Creating new contact: ${from}`);
    contact = await database.contact.create({
      data: {
        phoneNumber: from,
        name: from, // Será atualizado quando soubermos o nome
      },
    });
  }

  // 1.5. Buscar foto de perfil do contato (se novo ou não tem foto)
  // Cloud API não tem método de profile picture fácil, pular para cloudapi
  if ((isNewContact || !contact.profilePicUrl) && provider !== 'cloudapi') {
    console.log(`[Webhook] Fetching profile picture for ${from}`);
    try {
      const profilePicUrl = await orchestrator.getProfilePicture(instanceId, provider, from);
      if (profilePicUrl) {
        contact = await database.contact.update({
          where: { id: contact.id },
          data: { profilePicUrl },
        });
        console.log(`[Webhook] Profile picture updated for ${from}: ${profilePicUrl}`);
      }
    } catch (error) {
      console.error(`[Webhook] Failed to fetch profile picture for ${from}:`, error);
      // Continuar mesmo se falhar - a foto não é crítica
    }
  }

  // 2. Buscar instância para obter organizationId
  const instance = await database.instance.findUnique({
    where: { id: instanceId },
    select: { organizationId: true },
  });

  if (!instance || !instance.organizationId) {
    console.error(`[Webhook] Instance ${instanceId} not found or missing organizationId`);
    return;
  }

  // 3. Buscar ou criar sessão
  const session = await sessionsManager.getOrCreateSession({
    contactId: contact.id,
    connectionId: instanceId,
    organizationId: instance.organizationId,
  });

  console.log(`[Webhook] Session: ${session.id} (status: ${session.status})`);

  // ⭐ BYPASS: Ignorar webhooks de sessões FECHADAS
  if (session.status === 'CLOSED') {
    console.log(`[Webhook] Session ${session.id} is CLOSED - ignoring webhook`);
    return;
  }

  // 4. CONCATENAÇÃO DE MENSAGENS DE TEXTO
  if (message.type === 'text') {
    console.log('[Webhook] Text message - adding to concatenation queue');

    await messageConcatenator.addMessage(session.id, contact.id, {
      connectionId: instanceId, // Map instanceId to connectionId
      waMessageId: message.id,
      type: message.type,
      content: message.content,
      direction: 'INBOUND',
    });

    // ⚠️ NÃO processar imediatamente, aguardar concatenação
    return;
  }

  // 5. MÍDIA - SALVAR E ENFILEIRAR TRANSCRIÇÃO
  if (message.media) {
    console.log(`[Webhook] Media message (${message.media.type}) - saving and queuing transcription`);

    // Salvar mensagem de mídia
    const savedMessage = await database.message.create({
      data: {
        sessionId: session.id,
        contactId: contact.id,
        connectionId: instanceId,
        waMessageId: message.id,
        direction: 'INBOUND',
        type: message.type,
        content: message.content || '',
        mediaUrl: message.media.mediaUrl,
        mediaType: message.media.type,
        mimeType: message.media.mimeType,
        fileName: message.media.fileName,
        mediaDuration: message.media.duration,
        mediaSize: message.media.size,
        transcriptionStatus: 'pending',
        status: 'delivered',
      },
    });

    console.log(`[Webhook] Media message saved: ${savedMessage.id}`);

    // Enfileirar transcrição
    await transcriptionQueue.add('transcribe-media', {
      messageId: savedMessage.id,
      instanceId,
      mediaType: message.media.type as any,
      mediaUrl: message.media.mediaUrl,
      mimeType: message.media.mimeType,
    });

    console.log(`[Webhook] Transcription queued for message ${savedMessage.id}`);

    // ⭐ CHATWOOT SYNC: Sincronizar mensagem de mídia com Chatwoot
    try {
      await chatwootSyncService.syncIncomingMessage({
        instanceId,
        organizationId: instance.organizationId,
        phoneNumber: from,
        contactName: contact.name || from,
        messageContent: message.content || `[${message.media.type}]`,
        messageType: message.media.type as any,
        mediaUrl: message.media.mediaUrl,
        mediaMimeType: message.media.mimeType,
        isFromGroup: from.includes('@g.us'),
      });
    } catch (chatwootError) {
      console.error('[Webhook] Chatwoot sync failed (non-blocking):', chatwootError);
    }
  }

  // 6. Atualizar lastMessageAt da sessão
  await database.chatSession.update({
    where: { id: session.id },
    data: { lastMessageAt: new Date() },
  });
}

/**
 * Processar mensagem enviada (OUTBOUND)
 */
async function processOutgoingMessage(webhook: NormalizedWebhook): Promise<void> {
  const { data } = webhook;
  const { message } = data;

  if (!message?.id) {
    console.log('[Webhook] Missing message ID in outgoing message');
    return;
  }

  console.log(`[Webhook] Processing outgoing message: ${message.id}`);

  // Atualizar status no banco se existir
  const existingMessage = await database.message.findUnique({
    where: { waMessageId: message.id },
  });

  if (existingMessage) {
    await database.message.update({
      where: { id: existingMessage.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
      },
    });

    console.log(`[Webhook] Message ${existingMessage.id} marked as sent`);

    // TODO: Se foi enviada por humano, bloquear IA
    // Verificar se existingMessage.direction === 'OUTBOUND' e foi manual
  } else {
    console.log(`[Webhook] Message ${message.id} not found in database (may be external)`);
  }
}

/**
 * Atualizar status de mensagem
 */
async function updateMessageStatus(webhook: NormalizedWebhook): Promise<void> {
  const { data } = webhook;
  const { message } = data;

  if (!message?.id) return;

  console.log(`[Webhook] Updating message status: ${message.id}`);

  const existingMessage = await database.message.findUnique({
    where: { waMessageId: message.id },
  });

  if (!existingMessage) {
    console.log(`[Webhook] Message ${message.id} not found`);
    return;
  }

  // Mapear status do webhook para status do banco
  // UAZapi envia: pending, sent, delivered, read
  const statusMap: Record<string, any> = {
    pending: 'pending',
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
  };

  const newStatus = data.status ? statusMap[data.status] || 'sent' : 'sent';

  const updateData: any = { status: newStatus };

  if (newStatus === 'delivered') {
    updateData.deliveredAt = new Date();
  } else if (newStatus === 'read') {
    updateData.readAt = new Date();
  }

  await database.message.update({
    where: { id: existingMessage.id },
    data: updateData,
  });

  console.log(`[Webhook] Message ${existingMessage.id} status updated to ${newStatus}`);
}

/**
 * Atualizar status da instância
 */
async function updateInstanceStatus(instanceId: string, status: string): Promise<void> {
  console.log(`[Webhook] Updating instance ${instanceId} status to ${status}`);

  // Map webhook status strings to ConnectionStatus enum
  const statusMap: Record<string, ConnectionStatus> = {
    connected: ConnectionStatus.CONNECTED,
    disconnected: ConnectionStatus.DISCONNECTED,
    connecting: ConnectionStatus.CONNECTING,
    error: ConnectionStatus.ERROR,
  };

  const mappedStatus = statusMap[status.toLowerCase()] || ConnectionStatus.DISCONNECTED;

  await database.instance.update({
    where: { id: instanceId },
    data: { status: mappedStatus },
  });

  // Publicar evento no Redis (para frontend via WebSocket)
  await redis.publish('instance:status', JSON.stringify({
    instanceId,
    status: mappedStatus,
    timestamp: new Date(),
  }));

  console.log(`[Webhook] Instance ${instanceId} status updated to ${mappedStatus}`);
}

/**
 * Atualizar QR Code da instância
 */
async function updateInstanceQRCode(instanceId: string, qrCode: string): Promise<void> {
  console.log(`[Webhook] Updating QR Code for instance ${instanceId}`);

  await database.instance.update({
    where: { id: instanceId },
    data: { qrCode },
  });

  // Publicar no Redis para frontend receber (WebSocket/SSE)
  await redis.publish('instance:qr', JSON.stringify({
    instanceId,
    qrCode,
    timestamp: new Date(),
  }));

  console.log(`[Webhook] QR Code updated for instance ${instanceId}`);
}
