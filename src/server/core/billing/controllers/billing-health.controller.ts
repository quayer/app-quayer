/**
 * Billing Health Controller
 *
 * Public endpoint that reports the health/readiness of the billing subsystem.
 * Checks gateway configuration, required env vars, and DB statistics.
 */

import { igniter } from '@/igniter';
import { getDatabase } from '@/server/services/database';
import { getGatewayMode, isNfseAvailable } from '../services/gateway-factory';

interface EnvCheck {
  name: string;
  set: boolean;
}

function checkEnv(name: string): EnvCheck {
  return { name, set: !!process.env[name] };
}

export const billingHealthController = igniter.controller({
  name: 'billing-health',
  path: '/billing-health',
  actions: {
    check: igniter.query({
      path: '/',
      method: 'GET',
      handler: async ({ response }) => {
        const startTime = Date.now();
        const mode = getGatewayMode();
        const nfseAvailable = isNfseAvailable();
        const issues: string[] = [];

        // ── 1. Gateway mode ─────────────────────────────────────────────
        const gatewayMode = {
          mode,
          nfseAvailable,
        };

        // ── 2. Env var checks per provider ──────────────────────────────
        const efiEnvVars: EnvCheck[] = [];
        const asaasEnvVars: EnvCheck[] = [];

        if (mode === 'EFI_ONLY' || mode === 'HYBRID') {
          const efiRequired = [
            'EFI_CLIENT_ID',
            'EFI_CLIENT_SECRET',
            'EFI_CERTIFICATE_PATH',
            'EFI_PIX_KEY',
            'EFI_BANK_ACCOUNT',
            'EFI_BANK_AGENCY',
          ];
          for (const name of efiRequired) {
            const check = checkEnv(name);
            efiEnvVars.push(check);
            if (!check.set) {
              issues.push(`Missing env var: ${name} (required for EFI)`);
            }
          }

          const efiWebhook = checkEnv('EFI_WEBHOOK_SECRET');
          efiEnvVars.push(efiWebhook);
          if (!efiWebhook.set) {
            issues.push('Missing env var: EFI_WEBHOOK_SECRET (recommended for EFI webhook validation)');
          }
        }

        if (mode === 'ASAAS_ONLY' || mode === 'HYBRID') {
          const asaasApiKey = checkEnv('ASAAS_API_KEY');
          asaasEnvVars.push(asaasApiKey);
          if (!asaasApiKey.set) {
            issues.push('Missing env var: ASAAS_API_KEY (required for ASAAS)');
          }
        }

        if (nfseAvailable) {
          const webhookToken = checkEnv('ASAAS_WEBHOOK_TOKEN');
          asaasEnvVars.push(webhookToken);
          if (!webhookToken.set) {
            issues.push('Missing env var: ASAAS_WEBHOOK_TOKEN (required for NFS-e webhook)');
          }
        }

        // ── 3. DB statistics ────────────────────────────────────────────
        let dbStats = {
          activePlans: 0,
          activeSubscriptions: 0,
          stuckInvoices: 0,
        };

        try {
          const db = getDatabase();

          const [activePlans, activeSubscriptions, stuckInvoices] = await Promise.all([
            db.plan.count({ where: { isActive: true } }),
            db.subscription.count({ where: { status: 'ACTIVE', isCurrent: true } }),
            db.invoice.count({
              where: {
                status: 'PROCESSING',
                updatedAt: {
                  lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
              },
            }),
          ]);

          dbStats = { activePlans, activeSubscriptions, stuckInvoices };

          if (stuckInvoices > 0) {
            issues.push(`${stuckInvoices} invoice(s) stuck in PROCESSING for >24h`);
          }
        } catch (error) {
          issues.push('Database query failed: ' + (error instanceof Error ? error.message : String(error)));
        }

        // ── 4. Build response ───────────────────────────────────────────
        const status = issues.length === 0 ? 'healthy' : 'degraded';
        const responseTime = Date.now() - startTime;

        return response.success({
          status,
          timestamp: new Date().toISOString(),
          responseTime: `${responseTime}ms`,
          gateway: gatewayMode,
          envVars: {
            ...(efiEnvVars.length > 0 ? { efi: efiEnvVars } : {}),
            ...(asaasEnvVars.length > 0 ? { asaas: asaasEnvVars } : {}),
          },
          database: dbStats,
          issues,
        });
      },
    }),
  },
});
