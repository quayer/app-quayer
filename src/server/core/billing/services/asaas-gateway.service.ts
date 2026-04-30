// TODO: Extract shared AsaasHttpClient to reduce duplication with asaas-nfse.service.ts

/**
 * Asaas Payment Gateway Service
 *
 * Implements PaymentGatewayService for Asaas (full payment processing).
 * Supports PIX, CREDIT_CARD, and BOLETO billing types.
 *
 * Flow:
 *   1. POST /v3/customers           → find or create customer
 *   2. POST /v3/subscriptions       → create recurring subscription
 *   3. POST /v3/payments            → create manual charge (subscriptions auto-generate per cycle)
 *   4. DELETE /v3/subscriptions/:id  → cancel subscription
 *
 * All monetary values in the PUBLIC API are in CENTAVOS (Int). 14900 = R$ 149,00
 * Asaas API expects DECIMAL values (149.90 = R$ 149,90), so we convert internally.
 *
 * Required env vars:
 *   ASAAS_API_KEY          - API key from Asaas dashboard
 *   ASAAS_SANDBOX          - "true" for sandbox, omit or "false" for production
 *   ASAAS_WEBHOOK_TOKEN    - Token for webhook signature validation
 *
 * IMPORTANT: Do NOT call any method of this service inside a Prisma transaction.
 *            All methods make external HTTP calls to Asaas API.
 */

import { timingSafeEqual } from 'crypto';
import type {
  PaymentGatewayService,
  CreateCustomerData,
  CreateCustomerResult,
  CreateRecurringSubscriptionData,
  CreateRecurringSubscriptionResult,
  CreateChargeData,
  CreateChargeResult,
  CancelSubscriptionResult,
} from './gateway.interface';

// ── Constants ────────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;

// ── Error types ──────────────────────────────────────────────────────────────

export class AsaasGatewayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly response?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AsaasGatewayError';
  }
}

// ── Asaas API response types ─────────────────────────────────────────────────

// TODO: Share with asaas-nfse.service.ts — extract to shared Asaas types file
interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email: string;
}

interface AsaasCustomerListResponse {
  totalCount: number;
  data: AsaasCustomer[];
}

interface AsaasSubscriptionResponse {
  id: string;
  status: string;
  nextDueDate?: string;
}

interface AsaasPaymentResponse {
  id: string;
  status: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixTransaction?: {
    payload: string;
  };
}

interface AsaasErrorResponse {
  errors?: Array<{
    code: string;
    description: string;
  }>;
}

// ── Service implementation ───────────────────────────────────────────────────

class AsaasGatewayService implements PaymentGatewayService {
  readonly providerName = 'ASAAS' as const;

  private _apiKey: string | null = null;
  private _baseUrl: string | null = null;
  private _webhookToken: string | null = null;

  // ── Lazy initialization ──────────────────────────────────────────────────

  private get apiKey(): string {
    if (this._apiKey === null) {
      const key = process.env.ASAAS_API_KEY ?? '';
      if (!key) {
        throw new AsaasGatewayError(
          '[AsaasGateway] ASAAS_API_KEY is not set. Configure it in your environment.',
          'ASAAS_CONFIG_MISSING'
        );
      }
      this._apiKey = key;
    }
    return this._apiKey;
  }

  private get baseUrl(): string {
    if (this._baseUrl === null) {
      const isSandbox = process.env.ASAAS_SANDBOX === 'true';
      this._baseUrl = isSandbox
        ? 'https://api-sandbox.asaas.com/v3'
        : 'https://api.asaas.com/v3';
    }
    return this._baseUrl;
  }

