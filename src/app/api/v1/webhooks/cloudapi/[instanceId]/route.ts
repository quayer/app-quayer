/**
 * Dynamic Cloud API Webhook Endpoint (per instance)
 *
 * GET  /api/v1/webhooks/cloudapi/{instanceId} - Meta verification challenge
 * POST /api/v1/webhooks/cloudapi/{instanceId} - Receive webhooks for specific instance
 *
 * This route provides per-instance webhook URLs for better multi-tenant isolation.
 * Each client/organization can have their own webhook URL tied to their instance.
 *
 * Benefits:
 * - Security isolation: If one URL leaks, only affects one instance
 * - Easier debugging: Know exactly which instance received the webhook
 * - Per-instance rate limiting possible
 * - Better audit logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/services/database';
import { orchestrator } from '@/lib/providers';
import { logger } from '@/lib/logging/logger';
import { webhookRateLimiter, getClientIdentifier } from '@/lib/rate-limit/rate-limiter';
import {
  validateWebhookPayload,
  withMessageLock,
  createWebhookTrace,
  type TraceContext,
} from '@/lib/webhook';
import type { BrokerType, NormalizedWebhook } from '@/lib/providers/core/provider.types';

/**
 * GET /api/v1/webhooks/cloudapi/{instanceId}
 * Handles Meta webhook verification challenge for specific instance
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  const { instanceId } = await params;

  // Validate instanceId format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(instanceId)) {
    return NextResponse.json({ error: 'Invalid instance ID format' }, { status: 400 });
  }

  // Verify instance exists and is Cloud API type
  const instance = await database.connection.findFirst({
    where: {
      id: instanceId,
      provider: 'WHATSAPP_CLOUD_API',
    },
    select: { id: true, name: true },
  });

  if (!instance) {
    logger.warn('Cloud API webhook verification for unknown instance', { instanceId });
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  logger.info('Cloud API verification request (per-instance)', {
    instanceId,
    instanceName: instance.name,
    mode,
    hasToken: !!token,
    hasChallenge: !!challenge,
  });

  // Verify token should be configured in environment
  const verifyToken = process.env.CLOUDAPI_WEBHOOK_VERIFY_TOKEN || 'quayer-cloudapi-verify';

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    logger.info('Cloud API verification successful (per-instance)', { instanceId });
    return new NextResponse(challenge, { status: 200 });
  }

  logger.warn('Cloud API verification failed (per-instance)', { instanceId });
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

/**
 * POST /api/v1/webhooks/cloudapi/{instanceId}
 * Process incoming webhooks for specific instance
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  const { instanceId } = await params;
  const clientIP = getClientIdentifier(request);
  const provider: BrokerType = 'cloudapi';

  // Validate instanceId format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(instanceId)) {
    return NextResponse.json({ error: 'Invalid instance ID format' }, { status: 400 });
  }

  // Rate limiting
  const rateLimitResult = await webhookRateLimiter.check(clientIP);
  if (!rateLimitResult.success) {
    logger.warn('Rate limit exceeded (per-instance webhook)', { clientIP, instanceId });
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

  // Verify instance exists and is Cloud API type
  const instance = await database.connection.findFirst({
    where: {
      id: instanceId,
      provider: 'WHATSAPP_CLOUD_API',
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      cloudApiPhoneNumberId: true,
    },
  });

  if (!instance) {
    logger.warn('Webhook received for unknown instance', { instanceId });
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  // Parse request body
  let rawBody: any;
  try {
    const rawBodyText = await request.text();
    rawBody = JSON.parse(rawBodyText);
  } catch (parseError) {
    logger.error('Failed to parse JSON body (per-instance)', {
      instanceId,
      error: parseError instanceof Error ? parseError.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate payload structure
  const validationResult = validateWebhookPayload(provider, rawBody);
  if (!validationResult.success) {
    logger.warn('Invalid webhook payload structure (per-instance)', {
      instanceId,
      errors: validationResult.errors.slice(0, 3),
    });
    return NextResponse.json(
      { error: 'Invalid payload structure', details: validationResult.errors.slice(0, 3) },
      { status: 400 }
    );
  }

  // Create trace context
  const traceCtx: TraceContext = createWebhookTrace(provider, instanceId);

  try {
    // Normalize webhook using orchestrator
    const normalized = await orchestrator.normalizeWebhook(provider, rawBody);
    if (!normalized) {
      logger.debug('Webhook normalized to null (ignored)', { instanceId, traceId: traceCtx.traceId });
      return NextResponse.json({ success: true, ignored: true });
    }

    // Override instanceId with the one from URL (more reliable than payload)
    normalized.instanceId = instanceId;

    logger.info('Processing webhook (per-instance)', {
      instanceId,
      instanceName: instance.name,
      event: normalized.event,
      from: normalized.data.from,
      traceId: traceCtx.traceId,
    });

    // Process by event type - delegate to shared processor
    const { processWebhookEvent } = await import('@/lib/webhook/processor');
    await processWebhookEvent(normalized, provider, traceCtx);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error('Webhook processing failed (per-instance)', {
      instanceId,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Webhook processing failed', message: error.message },
      { status: 500 }
    );
  }
}
