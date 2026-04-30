/**
 * Billing Repository
 * Data access layer for Plans, Subscriptions, Invoices, Usage, and WebhookEvents
 *
 * All monetary values are in CENTAVOS (Int). 14900 = R$ 149,00
 * Field names and enum values match Prisma schema exactly.
 */

import { getDatabase } from '@/server/services/database';
import type {
  Plan as PrismaPlan,
  Subscription as PrismaSubscription,
  Invoice as PrismaInvoice,
  UsageRecord as PrismaUsageRecord,
  WebhookEvent as PrismaWebhookEvent,
  Prisma,
} from '@prisma/client';
import type {
  Plan,
  Subscription,
  SubscriptionWithPlan,
  Invoice,
  UsageRecord,
  WebhookEvent,
  CreatePlanInput,
  UpdatePlanInput,
  CreateSubscriptionInput,
  ListInvoicesQuery,
  InvoiceStatus,
  PaymentGateway,
} from './billing.interfaces';
import type { GatewayProvider } from './services/gateway.interface';

export class BillingRepository {
  // ============================================
  // PLANS
  // ============================================

  /**
   * List all active plans, ordered by sortOrder
   */
  async findAllPlans(): Promise<PrismaPlan[]> {
    return getDatabase().plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Find plan by slug
   */
  async findPlanBySlug(slug: string): Promise<PrismaPlan | null> {
    return getDatabase().plan.findUnique({
      where: { slug },
    });
  }

  /**
   * Find plan by ID
   */
  async findPlanById(id: string): Promise<PrismaPlan | null> {
    return getDatabase().plan.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new plan
   */
  async createPlan(data: CreatePlanInput): Promise<PrismaPlan> {
    return getDatabase().plan.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        priceMonthly: data.priceMonthly,
        priceYearly: data.priceYearly ?? null,
        currency: data.currency ?? 'BRL',
        maxUsers: data.maxUsers,
        maxInstances: data.maxInstances,
        maxMessages: data.maxMessages,
        maxStorage: data.maxStorage,
        maxAiCredits: data.maxAiCredits,
        maxContacts: data.maxContacts,
        hasWebhooks: data.hasWebhooks ?? false,
        hasApi: data.hasApi ?? false,
        hasCustomRoles: data.hasCustomRoles ?? false,
        hasSso: data.hasSso ?? false,
        hasAiAgents: data.hasAiAgents ?? false,
        hasPrioritySupport: data.hasPrioritySupport ?? false,
        isFree: data.isFree ?? false,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  /**
   * Update an existing plan
   */
  async updatePlan(id: string, data: UpdatePlanInput): Promise<PrismaPlan> {
    return getDatabase().plan.update({
      where: { id },
      data,
    });
  }

  // ============================================
  // SUBSCRIPTIONS
  // ============================================

  /**
   * Find current active subscription for an organization
   */
  async findCurrentSubscription(organizationId: string) {
    return getDatabase().subscription.findFirst({
      where: {
        organizationId,
        status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create a new subscription
   */
  async createSubscription(
    organizationId: string,
    data: CreateSubscriptionInput & {
      startDate: Date;
      endDate?: Date;
      nextBillingDate?: Date;
      currentPriceCents: number;
      discountCents?: number;
      status?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';
      trialEndsAt?: Date;
      isCurrent?: boolean;
    }
  ) {
    return getDatabase().subscription.create({
      data: {
        organizationId,
        planId: data.planId,
        status: data.status ?? 'ACTIVE',
        billingCycle: data.billingCycle,
        paymentMethod: data.paymentMethod,
        gateway: data.gateway,
        isCurrent: data.isCurrent ?? true,
        startDate: data.startDate,
        endDate: data.endDate ?? null,
        nextBillingDate: data.nextBillingDate ?? null,
        currentPriceCents: data.currentPriceCents,
        discountCents: data.discountCents ?? 0,
        trialEndsAt: data.trialEndsAt ?? null,
      },
      include: { plan: true },
    });
  }

  /**
   * Update a subscription
   */
  async updateSubscription(
    id: string,
    data: Partial<{
      status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';
      planId: string;
      billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
      paymentMethod: 'PIX_AUTO' | 'PIX_MANUAL' | 'CREDIT_CARD' | 'BOLETO';
      gateway: GatewayProvider;
      gatewayCustomerId: string | null;
      gatewaySubId: string | null;
      pixAuthorizationId: string | null;
      isCurrent: boolean;
      startDate: Date;
      endDate: Date | null;
      nextBillingDate: Date | null;
      canceledAt: Date | null;
      trialEndsAt: Date | null;
      lastPaymentDate: Date | null;
      currentPriceCents: number;
      discountCents: number;
      gracePeriodEndsAt: Date | null;
    }>
  ) {
    return getDatabase().subscription.update({
      where: { id },
      data,
      include: { plan: true },
    });
  }

  /**
   * Cancel a subscription (soft cancel - sets canceledAt and status)
   */
  async cancelSubscription(id: string) {
    return getDatabase().subscription.update({
      where: { id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
      },
      include: { plan: true },
    });
  }

  // ============================================
  // INVOICES
  // ============================================

  /**
   * List invoices for an organization with pagination and filters
   */
  async findInvoicesByOrg(
    organizationId: string,
    query: ListInvoicesQuery
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {
      organizationId,
      ...(query.status && { status: query.status }),
    };

    const [data, total] = await Promise.all([
      getDatabase().invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      getDatabase().invoice.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find invoice by ID (scoped to organization)
   */
  async findInvoiceById(id: string, organizationId: string): Promise<PrismaInvoice | null> {
    return getDatabase().invoice.findFirst({
      where: { id, organizationId },
    });
  }

  /**
   * Create a new invoice
   */
  async createInvoice(data: {
    organizationId: string;
    subscriptionId: string;
    description: string;
    totalCents: number;
    issuedAt: Date;
    dueDate: Date;
    gateway: GatewayProvider;
    status?: 'DRAFT' | 'PENDING' | 'PROCESSING' | 'PAID' | 'OVERDUE' | 'CANCELED' | 'REFUNDED';
  }): Promise<PrismaInvoice> {
    return getDatabase().invoice.create({
      data: {
        organizationId: data.organizationId,
        subscriptionId: data.subscriptionId,
        description: data.description,
        totalCents: data.totalCents,
        status: data.status ?? 'PENDING',
        issuedAt: data.issuedAt,
        dueDate: data.dueDate,
        gateway: data.gateway,
      },
    });
  }

  /**
   * Update invoice status (and optionally payment details)
   */
  async updateInvoiceStatus(
    id: string,
    data: Partial<{
      status: 'DRAFT' | 'PENDING' | 'PROCESSING' | 'PAID' | 'OVERDUE' | 'CANCELED' | 'REFUNDED';
      gatewayPaymentId: string | null;
      gatewayPixTxId: string | null;
      nfseStatus: 'PENDING_NFSE' | 'SCHEDULED' | 'SYNCHRONIZED' | 'AUTHORIZED' | 'PROCESSING_CANCELLATION' | 'CANCELED' | 'CANCELLATION_DENIED' | 'ERROR_NFSE' | null;
      nfseId: string | null;
      nfseUrl: string | null;
      pdfUrl: string | null;
      paidAt: Date | null;
    }>
  ): Promise<PrismaInvoice> {
    return getDatabase().invoice.update({
      where: { id },
      data,
    });
  }

  // ============================================
  // USAGE RECORDS
  // ============================================

  /**
   * Find or create a usage record for an organization in a given period
   */
  async findOrCreateUsageRecord(organizationId: string, period: string): Promise<PrismaUsageRecord> {
    const existing = await getDatabase().usageRecord.findFirst({
      where: { organizationId, period },
    });

    if (existing) {
      return existing;
    }

    return getDatabase().usageRecord.create({
      data: {
        organizationId,
        period,
        messagesUsed: 0,
        storageUsedMb: 0,
        aiCreditsUsed: 0,
        contactsCount: 0,
        apiCallsCount: 0,
      },
    });
  }

  /**
   * Increment a usage field for an organization in the current period
   */
  async incrementUsage(
    organizationId: string,
    field: 'messagesUsed' | 'storageUsedMb' | 'aiCreditsUsed' | 'contactsCount' | 'apiCallsCount',
    amount: number
  ): Promise<PrismaUsageRecord> {
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return getDatabase().usageRecord.upsert({
      where: {
        organizationId_period: { organizationId, period },
      },
      create: {
        organizationId,
        period,
        [field]: amount,
      },
      update: {
        [field]: { increment: amount },
      },
    });
  }

  // ============================================
  // WEBHOOK EVENTS
  // ============================================

  /**
   * Find webhook event by gateway event ID (idempotency check)
   */
  async findByGatewayEventId(
    gateway: GatewayProvider,
    gatewayEventId: string
  ): Promise<PrismaWebhookEvent | null> {
    return getDatabase().webhookEvent.findFirst({
      where: { gateway, gatewayEventId },
    });
  }

  /**
   * Create a new webhook event record
   */
  async createWebhookEvent(data: {
    gateway: GatewayProvider;
    gatewayEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<PrismaWebhookEvent> {
    return getDatabase().webhookEvent.create({
      data: {
        gateway: data.gateway,
        gatewayEventId: data.gatewayEventId,
        eventType: data.eventType,
        payload: data.payload as Prisma.InputJsonValue,
        status: 'RECEIVED',
      },
    });
  }

  /**
   * Mark webhook event as processed
   */
  async markProcessed(id: string): Promise<PrismaWebhookEvent> {
    return getDatabase().webhookEvent.update({
      where: { id },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });
  }

  /**
   * Mark webhook event as failed
   */
  async markFailed(id: string, errorMessage: string): Promise<PrismaWebhookEvent> {
    return getDatabase().webhookEvent.update({
      where: { id },
      data: {
        status: 'FAILED',
        errorMessage,
      },
    });
  }
}

// Export singleton instance
export const billingRepository = new BillingRepository();