  private get webhookToken(): string {
    if (this._webhookToken === null) {
      this._webhookToken = process.env.ASAAS_WEBHOOK_TOKEN ?? '';
    }
    return this._webhookToken;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Converts centavos (int) to Asaas decimal format.
   * 14900 → 149.00, 14990 → 149.90
   */
  private centsToDecimal(cents: number): number {
    return Number((cents / 100).toFixed(2));
  }

  /**
   * Sleeps for the given number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Core HTTP request method with timeout and retry logic.
   *
   * - 30s AbortController timeout per attempt
   * - 3 retries with exponential backoff (1s, 2s, 4s) for 5xx / network errors
   * - Non-retryable errors (4xx) throw immediately
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      access_token: this.apiKey,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const options: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (body && method !== 'GET') {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
          const errorBody = await response.text();
          let parsedError: AsaasErrorResponse | undefined;

          try {
            parsedError = JSON.parse(errorBody) as AsaasErrorResponse;
          } catch {
            // Body is not JSON — keep as raw text
          }

          const errorMessage = parsedError?.errors?.[0]?.description ?? errorBody;
          const errorCode = parsedError?.errors?.[0]?.code ?? 'ASAAS_API_ERROR';

          // Non-retryable client errors (4xx) — throw immediately
          if (response.status < 500) {
            throw new AsaasGatewayError(
              `[AsaasGateway] ${method} ${path} failed (${response.status}): ${errorMessage}`,
              errorCode,
              response.status,
              parsedError as unknown as Record<string, unknown>
            );
          }

          // Retryable server errors (5xx) — will retry
          lastError = new AsaasGatewayError(
            `[AsaasGateway] ${method} ${path} failed (${response.status}): ${errorMessage}`,
            errorCode,
            response.status,
            parsedError as unknown as Record<string, unknown>
          );
        } else {
          // DELETE may return empty body
          const text = await response.text();
          if (!text) return {} as T;
          return JSON.parse(text) as T;
        }
      } catch (error) {
        if (error instanceof AsaasGatewayError && error.statusCode && error.statusCode < 500) {
          // Non-retryable — re-throw immediately
          throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new AsaasGatewayError(
            `[AsaasGateway] ${method} ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`,
            'ASAAS_TIMEOUT'
          );
        } else if (error instanceof AsaasGatewayError) {
          lastError = error;
        } else {
          lastError = new AsaasGatewayError(
            `[AsaasGateway] ${method} ${path} network error: ${error instanceof Error ? error.message : String(error)}`,
            'ASAAS_NETWORK_ERROR'
          );
        }
      } finally {
        clearTimeout(timeoutId);
      }

      // Exponential backoff before retry
      if (attempt < MAX_RETRIES - 1) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(
          `[AsaasGateway] Attempt ${attempt + 1}/${MAX_RETRIES} failed for ${method} ${path}. Retrying in ${backoff}ms...`
        );
        await this.sleep(backoff);
      }
    }

    throw lastError ?? new AsaasGatewayError(
      `[AsaasGateway] ${method} ${path} failed after ${MAX_RETRIES} attempts`,
      'ASAAS_MAX_RETRIES'
    );
  }

  // ── Interface: createCustomer ──────────────────────────────────────────────

  /**
   * Finds or creates a customer in Asaas.
   *
   * First checks if a customer with the given CPF/CNPJ already exists to avoid
   * duplicates. If found, returns the existing ID; otherwise creates a new one.
   *
   * Asaas endpoint: GET /v3/customers?cpfCnpj=<digits>, POST /v3/customers
   */
  async createCustomer(data: CreateCustomerData): Promise<CreateCustomerResult> {
    const cleanDoc = data.document.replace(/\D/g, '');

    try {
      // Search for existing customer by document
      const existing = await this.request<AsaasCustomerListResponse>(
        'GET',
        `/customers?cpfCnpj=${cleanDoc}`
      );

      if (existing.totalCount > 0 && existing.data[0]) {
        console.log(
          `[AsaasGateway] Customer found: ${existing.data[0].id} (${data.name})`
        );
        return { gatewayCustomerId: existing.data[0].id };
      }

      // Create new customer
      const created = await this.request<AsaasCustomer>('POST', '/customers', {
        name: data.name,
        cpfCnpj: cleanDoc,
        email: data.email,
      });

      console.log(`[AsaasGateway] Customer created: ${created.id} (${data.name})`);
      return { gatewayCustomerId: created.id };
    } catch (error) {
      if (error instanceof AsaasGatewayError) throw error;

      throw new AsaasGatewayError(
        `[AsaasGateway] createCustomer failed: ${error instanceof Error ? error.message : String(error)}`,
        'ASAAS_CUSTOMER_ERROR'
      );
    }
  }

  // ── Interface: createRecurringSubscription ─────────────────────────────────

  /**
   * Creates a recurring subscription in Asaas.
   *
   * Asaas endpoint: POST /v3/subscriptions
   *
   * Supports PIX, CREDIT_CARD, and BOLETO billing types.
   * For CREDIT_CARD: a tokenized creditCardToken must be provided (from client-side POST /v3/creditCard/tokenize).
   * Asaas auto-generates charges per cycle — no need to create them manually.
   *
   * IMPORTANT: Do NOT call this inside a Prisma transaction.
   */
  async createRecurringSubscription(
    data: CreateRecurringSubscriptionData
  ): Promise<CreateRecurringSubscriptionResult> {
    // Ensure we have a customer ID — create/find if not provided
    let customerId = data.gatewayCustomerId;

    if (!customerId) {
      const customer = await this.createCustomer({
        name: data.customerName,
        document: data.customerDocument,
        email: data.customerEmail,
      });
      customerId = customer.gatewayCustomerId;
    }

    try {
      const subscriptionBody: Record<string, unknown> = {
        customer: customerId,
        billingType: data.paymentMethod,
        value: this.centsToDecimal(data.valueCents),
        cycle: data.billingCycle,
        description: data.description,
        nextDueDate: data.startDate,
      };

      // Credit card token (Asaas client-side tokenization — never handle raw card data)
      if (data.paymentMethod === 'CREDIT_CARD' && data.creditCardToken) {
        subscriptionBody.creditCardToken = data.creditCardToken;
        if (data.remoteIp) subscriptionBody.remoteIp = data.remoteIp;
      }

      // End date for limited subscriptions
      if (data.endDate) {
        subscriptionBody.endDate = data.endDate;
      }

      const result = await this.request<AsaasSubscriptionResponse>(
        'POST',
        '/subscriptions',
        subscriptionBody
      );

      console.log(
        `[AsaasGateway] Subscription created: ${result.id} (status: ${result.status}, cycle: ${data.billingCycle})`
      );

      return {
        gatewaySubscriptionId: result.id,
        status: result.status,
      };
    } catch (error) {
      if (error instanceof AsaasGatewayError) throw error;

      throw new AsaasGatewayError(
        `[AsaasGateway] createRecurringSubscription failed: ${error instanceof Error ? error.message : String(error)}`,
        'ASAAS_SUBSCRIPTION_ERROR'
      );
    }
  }

  // ── Interface: createCharge ────────────────────────────────────────────────

  /**
   * Creates a manual payment/charge in Asaas.
   *
   * Asaas endpoint: POST /v3/payments
   *
   * Note: Asaas subscriptions auto-generate charges per billing cycle.
   * Use this method only for manual/one-off charges or to re-bill failed charges.
   *
   * IMPORTANT: Do NOT call this inside a Prisma transaction.
   */
  async createCharge(data: CreateChargeData): Promise<CreateChargeResult> {
    if (!data.gatewayCustomerId) {
      throw new AsaasGatewayError(
        '[AsaasGateway] createCharge requires gatewayCustomerId (cus_xxx). Asaas POST /v3/payments needs a customer ID.',
        'ASAAS_MISSING_CUSTOMER_ID'
      );
    }

    try {
      const paymentBody: Record<string, unknown> = {
        customer: data.gatewayCustomerId,
        billingType: 'PIX',
        value: this.centsToDecimal(data.valueCents),
        dueDate: data.dueDate,
        description: data.description,
        externalReference: data.gatewaySubscriptionId,
      };

      const result = await this.request<AsaasPaymentResponse>(
        'POST',
        '/payments',
        paymentBody
      );

      console.log(
        `[AsaasGateway] Payment created: ${result.id} (status: ${result.status})`
      );

      return {
        gatewayPaymentId: result.id,
        status: result.status,
        pixPayload: result.pixTransaction?.payload,
        invoiceUrl: result.invoiceUrl,
      };
    } catch (error) {
      if (error instanceof AsaasGatewayError) throw error;

      throw new AsaasGatewayError(
        `[AsaasGateway] createCharge failed: ${error instanceof Error ? error.message : String(error)}`,
        'ASAAS_CHARGE_ERROR'
      );
    }
  }

  // ── Interface: cancelSubscription ──────────────────────────────────────────

  /**
   * Cancels a subscription in Asaas.
   *
   * Asaas endpoint: DELETE /v3/subscriptions/{id}
   */
  async cancelSubscription(
    subscriptionId: string
  ): Promise<CancelSubscriptionResult> {
    try {
      await this.request<Record<string, unknown>>(
        'DELETE',
        `/subscriptions/${subscriptionId}`
      );

      console.log(`[AsaasGateway] Subscription canceled: ${subscriptionId}`);
      return { success: true };
    } catch (error) {
      if (error instanceof AsaasGatewayError) throw error;

      throw new AsaasGatewayError(
        `[AsaasGateway] cancelSubscription failed: ${error instanceof Error ? error.message : String(error)}`,
        'ASAAS_CANCEL_ERROR'
      );
    }
  }

  // ── Interface: verifyWebhookSignature ──────────────────────────────────────

  /**
   * Verifies Asaas webhook authenticity.
   *
   * Asaas uses a pre-configured webhook token sent in the `asaas-access-token` header.
   * This method performs a timing-safe comparison between the received signature
   * and the expected ASAAS_WEBHOOK_TOKEN env var.
   *
   * Usage in webhook handler:
   *   const token = req.headers['asaas-access-token'];
   *   if (!asaasGateway.verifyWebhookSignature(rawBody, token)) { return 401; }
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookToken) {
      console.warn(
        '[AsaasGateway] ASAAS_WEBHOOK_TOKEN not configured. Webhook verification disabled.'
      );
      return false;
    }

    try {
      const sigBuffer = Buffer.from(signature, 'utf-8');
      const expectedBuffer = Buffer.from(this.webhookToken, 'utf-8');

      if (sigBuffer.length !== expectedBuffer.length) return false;
      return timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }
}

// ── Singleton export (lazy — no API calls at import time) ────────────────────

export const asaasGateway = new AsaasGatewayService();
