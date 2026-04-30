/**
 * Payment Gateway - Abstract Interface
 *
 * Generalized for multiple gateways (Efí Bank, Asaas).
 * All monetary values in CENTAVOS (Int). 14900 = R$ 149,00
 */

export type GatewayMode = 'EFI_ONLY' | 'ASAAS_ONLY' | 'HYBRID';
export type GatewayProvider = 'EFI' | 'ASAAS';

// ── Customer ─────────────────────────────────────────────
export interface CreateCustomerData {
  name: string;
  document: string; // CPF or CNPJ
  email: string;
}

export interface CreateCustomerResult {
  gatewayCustomerId: string;
}

// ── Recurring Subscription ───────────────────────────────
// Generic: Efí uses Pix Automático Jornada 3, Asaas uses POST /v3/subscriptions
export interface CreateRecurringSubscriptionData {
  orgId: string;
  customerName: string;
  customerDocument: string;
  customerEmail: string;
  gatewayCustomerId?: string; // Required for Asaas (cus_xxx), optional for Efí
  valueCents: number;
  description: string;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  paymentMethod: 'PIX' | 'CREDIT_CARD' | 'BOLETO';
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  /** Asaas credit card token from client-side tokenization (POST /v3/creditCard/tokenize) */
  creditCardToken?: string;
  /** Remote IP of the customer (required by Asaas for tokenized payments) */
  remoteIp?: string;
}

export interface CreateRecurringSubscriptionResult {
  gatewaySubscriptionId: string; // idRec (Efí) or sub_xxx (Asaas)
  status: string;
  // Efí: QR code for Pix Automático authorization
  qrCodePayload?: string;
  qrCodeImage?: string;
  locationId?: number;
  contractId?: string;
  // Asaas: invoice/payment URLs
  invoiceUrl?: string;
  paymentLink?: string;
}

// ── Charge ───────────────────────────────────────────────
export interface CreateChargeData {
  gatewaySubscriptionId: string; // idRec (Efí) or subscription payment ID (Asaas)
  gatewayCustomerId?: string; // cus_xxx (Asaas) — required for Asaas manual charges
  valueCents: number;
  dueDate: string; // YYYY-MM-DD
  description: string;
}

export interface CreateChargeResult {
  gatewayPaymentId: string; // txid (Efí) or pay_xxx (Asaas)
  status: string;
  pixPayload?: string; // Pix copia-e-cola for manual payment
  invoiceUrl?: string; // Asaas invoice URL
}

// ── Cancel ───────────────────────────────────────────────
export interface CancelSubscriptionResult {
  success: boolean;
}

// ── Main Interface ───────────────────────────────────────
export interface PaymentGatewayService {
  readonly providerName: GatewayProvider;

  createCustomer(data: CreateCustomerData): Promise<CreateCustomerResult>;

  /**
   * Creates a recurring subscription/authorization.
   * - Efí: 3-step Pix Automático Jornada 3 (location → recurrence → QR code)
   * - Asaas: POST /v3/subscriptions (PIX, CREDIT_CARD, or BOLETO)
   *
   * IMPORTANT: Do NOT call inside a Prisma transaction.
   */
  createRecurringSubscription(
    data: CreateRecurringSubscriptionData
  ): Promise<CreateRecurringSubscriptionResult>;

  /**
   * Creates a charge against an existing subscription.
   * - Efí: POST /v2/cobr with idRec
   * - Asaas: usually automatic (Asaas creates charges per cycle), but can be manual
   *
   * IMPORTANT: Do NOT call inside a Prisma transaction.
   */
  createCharge(data: CreateChargeData): Promise<CreateChargeResult>;

  cancelSubscription(subscriptionId: string): Promise<CancelSubscriptionResult>;

  verifyWebhookSignature(payload: string, signature: string): boolean;
}
