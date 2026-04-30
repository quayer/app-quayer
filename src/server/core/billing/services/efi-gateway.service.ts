/**
 * Efí Bank Payment Gateway Service
 *
 * Implements PaymentGatewayService for Efí Bank (formerly Gerencianet).
 * Uses Pix Automático — Jornada 3 for recurring payments.
 *
 * Flow:
 *   1. POST /v2/locrec          → create location for recurrence
 *   2. POST /v2/rec             → create recurrence (authorization)
 *   3. GET  location details    → retrieve QR code for customer
 *   4. POST /v2/cobr            → create recurring charge
 *   5. PATCH /v2/rec/:idRec     → cancel recurrence
 *
 * Required env vars:
 *   EFI_CLIENT_ID          - OAuth2 client ID from Efí dashboard
 *   EFI_CLIENT_SECRET      - OAuth2 client secret from Efí dashboard
 *   EFI_PIX_KEY            - Your registered Pix key (CNPJ, email, random, etc.)
 *   EFI_CERTIFICATE_PATH   - Absolute path to .p12 / PFX certificate file (mTLS)
 *   EFI_SANDBOX            - "true" for sandbox, omit or "false" for production
 *   EFI_WEBHOOK_SECRET     - Shared secret for simplified webhook verification
 *   EFI_BANK_ACCOUNT       - Receiver bank account number (recebedor.conta)
 *   EFI_BANK_AGENCY        - Receiver bank agency number (recebedor.agencia)
 *   EFI_ACCOUNT_TYPE       - Receiver account type (default: CACC)
 *
 * NOTE: Requires `sdk-node-apis-efi` package:
 *   npm install sdk-node-apis-efi
 *
 * IMPORTANT: Do NOT call any method of this service inside a Prisma transaction.
 *            All methods make external HTTP calls to Efí API.
 */

import { readFileSync } from 'fs';
import { timingSafeEqual, createHmac } from 'crypto';
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

// ── Efí SDK type import ──────────────────────────────────────────────────────
// The SDK exports a default class `EfiPay` that extends `AllMethods`.
// We import it as a type and use dynamic import at runtime.
import type EfiPay from 'sdk-node-apis-efi';

// ── Error types ──────────────────────────────────────────────────────────────

export class EfiGatewayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly efiResponse?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'EfiGatewayError';
  }
}

// ── Billing cycle mapping ────────────────────────────────────────────────────

const BILLING_CYCLE_MAP: Record<string, string> = {
  MONTHLY: 'MENSAL',
  QUARTERLY: 'TRIMESTRAL',
  YEARLY: 'ANUAL',
};

// ── Retry policy mapping ─────────────────────────────────────────────────────

const RETRY_POLICY = 'PERMITE_3R_7D'; // 3 retries within 7 days

// ── API timeout ──────────────────────────────────────────────────────────────

const API_TIMEOUT_MS = 30_000;

// ── Service implementation ───────────────────────────────────────────────────

class EfiGatewayService implements PaymentGatewayService {
  readonly providerName = 'EFI' as const;

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly pixKey: string;
  private readonly sandbox: boolean;
  private readonly certificatePath: string;
  private readonly webhookSecret: string;
  private readonly bankAccount: string;
  private readonly bankAgency: string;
  private readonly accountType: string;

  /** Lazy-initialized SDK client */
  private efiClient: EfiPay | null = null;
  /** Serializes concurrent getClient() calls to avoid double initialization */
  private initPromise: Promise<EfiPay> | null = null;

  constructor() {
    this.clientId = process.env.EFI_CLIENT_ID ?? '';
    this.clientSecret = process.env.EFI_CLIENT_SECRET ?? '';
    this.pixKey = process.env.EFI_PIX_KEY ?? '';
    this.sandbox = process.env.EFI_SANDBOX === 'true';
    this.certificatePath = process.env.EFI_CERTIFICATE_PATH ?? '';
    this.webhookSecret = process.env.EFI_WEBHOOK_SECRET ?? '';
    this.bankAccount = process.env.EFI_BANK_ACCOUNT ?? '';
    this.bankAgency = process.env.EFI_BANK_AGENCY ?? '';
    this.accountType = process.env.EFI_ACCOUNT_TYPE ?? 'CACC';

    const missing: string[] = [];
    if (!this.clientId) missing.push('EFI_CLIENT_ID');
    if (!this.clientSecret) missing.push('EFI_CLIENT_SECRET');
    if (!this.pixKey) missing.push('EFI_PIX_KEY');
    if (!this.certificatePath) missing.push('EFI_CERTIFICATE_PATH');

    if (missing.length > 0) {
      console.warn(
        `[EfiGateway] Missing env vars: ${missing.join(', ')}. Gateway calls will fail at runtime.`
      );
    }
  }

