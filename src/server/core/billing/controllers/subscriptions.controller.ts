/**
 * Subscriptions Controller - Manage organization subscriptions
 *
 * All routes require authentication. Operations are scoped to the user's current organization.
 */

import { igniter } from '@/igniter';
import { billingRepository } from '../billing.repository';
import {
  createSubscriptionSchema,
  cancelSubscriptionSchema,
  changePlanSchema,
} from '../billing.schemas';
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure';
import { csrfProcedure } from '@/server/core/auth/procedures/csrf.procedure';
import { getDatabase } from '@/server/services/database';
import { getPaymentGateway, getDefaultPaymentProvider } from '../services/gateway-factory';
import { efiGateway } from '../services/efi-gateway.service';
import type { GatewayProvider } from '../services/gateway.interface';

export const subscriptionsController = igniter.controller({
  name: 'subscriptions',
  path: '/subscriptions',
  actions: {
    // GET current subscription for user's organization
    current: igniter.query({
      path: '/current',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const orgId = user.currentOrgId;
        if (!orgId) {
          return response.badRequest('Usuário não possui organização ativa');
        }

        const subscription = await billingRepository.findCurrentSubscription(orgId);

        if (!subscription) {
          return response.success({ subscription: null, message: 'Nenhuma assinatura ativa' });
        }

        return response.success({ subscription });
      },
    }),

    // CREATE subscription (generates first invoice)
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      body: createSubscriptionSchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const orgId = user.currentOrgId;
        if (!orgId) {
          return response.badRequest('Usuário não possui organização ativa');
        }

        // Check for existing active subscription
        const existing = await billingRepository.findCurrentSubscription(orgId);
        if (existing) {
          return response.badRequest(
            'Organização já possui uma assinatura ativa. Use a troca de plano para alterar.'
          );
        }

        // Validate plan exists and is active
        const plan = await billingRepository.findPlanById(request.body.planId);
        if (!plan) {
          return response.notFound('Plano não encontrado');
        }
        if (!plan.isActive) {
          return response.badRequest('Plano não está disponível');
        }

        // Calculate period
        const now = new Date();
        const periodEnd = new Date(now);
        if (request.body.billingCycle === 'YEARLY') {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else if (request.body.billingCycle === 'QUARTERLY') {
          periodEnd.setMonth(periodEnd.getMonth() + 3);
        } else {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        // Calculate price based on billing cycle
        const currentPriceCents =
          request.body.billingCycle === 'YEARLY' && plan.priceYearly
            ? plan.priceYearly
            : request.body.billingCycle === 'QUARTERLY'
              ? plan.priceMonthly * 3
              : plan.priceMonthly;

        const billingCycle = request.body.billingCycle;
        const paymentMethod = request.body.paymentMethod;
        const gatewayProvider = (request.body.gateway || getDefaultPaymentProvider()) as GatewayProvider;
        const priceCents = currentPriceCents;

        // Wrap subscription + invoice creation in a transaction for atomicity
        const db = getDatabase();
        const result = await db.$transaction(async (tx) => {
          const subscription = await tx.subscription.create({
            data: {
              organizationId: orgId,
              planId: request.body.planId,
              status: 'ACTIVE',
              billingCycle,
              paymentMethod,
              gateway: gatewayProvider,
              isCurrent: true,
              startDate: now,
              endDate: periodEnd,
              nextBillingDate: periodEnd,
              currentPriceCents,
            },
            include: { plan: true },
          });

          // Generate first invoice (skip for free plans)
          let invoice = null;
          if (!plan.isFree) {
            const dueDate = new Date(now);
            dueDate.setDate(dueDate.getDate() + 3); // 3 days to pay

            invoice = await tx.invoice.create({
              data: {
                organizationId: orgId,
                subscriptionId: subscription.id,
                status: 'PENDING',
                totalCents: currentPriceCents,
                description: `Assinatura ${plan.name} - ${request.body.billingCycle === 'YEARLY' ? 'Anual' : request.body.billingCycle === 'QUARTERLY' ? 'Trimestral' : 'Mensal'}`,
                issuedAt: now,
                dueDate,
                gateway: request.body.gateway,
              },
            });
            // TODO: Generate PDF asynchronously via job queue
            // invoicePdfService.generateInvoicePdf(invoiceData) → save pdfUrl
          }

          return { subscription, invoice };
        });

        // After DB subscription creation, set up gateway subscription (non-free plans only)
        if (!plan.isFree) {
          const gateway = getPaymentGateway(gatewayProvider);
          const org = await db.organization.findUnique({ where: { id: orgId } });

          try {
            const gatewayResult = await gateway.createRecurringSubscription({
              orgId,
              customerName: org?.name || '',
              customerDocument: org?.document || '',
              customerEmail: user.email || '',
              valueCents: priceCents,
              description: `Quayer ${plan.name} - ${billingCycle}`,
              billingCycle: billingCycle as 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
              paymentMethod: (paymentMethod === 'PIX_AUTO' || paymentMethod === 'PIX_MANUAL' ? 'PIX' : paymentMethod ?? 'PIX') as 'PIX' | 'CREDIT_CARD' | 'BOLETO',
              startDate: new Date().toISOString().split('T')[0],
              creditCardToken: request.body.creditCardToken,
              remoteIp: request.body.remoteIp,
            });

            // Update subscription with gateway IDs (gatewaySubId stores Efí locationId)
            await db.subscription.update({
              where: { id: result.subscription.id },
              data: {
                pixAuthorizationId: gatewayResult.gatewaySubscriptionId,
                ...(gatewayResult.locationId != null && {
                  gatewaySubId: String(gatewayResult.locationId),
                }),
              },
            });
          } catch (gatewayError) {
            console.error('[Subscriptions] Gateway setup failed:', gatewayError);
            // Mark subscription as needing gateway setup
            await db.subscription.update({
              where: { id: result.subscription.id },
              data: { status: 'PAST_DUE' },
            });
            // Return success but with gateway failure warning so frontend can show retry
            return response.created({
              message: 'Assinatura criada, mas configuração do gateway falhou',
              subscription: result.subscription,
              invoice: result.invoice,
              gatewaySetupFailed: true,
              gatewayError: gatewayError instanceof Error ? gatewayError.message : 'Gateway setup failed',
            });
          }
        }

        return response.created({
          message: 'Assinatura criada',
          subscription: result.subscription,
          invoice: result.invoice,
          gatewaySetupFailed: false,
        });
      },
    }),

    // CANCEL subscription
    cancel: igniter.mutation({
      path: '/cancel',
      method: 'POST',
      body: cancelSubscriptionSchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const orgId = user.currentOrgId;
        if (!orgId) {
          return response.badRequest('Usuário não possui organização ativa');
        }

        // Only org masters or system admins can cancel subscriptions
        const orgRole = (user as any).organizationRole;
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas administradores da organização podem cancelar assinaturas');
        }

        const current = await billingRepository.findCurrentSubscription(orgId);
        if (!current) {
          return response.notFound('Nenhuma assinatura ativa encontrada');
        }

        if (current.status === 'CANCELED') {
          return response.badRequest('Assinatura já está cancelada');
        }

        // Cancel at gateway level first
        if (current.pixAuthorizationId) {
          try {
            const gateway = getPaymentGateway(current.gateway as GatewayProvider);
            await gateway.cancelSubscription(current.pixAuthorizationId);
            console.log(`[Subscriptions] Gateway subscription canceled: ${current.pixAuthorizationId}`);
          } catch (error) {
            console.error('[Subscriptions] Gateway cancellation failed:', error);
            // Continue with local cancellation even if gateway fails
          }
        }

        // Cancel locally
        // TODO: pass request.body.reason to repository once cancelSubscription accepts it
        const subscription = await billingRepository.cancelSubscription(
          current.id
        );

        return response.success({
          message: 'Assinatura cancelada. Acesso mantido até o fim do período atual.',
          subscription,
        });
      },
    }),

    // CHANGE PLAN (upgrade/downgrade)
    changePlan: igniter.mutation({
      path: '/change-plan',
      method: 'POST',
      body: changePlanSchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const orgId = user.currentOrgId;
        if (!orgId) {
          return response.badRequest('Usuário não possui organização ativa');
        }

        // Only org masters or system admins can change plans
        const orgRole = (user as any).organizationRole;
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas administradores da organização podem alterar o plano');
        }

        const current = await billingRepository.findCurrentSubscription(orgId);
        if (!current) {
          return response.notFound('Nenhuma assinatura ativa encontrada');
        }

        if (current.planId === request.body.planId) {
          return response.badRequest('Organização já está neste plano');
        }

        // Validate new plan
        const newPlan = await billingRepository.findPlanById(request.body.planId);
        if (!newPlan) {
          return response.notFound('Plano não encontrado');
        }
        if (!newPlan.isActive) {
          return response.badRequest('Plano não está disponível');
        }

        const billingCycle = request.body.billingCycle ?? current.billingCycle;

        // Calculate new period
        const now = new Date();
        const periodEnd = new Date(now);
        if (billingCycle === 'YEARLY') {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else if (billingCycle === 'QUARTERLY') {
          periodEnd.setMonth(periodEnd.getMonth() + 3);
        } else {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        // Calculate new price based on billing cycle
        const newPriceCents =
          billingCycle === 'YEARLY' && newPlan.priceYearly
            ? newPlan.priceYearly
            : billingCycle === 'QUARTERLY'
              ? newPlan.priceMonthly * 3
              : newPlan.priceMonthly;

        // Wrap subscription update + invoice creation in a transaction for atomicity
        const db = getDatabase();
        const result = await db.$transaction(async (tx) => {
          const subscription = await tx.subscription.update({
            where: { id: current.id },
            data: {
              planId: request.body.planId,
              billingCycle,
              startDate: now,
              endDate: periodEnd,
              nextBillingDate: periodEnd,
              currentPriceCents: newPriceCents,
              status: 'ACTIVE',
            },
            include: { plan: true },
          });

          // Generate invoice for paid plans
          // TODO: Implement proper proration based on remaining days in current cycle
          let invoice = null;
          if (!newPlan.isFree) {
            const dueDate = new Date(now);
            dueDate.setDate(dueDate.getDate() + 3);

            invoice = await tx.invoice.create({
              data: {
                organizationId: orgId,
                subscriptionId: current.id,
                status: 'PENDING',
                totalCents: newPriceCents,
                description: `Troca de plano para ${newPlan.name} - ${billingCycle === 'YEARLY' ? 'Anual' : billingCycle === 'QUARTERLY' ? 'Trimestral' : 'Mensal'}`,
                issuedAt: now,
                dueDate,
                gateway: current.gateway,
              },
            });
            // TODO: Generate PDF asynchronously via job queue
            // invoicePdfService.generateInvoicePdf(invoiceData) → save pdfUrl
          }

          return { subscription, invoice };
        });

        // After DB transaction, update gateway subscription
        let gatewaySetupFailed = false;
        let gatewayErrorMessage: string | undefined;
        if (!newPlan.isFree && current.gateway) {
          try {
            const gateway = getPaymentGateway(current.gateway as GatewayProvider);
            const org = await db.organization.findUnique({ where: { id: orgId } });

            // Cancel old gateway subscription
            if (current.pixAuthorizationId) {
              await gateway.cancelSubscription(current.pixAuthorizationId);
            }

            // Create new gateway subscription with updated price
            const gatewayResult = await gateway.createRecurringSubscription({
              orgId,
              customerName: org?.name || '',
              customerDocument: org?.document || '',
              customerEmail: user.email || '',
              valueCents: newPriceCents,
              description: `Quayer ${newPlan.name} - ${billingCycle}`,
              billingCycle: billingCycle as 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
              paymentMethod: (current.paymentMethod === 'PIX_AUTO' || current.paymentMethod === 'PIX_MANUAL' ? 'PIX' : current.paymentMethod ?? 'PIX') as 'PIX' | 'CREDIT_CARD' | 'BOLETO',
              startDate: new Date().toISOString().split('T')[0],
            });

            // Update subscription with new gateway IDs (gatewaySubId stores Efí locationId)
            await db.subscription.update({
              where: { id: current.id },
              data: {
                pixAuthorizationId: gatewayResult.gatewaySubscriptionId,
                ...(gatewayResult.locationId != null && {
                  gatewaySubId: String(gatewayResult.locationId),
                }),
              },
            });
          } catch (error) {
            console.error('[Subscriptions] Gateway plan change failed:', error);
            gatewaySetupFailed = true;
            gatewayErrorMessage = error instanceof Error ? error.message : 'Gateway plan change failed';
          }
        }

        return response.success({
          message: gatewaySetupFailed
            ? 'Plano alterado, mas atualização do gateway falhou'
            : 'Plano alterado com sucesso',
          subscription: result.subscription,
          invoice: result.invoice,
          gatewaySetupFailed,
          ...(gatewayErrorMessage && { gatewayError: gatewayErrorMessage }),
        });
      },
    }),

    // RETRY gateway setup for subscriptions that failed initial gateway creation
    retryGatewaySetup: igniter.mutation({
      path: '/:id/retry-gateway',
      method: 'POST',
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticacao necessaria');
        }

        const orgId = user.currentOrgId;
        if (!orgId) {
          return response.badRequest('Usuario nao possui organizacao ativa');
        }

        // Only org masters or system admins can retry gateway setup
        const orgRole = (user as any).organizationRole;
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas administradores da organizacao podem reconfigurar o gateway');
        }

        const db = getDatabase();
        const subscriptionId = (request as any).params?.id;

        if (!subscriptionId) {
          return response.badRequest('ID da assinatura e obrigatorio');
        }

        // Find subscription, verify it belongs to user's org
        const subscription = await db.subscription.findFirst({
          where: { id: subscriptionId, organizationId: orgId },
          include: { plan: true },
        });

        if (!subscription) {
          return response.notFound('Assinatura nao encontrada');
        }

        // Verify it actually needs a retry (no pixAuthorizationId, or status PAST_DUE)
        if (subscription.pixAuthorizationId && subscription.status !== 'PAST_DUE') {
          return response.badRequest(
            'Assinatura ja possui configuracao de gateway ativa. Use troca de plano para alterar.'
          );
        }

        // Skip retry for free plans
        if (subscription.plan.isFree) {
          return response.badRequest('Planos gratuitos nao necessitam de configuracao de gateway');
        }

        // Fetch organization data for gateway call
        const org = await db.organization.findUnique({ where: { id: orgId } });

        const gatewayProvider = (subscription.gateway || getDefaultPaymentProvider()) as GatewayProvider;
        const gateway = getPaymentGateway(gatewayProvider);

        try {
          const gatewayResult = await gateway.createRecurringSubscription({
            orgId,
            customerName: org?.name || '',
            customerDocument: org?.document || '',
            customerEmail: user.email || '',
            valueCents: subscription.currentPriceCents,
            description: `Quayer ${subscription.plan.name} - ${subscription.billingCycle}`,
            billingCycle: subscription.billingCycle as 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
            paymentMethod: (subscription.paymentMethod === 'PIX_AUTO' || subscription.paymentMethod === 'PIX_MANUAL' ? 'PIX' : subscription.paymentMethod ?? 'PIX') as 'PIX' | 'CREDIT_CARD' | 'BOLETO',
            startDate: new Date().toISOString().split('T')[0],
          });

          // Update subscription with gateway IDs and restore ACTIVE status
          const updated = await db.subscription.update({
            where: { id: subscription.id },
            data: {
              pixAuthorizationId: gatewayResult.gatewaySubscriptionId,
              status: 'ACTIVE',
              ...(gatewayResult.locationId != null && {
                gatewaySubId: String(gatewayResult.locationId),
              }),
            },
            include: { plan: true },
          });

          console.log(
            `[Subscriptions] Gateway retry succeeded for subscription ${subscription.id}: idRec=${gatewayResult.gatewaySubscriptionId}`
          );

          return response.success({
            message: 'Gateway configurado com sucesso',
            subscription: updated,
            gatewaySetupFailed: false,
            qrCodePayload: gatewayResult.qrCodePayload,
            qrCodeImage: gatewayResult.qrCodeImage,
          });
        } catch (gatewayError) {
          console.error('[Subscriptions] Gateway retry failed:', gatewayError);

          return response.badRequest(
            'Falha ao configurar gateway. Tente novamente mais tarde.'
          );
        }
      },
    }),

    // GET QR code for a subscription's Pix authorization location
    getQRCode: igniter.query({
      path: '/:id/qrcode',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticacao necessaria');
        }

        const orgId = user.currentOrgId;
        if (!orgId) {
          return response.badRequest('Usuario nao possui organizacao ativa');
        }

        const subscriptionId = (request as any).params?.id;

        if (!subscriptionId) {
          return response.badRequest('ID da assinatura e obrigatorio');
        }

        const db = getDatabase();
        const subscription = await db.subscription.findFirst({
          where: { id: subscriptionId, organizationId: orgId },
        });

        if (!subscription) {
          return response.notFound('Assinatura nao encontrada');
        }

        // Verify it's an EFI gateway subscription with a stored locationId
        if (subscription.gateway !== 'EFI') {
          return response.badRequest('QR code so esta disponivel para assinaturas Efi (Pix Automatico)');
        }

        const locationId = subscription.gatewaySubId
          ? parseInt(subscription.gatewaySubId, 10)
          : null;

        if (!locationId || isNaN(locationId)) {
          return response.badRequest(
            'Assinatura nao possui locationId do gateway. Execute retry-gateway primeiro.'
          );
        }

        try {
          const qrData = await efiGateway.generateQRCode(locationId);

          return response.success({
            qrCodeImage: qrData.qrCodeImage,
            qrCodePayload: qrData.qrCodePayload,
            locationId,
          });
        } catch (error) {
          console.error('[Subscriptions] QR code generation failed:', error);

          return response.badRequest(
            'Falha ao gerar QR code. Tente novamente mais tarde.'
          );
        }
      },
    }),
  },
});
