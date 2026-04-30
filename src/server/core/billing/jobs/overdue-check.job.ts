/**
 * Overdue Check Job
 *
 * Checks for overdue invoices and manages subscription suspension
 * based on grace period expiration.
 *
 * Should run daily (e.g., via cron or BullMQ scheduled job).
 */

import { getDatabase } from '@/server/services/database';

/**
 * Marks overdue invoices and suspends subscriptions with expired grace periods.
 *
 * 1. Finds PENDING invoices past their due date -> marks as OVERDUE
 * 2. For each overdue invoice, checks the subscription's grace period
 * 3. If grace period has passed -> suspends the subscription
 */
export async function processOverdueInvoices(): Promise<{
  markedOverdue: number;
  suspended: number;
}> {
  const db = getDatabase();
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let markedOverdue = 0;
  let suspended = 0;

  try {
    // ── Step 1: Mark overdue invoices ────────────────────────────────────

    const overdueInvoices = await db.invoice.findMany({
      where: {
        status: 'PENDING',
        dueDate: {
          lt: today,
        },
      },
      include: {
        subscription: true,
      },
    });

    if (overdueInvoices.length > 0) {
      console.log(`[OverdueCheck] Found ${overdueInvoices.length} overdue invoices`);

      for (const invoice of overdueInvoices) {
        try {
          // Mark invoice as overdue
          await db.invoice.update({
            where: { id: invoice.id },
            data: { status: 'OVERDUE' },
          });
          markedOverdue++;

          // If subscription doesn't have a grace period yet, set one
          if (
            invoice.subscription &&
            !invoice.subscription.gracePeriodEndsAt &&
            invoice.subscription.status === 'ACTIVE'
          ) {
            const gracePeriodEnd = new Date();
            gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 10); // 10-day grace

            await db.subscription.update({
              where: { id: invoice.subscription.id },
              data: {
                status: 'PAST_DUE',
                gracePeriodEndsAt: gracePeriodEnd,
              },
            });

            console.log(
              `[OverdueCheck] Grace period set for subscription ${invoice.subscription.id} (ends ${gracePeriodEnd.toISOString().split('T')[0]})`
            );
          }
        } catch (error) {
          console.error(`[OverdueCheck] Error processing invoice ${invoice.id}:`, error);
        }
      }
    }

    // ── Step 2: Suspend subscriptions with expired grace periods ─────────

    const expiredSubscriptions = await db.subscription.findMany({
      where: {
        status: 'PAST_DUE',
        gracePeriodEndsAt: {
          lt: now,
        },
      },
    });

    if (expiredSubscriptions.length > 0) {
      console.log(
        `[OverdueCheck] Found ${expiredSubscriptions.length} subscriptions with expired grace period`
      );

      for (const subscription of expiredSubscriptions) {
        try {
          await db.subscription.update({
            where: { id: subscription.id },
            data: {
              status: 'SUSPENDED',
            },
          });
          suspended++;

          console.log(
            `[OverdueCheck] Subscription ${subscription.id} SUSPENDED (org: ${subscription.organizationId})`
          );
        } catch (error) {
          console.error(
            `[OverdueCheck] Error suspending subscription ${subscription.id}:`,
            error
          );
        }
      }
    }

    // ── Step 3: Also check PROCESSING invoices that are stuck ────────────

    const stuckInvoices = await db.invoice.findMany({
      where: {
        status: 'PROCESSING',
        dueDate: {
          lt: today,
        },
        // Only if they've been processing for more than 24 hours
        updatedAt: {
          lt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        },
      },
    });

    if (stuckInvoices.length > 0) {
      console.log(`[OverdueCheck] Found ${stuckInvoices.length} stuck PROCESSING invoices`);

      await db.invoice.updateMany({
        where: {
          id: {
            in: stuckInvoices.map((inv) => inv.id),
          },
        },
        data: {
          status: 'OVERDUE',
        },
      });

      markedOverdue += stuckInvoices.length;
    }

    if (markedOverdue > 0 || suspended > 0) {
      console.log(
        `[OverdueCheck] Complete: ${markedOverdue} invoices marked overdue, ${suspended} subscriptions suspended`
      );
    }
  } catch (error) {
    console.error('[OverdueCheck] Critical error in overdue check:', error);
  }

  return { markedOverdue, suspended };
}
