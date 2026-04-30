/**
 * Billing Feature - Type Definitions
 *
 * All monetary values are in CENTAVOS (Int). 14900 = R$ 149,00
 * Types match Prisma schema exactly.
 */

// ============================================
// ENUMS (match Prisma enums exactly)
// ============================================

export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export type PaymentMethod = 'PIX_AUTO' | 'PIX_MANUAL' | 'CREDIT_CARD' | 'BOLETO';

export type GatewayMode = 'EFI_ONLY' | 'ASAAS_ONLY' | 'HYBRID';

export type PaymentGateway = 'EFI' | 'ASAAS';

export type SubscriptionStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'SUSPENDED';

export type InvoiceStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'PROCESSING'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELED'
  | 'REFUNDED';

export type NfseStatus =
  | 'PENDING_NFSE'
  | 'SCHEDULED'
  | 'AUTHORIZED'
  | 'DENIED'
  | 'ERROR_NFSE';

export type WebhookEventStatus = 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

// ============================================
// PLAN
// ============================================

export interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number; // centavos
  priceYearly: number | null; // centavos
  currency: string;
  maxUsers: number;
  maxInstances: number;
  maxMessages: number;
  maxStorage: number; // MB
  maxAiCredits: number;
  maxContacts: number;
  hasWebhooks: boolean;
  hasApi: boolean;
  hasCustomRoles: boolean;
  hasSso: boolean;
  hasAiAgents: boolean;
  hasPrioritySupport: boolean;
  isActive: boolean;
  isFree: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// SUBSCRIPTION
// ============================================

export interface Subscription {
  id: string;
  organizationId: string;
  planId: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  isCurrent: boolean;
  startDate: Date;
  endDate: Date | null;
  nextBillingDate: Date | null;
  canceledAt: Date | null;
  trialEndsAt: Date | null;
  gateway: PaymentGateway;
  gatewayCustomerId: string | null;
  gatewaySubId: string | null;
  pixAuthorizationId: string | null;
  paymentMethod: PaymentMethod;
  lastPaymentDate: Date | null;
  currentPriceCents: number;
  discountCents: number;
  gracePeriodEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionWithPlan extends Subscription {
  plan: Plan;
}

// ============================================
// INVOICE
// ============================================

export interface Invoice {
  id: string;
  subscriptionId: string;
  organizationId: string;
  number: number;
  description: string;
  totalCents: number; // centavos
  status: InvoiceStatus;
  issuedAt: Date;
  dueDate: Date;
  paidAt: Date | null;
  gateway: PaymentGateway;
  gatewayPaymentId: string | null;
  gatewayPixTxId: string | null;
  nfseStatus: NfseStatus | null;
  nfseId: string | null;
  nfseUrl: string | null;
  pdfUrl: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// USAGE RECORD
// ============================================

export interface UsageRecord {
  id: string;
  organizationId: string;
  period: string; // e.g. "2026-04"
  messagesUsed: number;
  storageUsedMb: number;
  aiCreditsUsed: number;
  contactsCount: number;
  apiCallsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// WEBHOOK EVENT
// ============================================

export interface WebhookEvent {
  id: string;
  gatewayEventId: string;
  gateway: PaymentGateway;
  eventType: string;
  status: WebhookEventStatus;
  payload: unknown;
  processedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

// ============================================
// API INPUT / RESPONSE TYPES
// ============================================

export interface CreatePlanInput {
  name: string;
  slug: string;
  description?: string;
  priceMonthly: number;
  priceYearly?: number;
  currency?: string;
  maxUsers: number;
  maxInstances: number;
  maxMessages: number;
  maxStorage: number;
  maxAiCredits: number;
  maxContacts: number;
  hasWebhooks?: boolean;
  hasApi?: boolean;
  hasCustomRoles?: boolean;
  hasSso?: boolean;
  hasAiAgents?: boolean;
  hasPrioritySupport?: boolean;
  isFree?: boolean;
  sortOrder?: number;
}

export interface UpdatePlanInput extends Partial<CreatePlanInput> {}

export interface CreateSubscriptionInput {
  planId: string;
  billingCycle: BillingCycle;
  paymentMethod: PaymentMethod;
  gateway: PaymentGateway;
}

export interface CancelSubscriptionInput {
  reason?: string;
}

export interface ListInvoicesQuery {
  status?: InvoiceStatus;
  page?: number;
  limit?: number;
}

export interface ChangePlanInput {
  planId: string;
  billingCycle?: BillingCycle;
}

export interface PaginatedInvoicesResponse {
  data: Invoice[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
