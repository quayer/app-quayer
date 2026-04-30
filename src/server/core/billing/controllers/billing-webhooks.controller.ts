/**
 * Billing Webhooks Controller - Receives payment gateway webhooks
 *
 * NO auth required (gateway-to-server communication).
 * Idempotency enforced via WebhookEvent table.
 *
 * IMPORTANT: Webhooks MUST actually process payment status changes.
 * Without this, invoices stay PENDING forever and NFS-e never triggers.
 */

import { randomUUID } from 'crypto';
import { igniter } from '@/igniter';
import { billingRepository } from '../billing.repository';
import { efiWebhookSchema, asaasWebhookSchema } from '../billing.schemas';
import { getPaymentGateway, isNfseAvailable } from '../services/gateway-factory';
import { getDatabase } from '@/server/services/database';

// Webhook processing timeout to prevent hanging connections.
// Gateways expect a fast response; if processing takes too long,
// we mark the event as failed and return 200 to prevent retries.
const WEBHOOK_TIMEOUT_MS = 10_000; // 10 seconds

/**
 * Race a promise against a timeout. Returns the promise result or throws on timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[${label}] Processing timeout after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Process Efí payment confirmation — updates invoice to PAID and resets subscription grace period.
 */
async function processEfiPayment(payload: Record<string, unknown>): Promise<void> {
  const db = getDatabase();
  const eventType = payload.tipo as string | undefined;
  const status = payload.status as string | undefined;

  // Efí sends 'cobr.paga' when a Pix charge is confirmed,
  // or status 'CONCLUIDA' in the payload for completed transactions
  const isPaymentConfirmed =
    eventType === 'cobr.paga' || status === 'CONCLUIDA';

  if (!isPaymentConfirmed) return;

  const txid =
    (payload.identificadorTransacao as string) ||
    (payload.txid as string);

  if (!txid) {
    console.warn('[BillingWebhooks/Efí] Payment confirmed but no txid found in payload');
    return;
  }

  const invoice = await db.invoice.findFirst({
    where: {
      gatewayPaymentId: txid,
      status: { in: ['PENDING', 'PROCESSING', 'OVERDUE'] },
    },
  });

  if (!invoice) {
    console.warn(`[BillingWebhooks/Efí] No matching invoice for txid ${txid}`);
    return;
  }

  // Update invoice and subscription atomically (DB-only, no external calls)
  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        nfseStatus: isNfseAvailable() ? 'PENDING_NFSE' : null,
      },
    });

    // Reset grace period — subscription is healthy again
    if (invoice.subscriptionId) {
      await tx.subscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          status: 'ACTIVE',
          gracePeriodEndsAt: null,
        },
      });
    }
  });

  console.log(`[BillingWebhooks/Efí] Invoice ${invoice.id} marked as PAID (txid: ${txid})`);
}

/**
 * Process Asaas payment confirmation — updates invoice to PAID and resets subscription grace period.
 *
 * Two-step lookup: first by gatewayPaymentId (manual charges), then by subscription ID
 * (auto-generated charges from Asaas subscriptions where gatewayPaymentId is never set on the invoice).
 */
async function processAsaasPayment(payload: Record<string, unknown>): Promise<void> {
  const db = getDatabase();
  const event = payload.event as string | undefined;

  const isPaymentConfirmed =
    event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED';
  if (!isPaymentConfirmed) return;

  const payment = payload.payment as Record<string, unknown> | undefined;
  const paymentId = payment?.id as string | undefined;

  if (!paymentId) {
    console.warn('[BillingWebhooks/Asaas] Payment confirmed but no payment.id found');
    return;
  }

  // Strategy 1: Direct lookup by gatewayPaymentId (for manual charges)
  let invoice = await db.invoice.findFirst({
    where: {
      gatewayPaymentId: paymentId,
      status: { in: ['PENDING', 'PROCESSING', 'OVERDUE'] },
    },
  });

  // Strategy 2: Lookup via subscription ID (for auto-generated charges from Asaas subscriptions)
  if (!invoice) {
    const asaasSubscriptionId = payment?.subscription as string | undefined;
    if (asaasSubscriptionId) {
      // Find our subscription by the Asaas subscription ID stored in pixAuthorizationId
      const subscription = await db.subscription.findFirst({
        where: {
          pixAuthorizationId: asaasSubscriptionId,
          status: { in: ['ACTIVE', 'PAST_DUE'] },
        },
      });

      if (subscription) {
        // Find the latest PROCESSING/PENDING invoice for this subscription
        invoice = await db.invoice.findFirst({
          where: {
            subscriptionId: subscription.id,
            status: { in: ['PENDING', 'PROCESSING', 'OVERDUE'] },
          },
          orderBy: { issuedAt: 'desc' },
        });
      }
    }
  }

  if (!invoice) {
    console.warn(`[BillingWebhooks/Asaas] No matching invoice for paymentId ${paymentId}`);
    return;
  }

  // Update invoice and subscription atomically
  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoice!.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        gatewayPaymentId: paymentId, // Store the Asaas payment ID for future reference
        nfseStatus: isNfseAvailable() ? 'PENDING_NFSE' : null,
      },
    });

    if (invoice!.subscriptionId) {
      await tx.subscription.update({
        where: { id: invoice!.subscriptionId },
        data: {
          status: 'ACTIVE',
          gracePeriodEndsAt: null,
        },
      });
    }
  });

  console.log(`[BillingWebhooks/Asaas] Invoice ${invoice.id} marked as PAID (paymentId: ${paymentId})`);
}