  // ── Private: Lazy SDK initialization ─────────────────────────────────────

  /**
   * Returns the Efí SDK client, initializing it on first call.
   * The certificate is read once and cached.
   * Uses a promise-based lazy pattern to prevent double initialization from concurrent calls.
   */
  private async getClient(): Promise<EfiPay> {
    if (this.efiClient) return this.efiClient;
    if (!this.initPromise) {
      this.initPromise = this.initializeClient();
    }
    return this.initPromise;
  }

  private async initializeClient(): Promise<EfiPay> {
    if (!this.clientId || !this.clientSecret || !this.certificatePath) {
      throw new EfiGatewayError(
        'Missing required Efí configuration (client_id, client_secret, or certificate path)',
        'EFI_CONFIG_MISSING'
      );
    }

    // Verify that the certificate file exists before initializing
    try {
      readFileSync(this.certificatePath);
    } catch {
      throw new EfiGatewayError(
        `Failed to read Efí certificate at: ${this.certificatePath}`,
        'EFI_CERT_READ_ERROR'
      );
    }

    try {
      // The SDK expects the certificate as a file path (string), not a Buffer.
      const { default: EfiPayConstructor } = await import('sdk-node-apis-efi');

      this.efiClient = new EfiPayConstructor({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        sandbox: this.sandbox,
        certificate: this.certificatePath,
      });

      return this.efiClient;
    } catch (error) {
      // Reset initPromise so a retry can happen
      this.initPromise = null;
      throw new EfiGatewayError(
        'Failed to initialize Efí SDK. Ensure `sdk-node-apis-efi` is installed.',
        'EFI_SDK_INIT_ERROR'
      );
    }
  }

  // ── Private: Helpers ─────────────────────────────────────────────────────

