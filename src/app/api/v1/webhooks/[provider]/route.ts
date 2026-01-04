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
 *
 * ⭐ MELHORIAS IMPLEMENTADAS (do workflow N8N):
 * 1. Bot Echo Detection - Previne loops infinitos
 * 2. WhatsApp 24h Window - Compliance com WhatsApp Business API
 * 3. Auto-Pause on Human Reply - Bloqueia IA quando humano responde
 * 4. Sistema de Comandos - @fechar, @pausar, @reabrir, etc.
 *
 * 🔐 SEGURANÇA (2025-12-21):
 * 5. Rate Limiting por IP - 1000 req/min
 * 6. IP Whitelist para UAZapi - IPs conhecidos
 * 7. Signature Verification - HMAC-SHA256 (quando disponível)
 */

import { NextRequest, NextResponse } from 'next/server';
import { ConnectionStatus, GroupMode } from '@prisma/client';
import { orchestrator } from '@/lib/providers';
import { sessionsManager } from '@/lib/sessions/sessions.manager';
import { messageConcatenator } from '@/lib/concatenation';
import { transcriptionQueue } from '@/lib/transcription';
import { database } from '@/services/database';
import { redis } from '@/services/redis';
import {
  type BrokerType,
  type NormalizedWebhook,
  isBotEcho,
  stripBotSignature,
} from '@/lib/providers/core/provider.types';
import { parseCommand, hasCommand, type ParsedCommand } from '@/lib/commands';
import { geocodingService } from '@/lib/geocoding';
import { webhookRateLimiter, getClientIdentifier } from '@/lib/rate-limit/rate-limiter';
import { logger } from '@/lib/logging/logger';
import crypto from 'crypto';

// Lazy import to avoid circular dependency during build
async function getChatwootSyncService() {
  const { getChatwootSyncService: getService } = await import('@/features/chatwoot');
  return getService();
}

// ============================================================================
// 🔐 SECURITY CONFIGURATION
// ============================================================================

/**
 * IP Whitelist for UAZapi
 * Configure via UAZAPI_ALLOWED_IPS environment variable (comma-separated)
 * If not configured, all IPs are allowed (development mode)
 *
 * Known UAZapi IPs (update as needed):
 * - 54.94.23.96 (São Paulo)
 * - 18.231.12.154 (São Paulo)
 * - 52.67.184.127 (São Paulo)
 */
const UAZAPI_ALLOWED_IPS = (process.env.UAZAPI_ALLOWED_IPS || '')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);

/**
 * Webhook signature secret (for HMAC verification)
 * Configure via WEBHOOK_SIGNATURE_SECRET environment variable
 */
const WEBHOOK_SIGNATURE_SECRET = process.env.WEBHOOK_SIGNATURE_SECRET || '';

/**
 * Security mode: 'strict' | 'permissive'
 * - strict: Block requests that fail security checks
 * - permissive: Log warnings but allow requests (development)
 */
const SECURITY_MODE = process.env.WEBHOOK_SECURITY_MODE || 'permissive';

/**
 * Get client IP from request
 */
function getClientIP(request: NextRequest): string {
  return getClientIdentifier(request);
}

/**
 * Check if IP is in whitelist
 */
function isIPWhitelisted(ip: string, provider: string): boolean {
  // Only apply whitelist for uazapi
  if (provider !== 'uazapi') return true;

  // If no whitelist configured, allow all (development mode)
  if (UAZAPI_ALLOWED_IPS.length === 0) return true;

  // Check if IP matches any whitelisted IP (supports wildcards like 54.94.*)
  return UAZAPI_ALLOWED_IPS.some((allowedIP) => {
    if (allowedIP.includes('*')) {
      const pattern = allowedIP.replace(/\*/g, '.*');
      return new RegExp(`^${pattern}$`).test(ip);
    }
    return ip === allowedIP;
  });
}

/**
 * Verify webhook signature (HMAC-SHA256)
 * UAZapi sends signature in X-Webhook-Signature header
 */