export const billingWebhooksController = igniter.controller({
  name: 'billing-webhooks',
  path: '/billing-webhooks',
  actions: {
    // EFI (Gerencianet) webhook
    efiWebhook: igniter.mutation({
      path: '/efi',
      method: 'POST',
      body: efiWebhookSchema,
      handler: async ({ request, response }) => {
        // Verify webhook signature BEFORE processing
        const signature = request.headers?.get?.('x-efi-signature') || '';
        const rawBody = JSON.stringify(request.body);

        if (!getPaymentGateway('EFI').verifyWebhookSignature(rawBody, signature as string)) {
          return response.unauthorized('Invalid webhook signature');
        }

        const payload = request.body;

        // Extract event identifier for idempotency (crypto-safe fallback)
        const gatewayEventId =
          payload.identificadorTransacao ||
          `efi-${randomUUID()}`;
        const eventType = payload.tipo || 'unknown';

        // Atomic idempotency: try to insert and catch unique constraint violation (P2002).
        // This eliminates the TOCTOU race between findByGatewayEventId and createWebhookEvent.
        let webhookEvent;
        try {
          webhookEvent = await billingRepository.createWebhookEvent({
            gateway: 'EFI',
            gatewayEventId: String(gatewayEventId),
            eventType: String(eventType),
            payload: payload as Record<string, unknown>,
          });
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
            return response.success({ message: 'Evento já processado' });
          }
          throw error;
        }

        try {
          // Process the webhook with a timeout to prevent hanging connections.
          // Gateways expect a fast 200 response; if we take too long they'll retry.
          await withTimeout(
            processEfiPayment(payload as Record<string, unknown>),
            WEBHOOK_TIMEOUT_MS,
            'EfíWebhook'
          );

          await billingRepository.markProcessed(webhookEvent.id);

          return response.success({
            message: 'Webhook Efí recebido e processado',
            eventId: webhookEvent.id,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          console.error(`[BillingWebhooks/Efí] Error processing event ${webhookEvent.id}:`, errorMessage);
          await billingRepository.markFailed(webhookEvent.id, errorMessage);

          // Return 200 anyway to prevent gateway from retrying (we logged the error)
          return response.success({
            message: 'Webhook Efí recebido com erro de processamento',
            eventId: webhookEvent.id,
          });
        }
      },
    }),

    // ASAAS webhook
    asaasWebhook: igniter.mutation({
      path: '/asaas',
      method: 'POST',
      body: asaasWebhookSchema,
      handler: async ({ request, response }) => {
        // Verify webhook token BEFORE processing (timing-safe via gateway service)
        const token = request.headers?.get?.('asaas-access-token') || '';
        const rawBody = JSON.stringify(request.body);
        if (!getPaymentGateway('ASAAS').verifyWebhookSignature(rawBody, token as string)) {
          return response.unauthorized('Invalid webhook token');
        }

        const payload = request.body;

        // Extract event identifier for idempotency (crypto-safe fallback)
        const gatewayEventId =
          payload.id ||
          `asaas-${randomUUID()}`;
        const eventType = payload.event || 'unknown';

        // Atomic idempotency: try to insert and catch unique constraint violation (P2002).
        // This eliminates the TOCTOU race between findByGatewayEventId and createWebhookEvent.
        let webhookEvent;
        try {
          webhookEvent = await billingRepository.createWebhookEvent({
            gateway: 'ASAAS',
            gatewayEventId: String(gatewayEventId),
            eventType: String(eventType),
            payload: payload as Record<string, unknown>,
          });
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
            return response.success({ message: 'Evento já processado' });
          }
          throw error;
        }

        try {
          // Process the webhook with a timeout to prevent hanging connections.
          // Gateways expect a fast 200 response; if we take too long they'll retry.
          await withTimeout(
            processAsaasPayment(payload as Record<string, unknown>),
            WEBHOOK_TIMEOUT_MS,
            'AsaasWebhook'
          );

          await billingRepository.markProcessed(webhookEvent.id);

          return response.success({
            message: 'Webhook Asaas recebido e processado',
            eventId: webhookEvent.id,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          console.error(`[BillingWebhooks/Asaas] Error processing event ${webhookEvent.id}:`, errorMessage);
          await billingRepository.markFailed(webhookEvent.id, errorMessage);

          return response.success({
            message: 'Webhook Asaas recebido com erro de processamento',
            eventId: webhookEvent.id,
          });
        }
      },
    }),
  },
});
