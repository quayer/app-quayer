/**
 * NFS-e Emitter Job
 *
 * Processes paid invoices that still need a NFS-e (Nota Fiscal de Servico Eletronica).
 * Calls the Asaas API to emit the fiscal document asynchronously.
 *
 * Should run periodically (e.g., every 30 minutes via cron).
 *
 * Required env vars:
 *   ASAAS_API_KEY  - API key from Asaas dashboard
 *   ASAAS_SANDBOX  - "true" for sandbox
 */

import { getDatabase } from '@/server/services/database';
import { getNfseService, isNfseAvailable } from '../services/gateway-factory';

/**
 * Processes all paid invoices that have pending NFS-e status.
 *
 * For each PAID invoice with nfseStatus = PENDING_NFSE:
 * 1. Ensures the organization has a customer in Asaas
 * 2. Emits the NFS-e via Asaas API
 * 3. Updates the invoice with NFS-e ID and status
 *
 * On error: sets nfseStatus = ERROR_NFSE for retry on next run.
 */
export async function processNfseQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  if (!isNfseAvailable()) {
    console.log('[NfseEmitter] NFS-e not available in current gateway mode');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  const nfseService = getNfseService();
  if (!nfseService) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  const db = getDatabase();

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    // Find all paid invoices pending NFS-e emission
    const pendingInvoices = await db.invoice.findMany({
      where: {
        status: 'PAID',
        nfseStatus: 'PENDING_NFSE',
      },
      include: {
        subscription: {
          include: {
            organization: {
              include: {
                users: {
                  where: { role: 'master' },
                  include: { user: { select: { email: true } } },
                  take: 1,
                },
              },
            },
            plan: true,
          },
        },
      },
      take: 50, // Process in batches to avoid overloading
      orderBy: { paidAt: 'asc' },
    });

    if (pendingInvoices.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    console.log(`[NfseEmitter] Processing ${pendingInvoices.length} invoices for NFS-e emission...`);

    for (const invoice of pendingInvoices) {
      processed++;

      try {
        const org = invoice.subscription.organization;
        const plan = invoice.subscription.plan;

        // Organization must have a document (CNPJ/CPF) for NFS-e
        if (!org.document) {
          console.warn(
            `[NfseEmitter] Org ${org.id} has no document. Skipping NFS-e for invoice ${invoice.id}.`
          );
          await db.invoice.update({
            where: { id: invoice.id },
            data: {
              nfseStatus: 'ERROR_NFSE',
              metadata: {
                ...(invoice.metadata as Record<string, unknown> | null),
                nfseError: 'Organization has no document (CPF/CNPJ)',
              },
            },
          });
          failed++;
          continue;
        }

        // Get owner email from the included users relation
        const orgWithUsers = org as typeof org & {
          users: Array<{ user: { email: string } }>;
        };
        const ownerEmail = orgWithUsers.users?.[0]?.user?.email ?? '';

        // 1. Ensure customer exists in Asaas
        const asaasCustomerId = await nfseService.ensureCustomer(
          org.name,
          org.document,
          ownerEmail
        );

        // 2. Emit NFS-e
        const nfseResult = await nfseService.emitNfse({
          customerId: asaasCustomerId,
          description: `${plan.name} - ${invoice.description}`,
          valueCents: invoice.totalCents,
          externalReference: invoice.id,
        });

        // 3. Update invoice with NFS-e data
        await db.invoice.update({
          where: { id: invoice.id },
          data: {
            nfseId: nfseResult.nfseId,
            nfseStatus: 'SCHEDULED', // Will be polled for AUTHORIZED status later
          },
        });

        succeeded++;
        console.log(
          `[NfseEmitter] NFS-e emitted for invoice #${invoice.number}: ${nfseResult.nfseId}`
        );
      } catch (error) {
        failed++;
        console.error(
          `[NfseEmitter] Failed to emit NFS-e for invoice ${invoice.id}:`,
          error
        );

        // Mark as error for retry on next run
        try {
          await db.invoice.update({
            where: { id: invoice.id },
            data: {
              nfseStatus: 'ERROR_NFSE',
              metadata: {
                ...(invoice.metadata as Record<string, unknown> | null),
                nfseError: error instanceof Error ? error.message : String(error),
                nfseErrorAt: new Date().toISOString(),
              },
            },
          });
        } catch (updateError) {
          console.error('[NfseEmitter] Failed to update invoice error status:', updateError);
        }
      }
    }

    console.log(
      `[NfseEmitter] Complete: ${processed} processed, ${succeeded} succeeded, ${failed} failed`
    );
  } catch (error) {
    console.error('[NfseEmitter] Critical error in NFS-e queue:', error);
  }

  return { processed, succeeded, failed };
}

/**
 * Polls NFS-e status for invoices that have been scheduled but not yet authorized.
 * Updates nfseStatus and nfseUrl when the NFS-e is ready.
 */
export async function pollNfseStatus(): Promise<void> {
  if (!isNfseAvailable()) return;

  const nfseService = getNfseService();
  if (!nfseService) return;

  const db = getDatabase();

  try {
    const scheduledInvoices = await db.invoice.findMany({
      where: {
        nfseStatus: 'SCHEDULED',
        nfseId: { not: null },
      },
      take: 50,
      orderBy: { updatedAt: 'asc' },
    });

    if (scheduledInvoices.length === 0) return;

    console.log(`[NfseEmitter] Polling status for ${scheduledInvoices.length} scheduled NFS-e...`);

    for (const invoice of scheduledInvoices) {
      if (!invoice.nfseId) continue;

      try {
        const status = await nfseService.getNfseStatus(invoice.nfseId);

        if (status.status === 'AUTHORIZED') {
          await db.invoice.update({
            where: { id: invoice.id },
            data: {
              nfseStatus: 'AUTHORIZED',
              nfseUrl: status.url ?? null,
            },
          });
          console.log(`[NfseEmitter] NFS-e AUTHORIZED for invoice #${invoice.number}`);
        } else if (status.status === 'CANCELLATION_DENIED') {
          await db.invoice.update({
            where: { id: invoice.id },
            data: {
              nfseStatus: 'CANCELLATION_DENIED',
              metadata: {
                ...(invoice.metadata as Record<string, unknown> | null),
                nfseDeniedStatus: status.status,
              },
            },
          });
          console.log(`[NfseEmitter] NFS-e CANCELLATION_DENIED for invoice #${invoice.number}`);
        } else if (status.status === 'ERROR') {
          await db.invoice.update({
            where: { id: invoice.id },
            data: {
              nfseStatus: 'ERROR_NFSE',
              metadata: {
                ...(invoice.metadata as Record<string, unknown> | null),
                nfseErrorStatus: status.status,
              },
            },
          });
          console.log(`[NfseEmitter] NFS-e ERROR for invoice #${invoice.number}`);
        }
        // Otherwise still SCHEDULED, will check again on next poll
      } catch (error) {
        console.error(`[NfseEmitter] Error polling NFS-e ${invoice.nfseId}:`, error);
      }
    }
  } catch (error) {
    console.error('[NfseEmitter] Critical error polling NFS-e status:', error);
  }
}
