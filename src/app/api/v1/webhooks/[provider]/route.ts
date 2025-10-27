/**
 * Unified Webhook Endpoint
 *
 * POST /api/v1/webhooks/uazapi
 * POST /api/v1/webhooks/evolution
 * POST /api/v1/webhooks/baileys
 *
 * Recebe webhooks de qualquer provider, normaliza e processa
 */

import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/lib/providers';
import { sessionsManager } from '@/lib/sessions/sessions.manager';
import { messageConcatenator } from '@/lib/concatenation';
import { transcriptionQueue } from '@/lib/transcription';
import { database } from '@/services/database';
import { redis } from '@/services/redis';
import type { BrokerType, NormalizedWebhook } from '@/lib/providers/core/provider.types';

/**
 * POST /api/v1/webhooks/:provider
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider as BrokerType; // 'uazapi' | 'evolution' | 'baileys'
  const rawBody = await request.json();

  console.log(`[Webhook] Received from ${provider}:`, JSON.stringify(rawBody, null, 2));

  try {
    // 1. NORMALIZAR WEBHOOK
    const normalized = await orchestrator.normalizeWebhook(provider, rawBody);

    console.log(`[Webhook] Normalized event: ${normalized.event}`);

    // 2. PROCESSAR POR TIPO DE EVENTO
    switch (normalized.event) {
      case 'message.received':
        await processIncomingMessage(normalized);
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
async function processIncomingMessage(webhook: NormalizedWebhook): Promise<void> {
  const { instanceId, data } = webhook;
  const { from, message } = data;

  if (!from || !message) {
    console.log('[Webhook] Missing from or message data');
    return;
  }

  console.log(`[Webhook] Processing incoming message from ${from}`);

  // 1. Buscar ou criar contato
  let contact = await database.contact.findUnique({
    where: { phoneNumber: from },
  });

  if (!contact) {
    console.log(`[Webhook] Creating new contact: ${from}`);
    contact = await database.contact.create({
      data: {
        phoneNumber: from,
        name: from, // Será atualizado quando soubermos o nome
      },
    });
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
    instanceId,
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
      instanceId,
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
        instanceId,
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

  await database.instance.update({
    where: { id: instanceId },
    data: { status },
  });

  // Publicar evento no Redis (para frontend via WebSocket)
  await redis.publish('instance:status', JSON.stringify({
    instanceId,
    status,
    timestamp: new Date(),
  }));

  console.log(`[Webhook] Instance ${instanceId} status updated`);
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