  /**
   * Converts centavos (int) to Efí's decimal string format: "149.00"
   */
  private centsToDecimal(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  /**
   * Cleans a document string to digits only and returns the appropriate field.
   */
  private parseDocument(document: string): { cpf?: string; cnpj?: string } {
    const digits = document.replace(/\D/g, '');
    if (digits.length <= 11) {
      return { cpf: digits.padStart(11, '0') };
    }
    return { cnpj: digits.padStart(14, '0') };
  }

  /**
   * Generates a unique contract ID for Efí recurrence.
   * Format: qy-{orgId}-{timestamp}
   */
  private generateContractId(orgId: string): string {
    const ts = Date.now().toString(36);
    return `qy-${orgId}-${ts}`;
  }

  /**
   * Maps our billing cycle enum to Efí's periodicidade values.
   */
  private mapPeriodicidade(cycle: string): string {
    return BILLING_CYCLE_MAP[cycle.toUpperCase()] ?? 'MENSAL';
  }

  /**
   * Wraps an SDK call with a timeout.
   *
   * WARNING: On timeout, the underlying SDK call continues running in the background.
   * This means a charge could be created in the gateway but the application thinks it failed.
   * Mitigated by using idempotent txid/contract IDs for charge deduplication.
   */
  private async withTimeout<T>(
    fn: () => Promise<T>,
    label: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new EfiGatewayError(
            `Efí API call timed out after ${API_TIMEOUT_MS}ms: ${label}`,
            'EFI_TIMEOUT'
          )
        );
      }, API_TIMEOUT_MS);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Extracts error info from an Efí API error response.
   */
  private parseEfiError(error: unknown, operation: string): EfiGatewayError {
    if (error instanceof EfiGatewayError) return error;

    const err = error as Record<string, unknown> | undefined;
    const message =
      (err?.['mensagem'] as string) ??
      (err?.['message'] as string) ??
      (error instanceof Error ? error.message : String(error));
    const code =
      (err?.['tipo'] as string) ??
      (err?.['code'] as string) ??
      'EFI_UNKNOWN_ERROR';
    const statusCode = (err?.['statusCode'] as number) ?? undefined;

    return new EfiGatewayError(
      `[EfiGateway] ${operation} failed: ${message}`,
      code,
      statusCode,
      err as Record<string, unknown> | undefined
    );
  }

  // ── Interface: createCustomer ────────────────────────────────────────────

  async createCustomer(data: CreateCustomerData): Promise<CreateCustomerResult> {
    // Efí does not have a standalone "customer" entity.
    // We create a deterministic local ID from the document for tracking.
    const digits = data.document.replace(/\D/g, '');
    const gatewayCustomerId = `efi_${digits}`;

    console.log(
      `[EfiGateway] Customer registered locally: ${gatewayCustomerId} (${data.name})`
    );

    return { gatewayCustomerId };
  }

  // ── Interface: createRecurringSubscription ───────────────────────────────

  /**
   * Creates a Pix Automático authorization (Jornada 3) in 3 steps:
   *
   *   Step 1: POST /v2/locrec → create location for recurrence
   *   Step 2: POST /v2/rec   → create recurrence linking location + debtor + schedule
   *   Step 3: GET location   → retrieve QR code image + payload
   *
   * IMPORTANT: Efí only supports PIX payment method. Other methods will throw.
   * IMPORTANT: Do NOT call this inside a Prisma transaction.
   */
  async createRecurringSubscription(
    data: CreateRecurringSubscriptionData
  ): Promise<CreateRecurringSubscriptionResult> {
    if (data.paymentMethod !== 'PIX') {
      throw new EfiGatewayError(
        `Efí only supports Pix Automático. Payment method "${data.paymentMethod}" is not supported.`,
        'EFI_UNSUPPORTED_PAYMENT_METHOD'
      );
    }

    const efi = await this.getClient();
    const contractId = this.generateContractId(data.orgId);
    const devedorDoc = this.parseDocument(data.customerDocument);

    // ── Step 1: Create location for recurrence ──────────────────────────
    let locationId: number;
    let locationUrl: string;

    try {
      // pixCreateLocationRecurrenceAutomatic() takes no params — POST /v2/locrec
      const locResponse = await this.withTimeout(
        () => efi.pixCreateLocationRecurrenceAutomatic(),
        'pixCreateLocationRecurrenceAutomatic (POST /v2/locrec)'
      );

      locationId = locResponse.id;
      locationUrl = locResponse.location ?? '';

      console.log(
        `[EfiGateway] Location created: id=${locationId}, url=${locationUrl}`
      );
    } catch (error) {
      throw this.parseEfiError(error, 'createRecurringSubscription.createLocation');
    }

    // ── Step 2: Create recurrence (authorization) ───────────────────────
    let gatewaySubscriptionId: string;

    try {
      const recBody = {
        vinculo: {
          contrato: contractId,
          devedor: {
            ...devedorDoc,
            nome: data.customerName,
          },
          objeto: data.description,
        },
        calendario: {
          dataInicial: data.startDate,
          ...(data.endDate ? { dataFinal: data.endDate } : {}),
          periodicidade: this.mapPeriodicidade(data.billingCycle),
        },
        valor: {
          valorRec: this.centsToDecimal(data.valueCents),
        },
        politicaRetentativa: RETRY_POLICY,
        loc: locationId,
      };

      // pixCreateRecurrenceAutomatic(params, body) — POST /v2/rec
      const recResponse = await this.withTimeout(
        () => efi.pixCreateRecurrenceAutomatic({}, recBody),
        'pixCreateRecurrenceAutomatic (POST /v2/rec)'
      );

      gatewaySubscriptionId = recResponse.idRec ?? '';
      const status = recResponse.status;

      console.log(
        `[EfiGateway] Recurrence created: idRec=${gatewaySubscriptionId}, status=${status}, contract=${contractId}`
      );
    } catch (error) {
      throw this.parseEfiError(
        error,
        'createRecurringSubscription.createRecurrence'
      );
    }

    // ── Step 3: Generate QR code for the location ──────────────────────
    let qrCodePayload = '';
    let qrCodeImage: string | undefined;

    try {
      const qrResult = await this.withTimeout(
        () => efi.pixGenerateQRCode({ id: locationId }),
        'pixGenerateQRCode (GET /v2/loc/:id/qrcode)'
      );

      qrCodePayload = qrResult.qrcode || '';
      qrCodeImage = qrResult.imagemQrcode || undefined;

      console.log(
        `[EfiGateway] QR code generated for location ${locationId}`
      );
    } catch (error) {
      // QR code generation failure is non-fatal — the recurrence was created.
      // The QR code can be fetched later via generateQRCode().
      console.warn(
        `[EfiGateway] Warning: Failed to generate QR code for location ${locationId}. ` +
          `Recurrence ${gatewaySubscriptionId} was created successfully. Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return {
      gatewaySubscriptionId,
      status: 'PENDING_AUTHORIZATION',
      contractId,
      locationId,
      qrCodePayload,
      qrCodeImage,
    };
  }

  // ── Interface: createCharge ──────────────────────────────────────────────

  /**
   * Creates a recurring charge against an existing recurrence.
   *
   * Efí endpoint: POST /v2/cobr
   *
   * IMPORTANT: Do NOT call this inside a Prisma transaction.
   */
  async createCharge(data: CreateChargeData): Promise<CreateChargeResult> {
    const efi = await this.getClient();

    // pixCreateAutomaticCharge(params, body) — POST /v2/cobr
    // The SDK requires: idRec, calendario, valor, ajusteDiaUtil, recebedor
    const chargeBody = {
      idRec: data.gatewaySubscriptionId,
      calendario: {
        dataDeVencimento: data.dueDate,
      },
      valor: {
        original: this.centsToDecimal(data.valueCents),
      },
      ajusteDiaUtil: true,
      recebedor: {
        conta: this.bankAccount,
        tipoConta: this.accountType,
        agencia: this.bankAgency,
      },
      infoAdicional: data.description,
    };

    try {
      const response = await this.withTimeout(
        () => efi.pixCreateAutomaticCharge({}, chargeBody),
        'pixCreateAutomaticCharge (POST /v2/cobr)'
      );

      const txid = response.txid ?? '';
      const status = response.status ?? '';

      console.log(
        `[EfiGateway] Recurring charge created: txid=${txid}, status=${status}, recurrence=${data.gatewaySubscriptionId}`
      );

      return {
        gatewayPaymentId: txid,
        status,
      };
    } catch (error) {
      throw this.parseEfiError(error, 'createCharge');
    }
  }

  // ── Interface: cancelSubscription ────────────────────────────────────────

  /**
   * Cancels a recurrence in Efí.
   *
   * Efí endpoint: PATCH /v2/rec/:idRec with { status: "CANCELADA" }
   */
  async cancelSubscription(
    recurrenceId: string
  ): Promise<CancelSubscriptionResult> {
    const efi = await this.getClient();

    try {
      // There is no pixCancelRecurrence — use pixUpdateRecurrenceAutomatic
      // with status: 'CANCELADA' to cancel the recurrence.
      await this.withTimeout(
        () =>
          efi.pixUpdateRecurrenceAutomatic(
            { idRec: recurrenceId },
            { status: 'CANCELADA' }
          ),
        'pixUpdateRecurrenceAutomatic (PATCH /v2/rec/:idRec)'
      );

      console.log(
        `[EfiGateway] Recurrence canceled: idRec=${recurrenceId}`
      );

      return { success: true };
    } catch (error) {
      throw this.parseEfiError(error, 'cancelSubscription');
    }
  }

  // ── Public: generateQRCode ──────────────────────────────────────────────

  /**
   * Generates a QR code image + payload for a given Efí location ID.
   *
   * Efí endpoint: GET /v2/loc/:id/qrcode
   *
   * Use this to (re)generate QR codes for subscriptions whose initial
   * QR code generation failed or when the frontend needs a fresh copy.
   *
   * Returns base64-encoded PNG image and the copia-e-cola payload string.
   */
  async generateQRCode(
    locationId: number
  ): Promise<{ qrCodeImage: string; qrCodePayload: string }> {
    const efi = await this.getClient();

    try {
      const result = await this.withTimeout(
        () => efi.pixGenerateQRCode({ id: locationId }),
        'pixGenerateQRCode (GET /v2/loc/:id/qrcode)'
      );

      console.log(`[EfiGateway] QR code generated for location ${locationId}`);

      return {
        qrCodeImage: result.imagemQrcode || result.qrcode || '',
        qrCodePayload: result.qrcode || '',
      };
    } catch (error) {
      throw this.parseEfiError(error, 'generateQRCode');
    }
  }

  // ── Interface: verifyWebhookSignature ────────────────────────────────────

  /**
   * Verifies webhook request authenticity.
   *
   * Efí's primary webhook security mechanism is mTLS (mutual TLS).
   * When registering a webhook URL, Efí validates the server's certificate.
   * Efí appends `/pix` to the registered webhook URL automatically.
   *
   * For simplified setups (when mTLS is not configured):
   * - Register webhook with header `x-skip-mtls-checking: true`
   * - Use a shared secret (EFI_WEBHOOK_SECRET) passed as query param or header
   * - This method checks the shared secret using HMAC-SHA256
   *
   * For production, prefer mTLS verification at the reverse proxy / load balancer level.
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      if (this.sandbox) {
        console.warn('[EfiGateway] EFI_WEBHOOK_SECRET not configured. Accepting webhook in sandbox mode.');
        return true;
      }
      console.error('[EfiGateway] CRITICAL: EFI_WEBHOOK_SECRET not configured in production. All webhooks will be rejected.');
      return false;
    }

    try {
      const expected = createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');

      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expected, 'hex');

      if (sigBuffer.length !== expectedBuffer.length) return false;
      return timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }
}

// ── Singleton export (lazy — no API calls at import time) ────────────────────

export const efiGateway = new EfiGatewayService();