function verifySignature(
  rawBody: string,
  signature: string | null,
  provider: string
): boolean {
  // Skip verification if no secret configured
  if (!WEBHOOK_SIGNATURE_SECRET) return true;

  // Skip for providers that don't support signatures
  if (!['uazapi', 'cloudapi'].includes(provider)) return true;

  // Require signature if secret is configured
  if (!signature) {
    logger.warn('Missing signature header', { provider });
    return SECURITY_MODE !== 'strict';
  }

  try {
    // UAZapi uses format: sha256=<signature>
    const [algo, sig] = signature.split('=');
    if (algo !== 'sha256' || !sig) {
      logger.warn('Invalid signature format', { provider });
      return SECURITY_MODE !== 'strict';
    }

    const expectedSig = crypto
      .createHmac('sha256', WEBHOOK_SIGNATURE_SECRET)
      .update(rawBody)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(expectedSig)
    );

    if (!isValid) {
      logger.warn('Signature mismatch', { provider });
    }

    return isValid || SECURITY_MODE !== 'strict';
  } catch (error) {
    logger.error('Signature verification error', { provider, error: error instanceof Error ? error.message : error });
    return SECURITY_MODE !== 'strict';
  }
}

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
  const clientIP = getClientIP(request);

  // =========================================================================
  // 🔐 SECURITY CHECKS
  // =========================================================================

  // 1. RATE LIMITING
  const rateLimitResult = await webhookRateLimiter.check(clientIP);
  if (!rateLimitResult.success) {
    logger.warn('Rate limit exceeded', { clientIP, provider });
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter || 60),
          'X-RateLimit-Limit': String(rateLimitResult.limit),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.reset),
        },
      }
    );
  }

  // 2. IP WHITELIST CHECK
  if (!isIPWhitelisted(clientIP, provider)) {
    logger.warn('IP not whitelisted', { clientIP, provider });
    return NextResponse.json(
      { error: 'Forbidden', message: 'IP not allowed' },
      { status: 403 }
    );
  }

  // Clone request to read body as text for signature verification
  const rawBodyText = await request.text();
  let rawBody: any;

  try {
    rawBody = JSON.parse(rawBodyText);
  } catch (parseError) {
    logger.error('Failed to parse JSON body', { provider, error: parseError instanceof Error ? parseError.message : 'Unknown error' });
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // 3. SIGNATURE VERIFICATION
  const signature = request.headers.get('x-webhook-signature') ||
                   request.headers.get('x-hub-signature-256'); // Meta uses this
  if (!verifySignature(rawBodyText, signature, provider)) {
    logger.warn('Invalid signature', { clientIP, provider });
    return NextResponse.json(
      { error: 'Forbidden', message: 'Invalid signature' },
      { status: 403 }
    );
  }

  // =========================================================================

  // Log estruturado - evita logar payload inteiro em produção
  logger.info('Webhook received', {
    provider,
    clientIP,
    eventType: rawBody?.event || rawBody?.data?.event || 'unknown',
    instanceId: rawBody?.instanceId || rawBody?.instance?.instanceId || 'unknown',
    // Apenas em desenvolvimento logamos o payload completo
    ...(process.env.NODE_ENV === 'development' && { payload: rawBody }),
  });

  try {
    // 1. NORMALIZAR WEBHOOK
    const normalized = await orchestrator.normalizeWebhook(provider, rawBody);

    // 2. RESOLVER instanceId pelo token (UAZapi Global Webhook envia token, não instanceId)
    if (provider === 'uazapi' && normalized.instanceId) {
      // O instanceId pode ser um token UUID - buscar a conexão
      const instance = await database.connection.findFirst({
        where: {
          OR: [
            { id: normalized.instanceId },
            { uazapiToken: normalized.instanceId },
          ],
        },
        select: { id: true },
      });

      if (instance) {
        console.log(`[Webhook] UAZapi: Resolved token ${normalized.instanceId} to instanceId ${instance.id}`);
        normalized.instanceId = instance.id;
      } else {
        console.warn(`[Webhook] UAZapi: No instance found for token/id ${normalized.instanceId}`);
        // Return 404 so provider knows instance doesn't exist (not 200 which silently drops messages)
        return NextResponse.json(
          { success: false, error: 'Instance not found', instanceId: normalized.instanceId },
          { status: 404 }
        );
      }
    }

    // 3. CLOUD API: Map phoneNumberId to real instanceId
    if (provider === 'cloudapi' && normalized.instanceId) {
      const instance = await database.connection.findFirst({
        where: { cloudApiPhoneNumberId: normalized.instanceId },
        select: { id: true },
      });

      if (instance) {
        console.log(`[Webhook] CloudAPI: Mapped phoneNumberId ${normalized.instanceId} to instanceId ${instance.id}`);
        normalized.instanceId = instance.id;
      } else {
        console.warn(`[Webhook] CloudAPI: No instance found for phoneNumberId ${normalized.instanceId}`);
        // Return 404 so provider knows instance doesn't exist (not 200 which silently drops messages)
        return NextResponse.json(
          { success: false, error: 'Instance not found', phoneNumberId: normalized.instanceId },
          { status: 404 }
        );
      }
    }

    console.log(`[Webhook] Normalized event: ${normalized.event}, instanceId: ${normalized.instanceId}, from: ${normalized.data.from}`);

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
    logger.error('Webhook processing failed', {
      provider,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
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
  const { from, message, contactName } = data;

  if (!from || !message) {
    console.log('[Webhook] Missing from or message data');
    return;
  }

  // ⭐ BOT ECHO DETECTION - Prevenir loops infinitos
  // Se a mensagem contém nossa assinatura, é um echo do bot
  if (message.content && isBotEcho(message.content)) {
    console.log('[Webhook] 🔄 Bot echo detected - ignoring to prevent loop');
    return;
  }

  // ⭐ GROUP MESSAGE DETECTION - Processar mensagens de grupos separadamente
  const isGroupMessage = from.endsWith('@g.us');
  if (isGroupMessage) {
    console.log(`[Webhook] 👥 Group message detected from ${from}`);
    await processGroupMessage(webhook, provider);
    return;
  }

  console.log(`[Webhook] Processing incoming message from ${from} (provider: ${provider})`);

  // 1. Buscar ou criar contato
  let contact = await database.contact.findUnique({
    where: { phoneNumber: from },
  });

  const isNewContact = !contact;

  if (!contact) {
    // Usar contactName se disponível, senão usar o phoneNumber
    const displayName = contactName && contactName !== from ? contactName : from;
    console.log(`[Webhook] Creating new contact: ${from} (name: ${displayName})`);
    contact = await database.contact.create({
      data: {
        phoneNumber: from,
        name: displayName,
      },
    });
  } else if (contactName && contactName !== from && contact.name === from) {
    // Atualizar nome do contato se tivermos um nome melhor e o atual é apenas o número
    console.log(`[Webhook] Updating contact name from ${from} to ${contactName}`);
    contact = await database.contact.update({
      where: { id: contact.id },
      data: { name: contactName },
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
  const instance = await database.connection.findUnique({
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

  // ⭐ WHATSAPP 24H WINDOW - Atualizar janela quando cliente envia mensagem
  try {
    const windowInfo = await sessionsManager.updateWhatsAppWindow(session.id, true);
    console.log(`[Webhook] WhatsApp window updated - expires at: ${windowInfo.expiresAt}`);
  } catch (windowError) {
    console.error('[Webhook] Failed to update WhatsApp window (non-blocking):', windowError);
  }

  // ⭐ COMANDO DETECTION - Verificar se mensagem é um comando
  if (message.type === 'text' && hasCommand(message.content)) {
    const command = parseCommand(message.content);
    console.log(`[Webhook] 🎯 Command detected: ${command.type} (raw: ${command.raw})`);

    await executeCommand(command, session.id, contact.id, instanceId);

    // Se foi um comando, não processar como mensagem normal
    // (a menos que seja NONE, o que significa que não é um comando válido)
    if (command.type !== 'NONE') {
      return;
    }
  }

  // 4. CONCATENAÇÃO DE MENSAGENS DE TEXTO
  if (message.type === 'text') {
    console.log('[Webhook] Text message - adding to concatenation queue');

    // Limpar assinatura do bot se presente (caso tenha passado pelo check inicial)
    const cleanContent = message.content ? stripBotSignature(message.content) : '';

    await messageConcatenator.addMessage(session.id, contact.id, {
      connectionId: instanceId, // Map instanceId to connectionId
      waMessageId: message.id,
      type: message.type,
      content: cleanContent,
      direction: 'INBOUND',
    });

    // ⚠️ NÃO processar imediatamente, aguardar concatenação
    return;
  }

  // 5. LOCALIZAÇÃO - GEOCODING AUTOMÁTICO
  if (message.type === 'location' && message.latitude && message.longitude) {
    console.log(`[Webhook] 📍 Location message received: ${message.latitude}, ${message.longitude}`);

    // Resolver endereço via Google Maps API
    let geoData: any = {};
    try {
      const address = await geocodingService.reverseGeocode(
        message.latitude,
        message.longitude
      );

      if (address) {
        geoData = {
          geoAddress: address.formattedAddress,
          geoNeighborhood: address.neighborhood,
          geoCity: address.city,
          geoState: address.state,
          geoStateCode: address.stateCode,
          geoPostalCode: address.postalCode,
          geoCountry: address.country,
        };
        console.log(`[Webhook] 🗺️ Address resolved: ${address.formattedAddress}`);
      }
    } catch (geoError) {
      console.error('[Webhook] Geocoding failed (non-blocking):', geoError);
    }

    // Salvar mensagem de localização com dados geocodificados
    const savedLocation = await database.message.create({
      data: {
        sessionId: session.id,
        contactId: contact.id,
        connectionId: instanceId,
        waMessageId: message.id,
        direction: 'INBOUND',
        type: 'location',
        content: geoData.geoAddress || `📍 ${message.latitude}, ${message.longitude}`,
        latitude: message.latitude,
        longitude: message.longitude,
        locationName: message.locationName,
        ...geoData,
        status: 'delivered',
      },
    });

    console.log(`[Webhook] Location message saved: ${savedLocation.id}`);

    // Sync com Chatwoot
    try {
      const chatwootSync = await getChatwootSyncService();
      await chatwootSync.syncIncomingMessage({
        instanceId,
        organizationId: instance.organizationId,
        phoneNumber: from,
        contactName: contact.name || from,
        messageContent: geoData.geoAddress || `📍 Localização: ${message.latitude}, ${message.longitude}`,
        messageType: 'location',
        isFromGroup: from.includes('@g.us'),
      });
    } catch (chatwootError) {
      console.error('[Webhook] Chatwoot sync failed (non-blocking):', chatwootError);
    }

    // Atualizar lastMessageAt
    await database.chatSession.update({
      where: { id: session.id },
      data: { lastMessageAt: new Date() },
    });

    return;
  }

  // 6. MÍDIA - SALVAR E ENFILEIRAR TRANSCRIÇÃO
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
      const chatwootSync = await getChatwootSyncService();
      await chatwootSync.syncIncomingMessage({
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
    include: { session: true },
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

    // ⭐ AUTO-PAUSE ON HUMAN REPLY
    // Se mensagem OUTBOUND não foi enviada pelo bot, é um humano respondendo
    // Verifica se deve pausar a IA automaticamente
    // author é enum: CUSTOMER, AGENT, BOT, SYSTEM
    if (existingMessage.session) {
      const authorType = existingMessage.author; // MessageAuthor enum
      const agentName = existingMessage.aiAgentName || 'Unknown';

      // Se author é AGENT (não BOT), significa que um humano respondeu
      const shouldPause = authorType === 'AGENT';

      if (shouldPause) {
        console.log(`[Webhook] 🛑 Human reply detected (author: ${authorType}) - auto-pausing AI`);

        try {
          await sessionsManager.autoPauseOnHumanReply(
            existingMessage.sessionId,
            existingMessage.aiAgentId || undefined,
            agentName
          );
          console.log(`[Webhook] Session ${existingMessage.sessionId} paused due to human intervention`);
        } catch (pauseError) {
          console.error('[Webhook] Failed to auto-pause session:', pauseError);
        }
      }
    }
  } else {
    // ⭐ Mensagem externa (não está no banco) - provavelmente enviada via app WhatsApp
    // Salvar mensagem externa para manter histórico completo
    console.log(`[Webhook] Message ${message.id} not found - saving external outbound message`);

    try {
      const { to } = data;
      const instanceId = webhook.instanceId;

      if (!instanceId || !to) {
        console.log('[Webhook] Missing instanceId or to for external message');
        return;
      }

      // Buscar instância
      const instance = await database.connection.findUnique({
        where: { id: instanceId },
        select: { organizationId: true },
      });

      if (!instance?.organizationId) {
        console.log(`[Webhook] Instance ${instanceId} not found for external message`);
        return;
      }

      // Buscar ou criar contato (destinatário da mensagem)
      const cleanTo = to.replace(/@.*$/, '');
      let contact = await database.contact.findFirst({
        where: {
          OR: [
            { phoneNumber: cleanTo },
            { phoneNumber: to },
            { phoneNumber: `${cleanTo}@s.whatsapp.net` },
          ],
        },
      });

      if (!contact) {
        // Criar contato se não existir
        contact = await database.contact.create({
          data: {
            phoneNumber: cleanTo,
            name: data.pushName || data.contactName || cleanTo,
            organizationId: instance.organizationId,
          },
        });
        console.log(`[Webhook] Created contact for external message: ${contact.id}`);
      }

      // Buscar ou criar sessão
      const session = await sessionsManager.getOrCreateSession({
        contactId: contact.id,
        connectionId: instanceId,
        organizationId: instance.organizationId,
      });

      // Salvar mensagem externa
      const savedMessage = await database.message.create({
        data: {
          sessionId: session.id,
          contactId: contact.id,
          connectionId: instanceId,
          waMessageId: message.id,
          direction: 'OUTBOUND',
          type: message.type || 'text',
          author: 'AGENT', // Mensagem enviada pelo telefone (humano), não pelo sistema
          content: message.content || '',
          status: 'sent',
          mediaUrl: message.media?.mediaUrl || null,
          fileName: message.media?.fileName || null,
          sentAt: new Date(),
        },
      });

      console.log(`[Webhook] ✅ External outbound message saved: ${savedMessage.id}`);

      // Auto-pause IA quando humano responde pelo WhatsApp
      try {
        await sessionsManager.autoPauseOnHumanReply(session.id, undefined, 'WhatsApp');
        console.log(`[Webhook] Session ${session.id} paused due to WhatsApp human reply`);
      } catch (pauseError) {
        console.error('[Webhook] Failed to auto-pause session:', pauseError);
      }

      // Atualizar lastMessageAt da sessão
      await database.chatSession.update({
        where: { id: session.id },
        data: { lastMessageAt: new Date() },
      });
    } catch (saveError) {
      console.error('[Webhook] Failed to save external outbound message:', saveError);
    }
  }
}

/**
 * Executar comando detectado na mensagem
 */
async function executeCommand(
  command: ParsedCommand,
  sessionId: string,
  contactId: string,
  _instanceId: string // Prefixo _ para indicar parâmetro reservado para uso futuro
): Promise<void> {
  console.log(`[Webhook] Executing command: ${command.type}`);

  switch (command.type) {
    case 'CLOSE':
      // Fechar sessão
      await sessionsManager.closeSession(sessionId);
      console.log(`[Webhook] ✅ Session ${sessionId} closed via @fechar command`);
      break;

    case 'PAUSE':
      // Pausar sessão (bloquear IA)
      const pauseHours = command.hours || 24;
      await sessionsManager.pauseSession(sessionId, pauseHours);
      console.log(`[Webhook] ⏸️ Session ${sessionId} paused for ${pauseHours}h via @pausar command`);
      break;

    case 'REOPEN':
      // Reabrir sessão (desbloquear IA)
      await sessionsManager.resumeSession(sessionId);
      console.log(`[Webhook] ▶️ Session ${sessionId} resumed via @reabrir command`);
      break;

    case 'BLACKLIST':
      // Adicionar contato à blacklist (bypass bot permanente)
      await database.contact.update({
        where: { id: contactId },
        data: { bypassBots: true },
      });
      console.log(`[Webhook] 🚫 Contact ${contactId} added to blacklist via @blacklist command`);
      break;

    case 'WHITELIST':
      // Remover contato da blacklist
      await database.contact.update({
        where: { id: contactId },
        data: { bypassBots: false },
      });
      console.log(`[Webhook] ✅ Contact ${contactId} removed from blacklist via @whitelist command`);
      break;

    case 'TRANSFER':
      // Transferir para outro agente/departamento
      if (command.targetId) {
        // TODO: Implementar transferência real
        console.log(`[Webhook] 🔀 Transfer requested to ${command.targetId} (not yet implemented)`);
      } else {
        console.log('[Webhook] Transfer command missing target ID');
      }
      break;

    case 'STATUS':
      // Retornar status da sessão
      const session = await database.chatSession.findUnique({
        where: { id: sessionId },
        select: {
          status: true,
          lastMessageAt: true,
          // WhatsApp 24h window fields will be added after migration
        },
      });
      console.log(`[Webhook] 📊 Session status:`, session);
      // TODO: Enviar resposta de volta para o chat
      break;

    case 'NONE':
      // Não é um comando válido, não fazer nada
      break;
  }

  // Log do comando executado (apenas console, não requer userId)
  console.log(`[Webhook] Command executed: ${command.type}`, {
    sessionId,
    contactId,
    command: command.raw,
    hours: command.hours,
    targetId: command.targetId,
  });
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

  await database.connection.update({
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

  await database.connection.update({
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

/**
 * ⭐ PROCESSAR MENSAGEM DE GRUPO (Session Per Participant Model)
 *
 * Modelo de Monitoramento Contínuo:
 * 1. Mensagens de grupo são registradas no GroupMessage
 * 2. Cada participante tem sua própria sessão individual (GroupParticipant.privateSessionId)
 * 3. O grupo pode estar em modo: DISABLED, MONITOR_ONLY, ACTIVE
 * 4. Se ACTIVE, a IA pode responder no grupo ou no privado (conforme groupAiResponseMode)
 */
async function processGroupMessage(webhook: NormalizedWebhook, provider: BrokerType): Promise<void> {
  const { instanceId, data } = webhook;
  const { from, message, contactName } = data;

  // Garantir que temos o groupJid
  if (!from) {
    console.log('[Webhook] 👥 Group message without group ID - skipping');
    return;
  }
  const groupJid = from;

  // Extrair participantJid do payload (quem enviou a mensagem no grupo)
  // O formato varia por provider: data.participant, data.sender, etc.
  const participantJid = (data as any).participant ||
                         (data as any).sender ||
                         (data as any).author ||
                         (message as any)?.author;

  if (!participantJid) {
    console.log('[Webhook] 👥 Group message without participant info - skipping');
    return;
  }

  console.log(`[Webhook] 👥 Processing group message from ${participantJid} in group ${groupJid}`);

  // 1. Buscar instância e organização
  const instance = await database.connection.findUnique({
    where: { id: instanceId },
    include: {
      organization: {
        select: {
          id: true,
          groupDefaultMode: true,
          groupAiResponseMode: true,
        },
      },
    },
  });

  if (!instance || !instance.organization) {
    console.error(`[Webhook] Instance ${instanceId} not found or missing organization`);
    return;
  }

  const { organization } = instance;
  const groupMode = organization.groupDefaultMode as GroupMode;

  // 2. Verificar se grupos estão habilitados para esta organização
  if (groupMode === 'DISABLED') {
    console.log(`[Webhook] 👥 Groups DISABLED for org ${organization.id} - ignoring`);
    return;
  }

  console.log(`[Webhook] 👥 Group mode: ${groupMode}, AI response mode: ${organization.groupAiResponseMode}`);

  // 3. Buscar ou criar GroupChat
  let groupChat = await database.groupChat.findUnique({
    where: { groupJid },
  });

  if (!groupChat) {
    console.log(`[Webhook] 👥 Creating new GroupChat: ${groupJid}`);
    groupChat = await database.groupChat.create({
      data: {
        groupJid,
        connectionId: instanceId,
        organizationId: organization.id,
        mode: groupMode,
        name: (data as any).groupName || (data as any).subject || groupJid,
        aiEnabled: groupMode === 'ACTIVE',
        aiResponseMode: organization.groupAiResponseMode as any || 'PRIVATE',
      },
    });
  }

  // 4. Buscar ou criar Contact para o participante
  let participantContact = await database.contact.findUnique({
    where: { phoneNumber: participantJid },
  });

  if (!participantContact) {
    const displayName = contactName && contactName !== participantJid ? contactName : participantJid;
    console.log(`[Webhook] 👥 Creating contact for participant: ${participantJid}`);
    participantContact = await database.contact.create({
      data: {
        phoneNumber: participantJid,
        name: displayName,
      },
    });
  }

  // 5. Buscar ou criar GroupParticipant
  let groupParticipant = await database.groupParticipant.findUnique({
    where: {
      groupId_participantJid: {
        groupId: groupChat.id,
        participantJid,
      },
    },
  });

  if (!groupParticipant) {
    console.log(`[Webhook] 👥 Creating GroupParticipant for ${participantJid} in ${groupJid}`);
    groupParticipant = await database.groupParticipant.create({
      data: {
        groupId: groupChat.id,
        participantJid,
        contactId: participantContact.id,
        role: 'participant',
      },
    });
  }

  // 6. Atualizar lastMessageAt e messageCount
  await database.groupParticipant.update({
    where: { id: groupParticipant.id },
    data: {
      lastMessageAt: new Date(),
      messageCount: { increment: 1 },
    },
  });

  // 7. Salvar GroupMessage
  const groupMessage = await database.groupMessage.create({
    data: {
      groupId: groupChat.id,
      participantJid,
      waMessageId: message?.id || `grp_${Date.now()}`,
      type: message?.type || 'text',
      content: message?.content || '',
      mediaUrl: message?.media?.mediaUrl,
      mediaType: message?.media?.type,
      mimeType: message?.media?.mimeType,
    },
  });

  console.log(`[Webhook] 👥 GroupMessage saved: ${groupMessage.id}`);

  // 8. Atualizar estatísticas do grupo
  await database.groupChat.update({
    where: { id: groupChat.id },
    data: {
      lastMessageAt: new Date(),
      totalMessages: { increment: 1 },
    },
  });

  // 9. Se modo ACTIVE e IA habilitada, criar/atualizar sessão privada do participante
  if (groupMode === 'ACTIVE' && groupChat.aiEnabled) {
    // Buscar ou criar sessão privada para o participante
    let privateSession = groupParticipant.privateSessionId
      ? await database.chatSession.findUnique({
          where: { id: groupParticipant.privateSessionId },
        })
      : null;

    // Se não existe sessão privada, criar uma nova
    if (!privateSession) {
      console.log(`[Webhook] 👥 Creating private session for participant ${participantJid}`);
      privateSession = await sessionsManager.getOrCreateSession({
        contactId: participantContact.id,
        connectionId: instanceId,
        organizationId: organization.id,
      });

      // Vincular sessão ao participante
      await database.groupParticipant.update({
        where: { id: groupParticipant.id },
        data: { privateSessionId: privateSession.id },
      });
    }

    console.log(`[Webhook] 👥 Private session for ${participantJid}: ${privateSession.id}`);

    // Processar mensagem na sessão privada (pode acionar IA)
    // Dependendo do groupAiResponseMode:
    // - IN_GROUP: IA responde no grupo
    // - PRIVATE: IA responde no privado
    // - HYBRID: IA decide
    const aiResponseMode = groupChat.aiResponseMode || organization.groupAiResponseMode;
    console.log(`[Webhook] 👥 AI response mode: ${aiResponseMode}`);

    // Por enquanto, apenas registrar - a integração com n8n/IA será via job
    // TODO: Enfileirar job para processar mensagem com IA
  }

  // 10. Sync com Chatwoot (se habilitado)
  try {
    const chatwootSync = await getChatwootSyncService();
    await chatwootSync.syncIncomingMessage({
      instanceId,
      organizationId: organization.id,
      phoneNumber: participantJid,
      contactName: participantContact.name || participantJid,
      messageContent: message?.content || `[${message?.type || 'message'}]`,
      messageType: message?.type || 'text',
      mediaUrl: message?.media?.mediaUrl,
      mediaMimeType: message?.media?.mimeType,
      isFromGroup: true,
      groupJid,
    });
  } catch (chatwootError) {
    console.error('[Webhook] Chatwoot sync failed (non-blocking):', chatwootError);
  }

  console.log(`[Webhook] 👥 Group message processed successfully`);
}
