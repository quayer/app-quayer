/**
 * Billing Cycle Job
 *
 * Processes recurring billing: creates invoices, triggers charges via gateway,
 * and manages grace periods for failed payments.
 *
 * Should run daily (e.g., via cron or BullMQ scheduled job).
 *
 * All monetary values are in CENTAVOS (Int). 14900 = R$ 149,00
 */

import { getDatabase } from '@/server/services/database';
import { getPaymentGateway } from '../services/gateway-factory';
import type { GatewayProvider } from '../services/gateway.interface';
import { addMonths, addYears } from 'date-fns';

// Grace period in days
const GRACE_PERIOD_DAYS = 10;

/**
 * Process all subscriptions that are due for billing today.
 *
 * For each ACTIVE subscription with nextBillingDate <= today:
 * 1. Creates a PENDING invoice
 * 2. Calls gateway.createCharge
 * 3. Updates nextBillingDate to next cycle
 *
 * On failure: marks invoice as OVERDUE and starts grace period.
 */
export async function processBillingCycle(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const db = getDatabase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // Circuit breaker: stop processing after too many consecutive failures
  // to avoid hammering a potentially down gateway
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 5;

  try {
    // Find all active subscriptions due for billing
    const dueSubscriptions = await db.subscription.findMany({
      where: {
        status: 'ACTIVE',
        isCurrent: true,
        nextBillingDate: {
          lte: today,
        },
      },
      include: {
        plan: true,
        organization: true,
      },
    });

    if (dueSubscriptions.length === 0) {
      console.log('[BillingCycle] No subscriptions due for billing today.');
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    console.log(`[BillingCycle] Processing ${dueSubscriptions.length} subscriptions...`);

    for (const subscription of dueSubscriptions) {
      // Circuit breaker: abort if gateway appears to be down
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(
          `[BillingCycle] CIRCUIT BREAKER: ${MAX_CONSECUTIVE_FAILURES} consecutive failures, stopping. ` +
          `${dueSubscriptions.length - processed} subscriptions skipped.`
        );
        break;
      }

      processed++;

      try {
        const priceCents = subscription.currentPriceCents - subscription.discountCents;
        const nextBillingDate = calculateNextBillingDate(
          subscription.nextBillingDate ?? new Date(),
          subscription.billingCycle
        );

        // Determine description
        const cycleLabel = subscription.billingCycle === 'MONTHLY' ? 'Mensal'
          : subscription.billingCycle === 'QUARTERLY' ? 'Trimestral'
          : 'Anual';
        const description = `Quayer ${subscription.plan.name} - ${cycleLabel}`;

        // STEP 1: Create invoice OUTSIDE transaction — quick DB write only.
        // External API calls must NEVER be inside $transaction because:
        // - Prisma holds a DB connection lock during the transaction
        // - External API calls can take 5-30s, exhausting the connection pool
        // - If API succeeds but transaction rolls back, money is charged but DB not updated
        const invoice = await db.invoice.create({
          data: {
            subscriptionId: subscription.id,
            organizationId: subscription.organizationId,
            description,
            totalCents: priceCents,
            status: 'PENDING',
            issuedAt: new Date(),
            dueDate: subscription.nextBillingDate ?? new Date(),
            gateway: subscription.gateway,
            nfseStatus: null,
          },
        });

        // STEP 2: Process charge based on gateway provider.
        // Asaas auto-generates charges per billing cycle — no manual charge needed.
        // Efí requires explicit charge creation via gateway API.
        const provider = subscription.gateway as GatewayProvider;

        if (provider === 'ASAAS') {
          // Asaas auto-generates charges per cycle via subscriptions API.
          // Just update local records — the webhook will confirm payment.
          await db.$transaction(async (tx) => {
            await tx.invoice.update({
              where: { id: invoice.id },
              data: { status: 'PROCESSING' },
            });
            await tx.subscription.update({
              where: { id: subscription.id },
              data: {
                nextBillingDate: nextBillingDate,
                lastPaymentDate: new Date(),
              },
            });
          });
        } else if (provider === 'EFI') {
          // Efí requires manual charge creation via gateway API.
          if (subscription.pixAuthorizationId) {
            const gateway = getPaymentGateway(provider);
            let chargeResult;
            try {
              chargeResult = await gateway.createCharge({
                gatewaySubscriptionId: subscription.pixAuthorizationId,
                gatewayCustomerId: subscription.gatewayCustomerId ?? undefined,
                valueCents: priceCents,
                dueDate: (subscription.nextBillingDate ?? new Date()).toISOString().split('T')[0],
                description,
              });
            } catch (chargeError) {
              // Gateway call failed — mark invoice as OVERDUE and re-throw
              await db.invoice.update({
                where: { id: invoice.id },
                data: { status: 'OVERDUE' },
              });
              throw chargeError;
            }

            // STEP 3: Update invoice + subscription in a quick DB-only transaction.
            // No external calls here — just fast DB writes.
            await db.$transaction(async (tx) => {
              await tx.invoice.update({
                where: { id: invoice.id },
                data: {
                  status: 'PROCESSING',
                  gatewayPaymentId: chargeResult.gatewayPaymentId,
                },
              });

              await tx.subscription.update({
                where: { id: subscription.id },
                data: {
                  nextBillingDate: nextBillingDate,
                  lastPaymentDate: new Date(),
                },
              });
            });
          } else {
            throw new Error(`Missing gateway credentials for subscription ${subscription.id} (provider: ${provider})`);
          }
        } else {
          console.error(`[BillingCycle] Unknown gateway provider "${subscription.gateway}" for subscription ${subscription.id}`);
          await db.invoice.update({
            where: { id: invoice.id },
            data: { status: 'OVERDUE' },
          });
        }

        consecutiveFailures = 0; // Reset on success
        succeeded++;
        console.log(
          `[BillingCycle] Invoice #${invoice.number} created for org ${subscription.organizationId} (${priceCents} cents)`
        );
      } catch (error) {
        consecutiveFailures++;
        failed++;
        console.error(
          `[BillingCycle] Failed to process subscription ${subscription.id}:`,
          error
        );

        // Mark any created invoice as OVERDUE
        try {
          await db.invoice.updateMany({
            where: {
              subscriptionId: subscription.id,
              status: 'PENDING',
              issuedAt: {
                gte: today,
              },
            },
            data: {
              status: 'OVERDUE',
            },
          });
        } catch (updateError) {
          console.error('[BillingCycle] Failed to mark invoice as OVERDUE:', updateError);
        }

        // Start grace period if not already started
        if (!subscription.gracePeriodEndsAt) {
          try {
            const gracePeriodEnd = new Date();
            gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

            await db.subscription.update({
              where: { id: subscription.id },
              data: {
                gracePeriodEndsAt: gracePeriodEnd,
                status: 'PAST_DUE',
              },
            });

            console.log(
              `[BillingCycle] Grace period started for subscription ${subscription.id} (ends ${gracePeriodEnd.toISOString()})`
            );
          } catch (graceError) {
            console.error('[BillingCycle] Failed to set grace period:', graceError);
          }
        }
      }

      // Rate limiting: avoid hammering the gateway API
      // 200ms delay between subscription processing to prevent rate limit errors
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Check for expired grace periods and suspend
    await suspendExpiredGracePeriods();

    console.log(
      `[BillingCycle] Complete: ${processed} processed, ${succeeded} succeeded, ${failed} failed`
    );
  } catch (error) {
    console.error('[BillingCycle] Critical error in billing cycle:', error);
  }

  return { processed, succeeded, failed };
}

/**
 * Suspends subscriptions whose grace period has expired.
 */
async function suspendExpiredGracePeriods(): Promise<void> {
  const db = getDatabase();
  const now = new Date();

  try {
    const expired = await db.subscription.findMany({
      where: {
        status: 'PAST_DUE',
        gracePeriodEndsAt: {
          lt: now,
        },
      },
    });

    if (expired.length === 0) return;

    for (const sub of expired) {
      await db.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'SUSPENDED',
        },
      });

      console.log(`[BillingCycle] Subscription ${sub.id} SUSPENDED (grace period expired)`);
    }

    console.log(`[BillingCycle] ${expired.length} subscriptions suspended due to expired grace period`);
  } catch (error) {
    console.error('[BillingCycle] Error suspending expired grace periods:', error);
  }
}

/**
 * Calculates the next billing date based on the current date and billing cycle.
 * Uses date-fns addMonths/addYears to handle month-end edge cases correctly
 * (e.g., Jan 31 + 1 month = Feb 28, not Mar 3).
 */
function calculateNextBillingDate(current: Date, cycle: string): Date {
  switch (cycle) {
    case 'MONTHLY':
      return addMonths(current, 1);
    case 'QUARTERLY':
      return addMonths(current, 3);
    case 'YEARLY':
      return addYears(current, 1);
    default:
      return addMonths(current, 1);
  }
}
