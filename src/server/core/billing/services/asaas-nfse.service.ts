// TODO: Extract shared AsaasHttpClient to reduce duplication with asaas-gateway.service.ts

/**
 * Asaas NFS-e Service
 *
 * Handles NFS-e (Nota Fiscal de Servico Eletronica) emission via Asaas REST API.
 * Used after an invoice is paid to generate the fiscal document.
 *
 * All monetary values in the public API are in CENTAVOS (Int). 14900 = R$ 149,00
 * Internally, values are converted to decimal before sending to Asaas.
 *
 * Required env vars:
 *   ASAAS_API_KEY              - API key from Asaas dashboard
 *   ASAAS_SANDBOX              - "true" for sandbox, omit or "false" for production
 *   ASAAS_MUNICIPAL_SERVICE_ID - Default municipal service ID for NFS-e emission
 *   ASAAS_WEBHOOK_TOKEN        - Token for webhook signature validation (optional)
 */

// ── Constants ────────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;

// ── Types ────────────────────────────────────────────────────────────────────

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

interface NfseTaxes {
  retainIss?: boolean;
  iss?: number;
  cofins?: number;
  csll?: number;
  inss?: number;
  ir?: number;
  pis?: number;
}

interface EmitNfseData {
  /** Asaas customer ID (cus_xxx). Required if no paymentId/installmentId. */
  customerId?: string;
  /** Asaas payment ID (pay_xxx). Links NFS-e to a payment. */
  paymentId?: string;
  /** Asaas installment ID (inst_xxx). Links NFS-e to an installment. */
  installmentId?: string;
  /** Service description shown on the NFS-e */
  description: string;
  /** Value in centavos (e.g. 14900 = R$ 149.00) */
  valueCents: number;
  /** External reference for reconciliation */
  externalReference?: string;
  /** Observations text (optional) */
  observations?: string;
  /** Override the default municipal service ID */
  municipalServiceId?: string;
  /** Override the default municipal service code */
  municipalServiceCode?: string;
  /** Tax configuration. Uses municipal settings defaults if omitted. */
  taxes?: NfseTaxes;
  /** Schedule emission for a future date (YYYY-MM-DD) */
  effectiveDate?: string;
}

interface EmitNfseResult {
  nfseId: string;
  status: NfseStatus;
}

type NfseStatus =
  | 'SCHEDULED'
  | 'SYNCHRONIZED'
  | 'AUTHORIZED'
  | 'PROCESSING_CANCELLATION'
  | 'CANCELED'
  | 'CANCELLATION_DENIED'
  | 'ERROR';

interface NfseStatusResult {
  status: NfseStatus;
  url?: string;
}

interface MunicipalSetting {
  id: string;
  municipalServiceId: string;
  municipalServiceCode: string;
  municipalServiceName: string;
  issRate: number;
  cofinsRate: number;
  csllRate: number;
  inssRate: number;
  irRate: number;
  pisRate: number;
  cnaeCode?: string;
  specialRegime?: string;
}

interface MunicipalSettingsResponse {
  data: MunicipalSetting[];
}

interface ConfigureMunicipalSettingsData {
  municipalServiceId?: string;
  municipalServiceCode?: string;
  municipalServiceName?: string;
  updatePayment?: boolean;
}

interface MunicipalService {
  id: string;
  municipalServiceCode: string;
  municipalServiceName: string;
}

interface MunicipalServicesResponse {
  data: MunicipalService[];
}

// ── Service ──────────────────────────────────────────────────────────────────

class AsaasNfseService {
  private _apiKey: string | null = null;
  private _baseUrl: string | null = null;
  private _municipalServiceId: string | null = null;

  // ── Lazy initialization ──────────────────────────────────────────────────

  private get apiKey(): string {
    if (this._apiKey === null) {
      const key = process.env.ASAAS_API_KEY ?? '';
      if (!key) {
        throw new Error(
          '[AsaasNfse] ASAAS_API_KEY is not set. Configure it in your environment.'
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

  private get defaultMunicipalServiceId(): string | undefined {
    if (this._municipalServiceId === null) {
      this._municipalServiceId = process.env.ASAAS_MUNICIPAL_SERVICE_ID ?? '';
    }
    return this._municipalServiceId || undefined;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Determines if an HTTP status code is retryable (5xx or network-level).
   */
  private isRetryable(status: number): boolean {
    return status >= 500 && status < 600;
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
   * - 3 retries with exponential backoff for 5xx / network errors
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

        if (body && method !== 'GET' && method !== 'DELETE') {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
          const errorBody = await response.text();

          // Non-retryable client errors — throw immediately
          if (response.status < 500) {
            throw new Error(
              `[AsaasNfse] ${method} ${path} failed (${response.status}): ${errorBody}`
            );
          }

          // Retryable server errors — will retry
          lastError = new Error(
            `[AsaasNfse] ${method} ${path} failed (${response.status}): ${errorBody}`
          );
        } else {
          return (await response.json()) as T;
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error(
            `[AsaasNfse] ${method} ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`
          );
        } else if (error instanceof Error) {
          // Non-retryable client errors (4xx, 3xx) thrown above — re-throw immediately
          const statusMatch = error.message.match(/failed \((\d+)\)/);
          if (statusMatch) {
            const status = parseInt(statusMatch[1], 10);
            if (!this.isRetryable(status)) {
              throw error;
            }
          }
          lastError = error;
        } else {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      } finally {
        clearTimeout(timeoutId);
      }

      // Exponential backoff before retry
      if (attempt < MAX_RETRIES - 1) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(
          `[AsaasNfse] Attempt ${attempt + 1}/${MAX_RETRIES} failed for ${method} ${path}. Retrying in ${backoff}ms...`
        );
        await this.sleep(backoff);
      }
    }

    throw lastError ?? new Error(`[AsaasNfse] ${method} ${path} failed after ${MAX_RETRIES} attempts`);
  }

  // ── Municipal Settings ─────────────────────────────────────────────────────

  /**
   * Gets the configured municipal settings for NFS-e emission.
   * These settings define the service codes and tax rates used.
   */
  async getMunicipalSettings(): Promise<MunicipalSetting[]> {
    try {
      const result = await this.request<MunicipalSettingsResponse>(
        'GET',
        '/invoices/municipalSettings'
      );
      return result.data;
    } catch (error) {
      console.error('[AsaasNfse] Error getting municipal settings:', error);
      throw new Error(
        `[AsaasNfse] getMunicipalSettings failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Configures municipal settings for NFS-e emission.
   * Must be done once before the first NFS-e can be emitted.
   *
   * Either `municipalServiceId` or `municipalServiceCode` is required.
   */
  async configureMunicipalSettings(
    data: ConfigureMunicipalSettingsData
  ): Promise<MunicipalSetting> {
    if (!data.municipalServiceId && !data.municipalServiceCode) {
      throw new Error(
        '[AsaasNfse] configureMunicipalSettings requires municipalServiceId or municipalServiceCode'
      );
    }

    try {
      const result = await this.request<MunicipalSetting>(
        'POST',
        '/invoices/municipalSettings',
        {
          ...(data.municipalServiceId && { municipalServiceId: data.municipalServiceId }),
          ...(data.municipalServiceCode && { municipalServiceCode: data.municipalServiceCode }),
          ...(data.municipalServiceName && { municipalServiceName: data.municipalServiceName }),
          updatePayment: data.updatePayment ?? false,
        }
      );

      console.log(
        `[AsaasNfse] Municipal settings configured: ${result.id} (${result.municipalServiceName})`
      );
      return result;
    } catch (error) {
      console.error('[AsaasNfse] Error configuring municipal settings:', error);
      throw new Error(
        `[AsaasNfse] configureMunicipalSettings failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Lists available municipal services filtered by description.
   * Use this to find the correct service code for your municipality.
   */
  async listMunicipalServices(description: string): Promise<MunicipalService[]> {
    try {
      const encoded = encodeURIComponent(description);
      const result = await this.request<MunicipalServicesResponse>(
        'GET',
        `/invoices/municipalServices?description=${encoded}`
      );
      return result.data;
    } catch (error) {
      console.error('[AsaasNfse] Error listing municipal services:', error);
      throw new Error(
        `[AsaasNfse] listMunicipalServices failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ── Customer Management ────────────────────────────────────────────────────

  /**
   * Finds or creates a customer in Asaas.
   * Searches by CPF/CNPJ first to avoid duplicates.
   */
  async ensureCustomer(
    orgName: string,
    document: string,
    email: string
  ): Promise<string> {
    const cleanDoc = document.replace(/\D/g, '');

    try {
      // Search for existing customer by document
      const existing = await this.request<AsaasCustomerListResponse>(
        'GET',
        `/customers?cpfCnpj=${cleanDoc}`
      );

      if (existing.totalCount > 0 && existing.data[0]) {
        console.log(`[AsaasNfse] Customer found: ${existing.data[0].id}`);
        return existing.data[0].id;
      }

      // Create new customer
      const created = await this.request<AsaasCustomer>('POST', '/customers', {
        name: orgName,
        cpfCnpj: cleanDoc,
        email,
      });

      console.log(`[AsaasNfse] Customer created: ${created.id}`);
      return created.id;
    } catch (error) {
      console.error('[AsaasNfse] Error ensuring customer:', error);
      throw new Error(
        `[AsaasNfse] ensureCustomer failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ── NFS-e Emission ─────────────────────────────────────────────────────────

  /**
   * Emits a NFS-e via Asaas.
   *
   * Requires one of: customerId, paymentId, or installmentId.
   * The municipalServiceId is resolved from (in order):
   *   1. data.municipalServiceId parameter
   *   2. ASAAS_MUNICIPAL_SERVICE_ID env var
   *
   * The NFS-e is created asynchronously — use getNfseStatus to poll for completion.
   */
  async emitNfse(data: EmitNfseData): Promise<EmitNfseResult> {
    // Validate at least one identifier
    if (!data.customerId && !data.paymentId && !data.installmentId) {
      throw new Error(
        '[AsaasNfse] emitNfse requires at least one of: customerId, paymentId, installmentId'
      );
    }

    // Resolve municipal service ID
    const municipalServiceId = data.municipalServiceId ?? this.defaultMunicipalServiceId;
    const municipalServiceCode = data.municipalServiceCode;

    if (!municipalServiceId && !municipalServiceCode) {
      throw new Error(
        '[AsaasNfse] emitNfse requires municipalServiceId or municipalServiceCode. ' +
          'Set ASAAS_MUNICIPAL_SERVICE_ID env var or pass it explicitly.'
      );
    }

    try {
      // Convert centavos to decimal (Asaas expects decimal values)
      const valueDecimal = Number((data.valueCents / 100).toFixed(2));

      const body: Record<string, unknown> = {
        serviceDescription: data.description,
        value: valueDecimal,
      };

      // Set the linking identifier
      if (data.customerId) body.customer = data.customerId;
      if (data.paymentId) body.payment = data.paymentId;
      if (data.installmentId) body.installment = data.installmentId;

      // Set municipal service identifier
      if (municipalServiceId) body.municipalServiceId = municipalServiceId;
      if (municipalServiceCode) body.municipalServiceCode = municipalServiceCode;

      // Optional fields
      if (data.externalReference) body.externalReference = data.externalReference;
      if (data.observations) body.observations = data.observations;
      if (data.effectiveDate) body.effectiveDate = data.effectiveDate;

      // Taxes (use municipal settings defaults if omitted)
      if (data.taxes) {
        body.taxes = {
          ...(data.taxes.retainIss !== undefined && { retainIss: data.taxes.retainIss }),
          ...(data.taxes.iss !== undefined && { iss: data.taxes.iss }),
          ...(data.taxes.cofins !== undefined && { cofins: data.taxes.cofins }),
          ...(data.taxes.csll !== undefined && { csll: data.taxes.csll }),
          ...(data.taxes.inss !== undefined && { inss: data.taxes.inss }),
          ...(data.taxes.ir !== undefined && { ir: data.taxes.ir }),
          ...(data.taxes.pis !== undefined && { pis: data.taxes.pis }),
        };
      }

      const result = await this.request<{ id: string; status: NfseStatus }>(
        'POST',
        '/invoices',
        body
      );

      console.log(`[AsaasNfse] NFS-e created: ${result.id} (status: ${result.status})`);

      return {
        nfseId: result.id,
        status: result.status,
      };
    } catch (error) {
      console.error('[AsaasNfse] Error emitting NFS-e:', error);
      throw new Error(
        `[AsaasNfse] emitNfse failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ── NFS-e Status ───────────────────────────────────────────────────────────

  /**
   * Gets the current status and PDF URL of a NFS-e.
   *
   * Possible statuses:
   * - SCHEDULED: Scheduled for future emission
   * - SYNCHRONIZED: Synchronized with the municipal authority
   * - AUTHORIZED: Successfully emitted
   * - PROCESSING_CANCELLATION: Cancellation in progress
   * - CANCELED: Successfully canceled
   * - CANCELLATION_DENIED: Cancellation denied by municipal authority
   * - ERROR: Emission failed
   */
  async getNfseStatus(nfseId: string): Promise<NfseStatusResult> {
    try {
      const result = await this.request<{
        status: NfseStatus;
        invoiceUrl?: string;
        pdfUrl?: string;
      }>('GET', `/invoices/${nfseId}`);

      return {
        status: result.status,
        url: result.pdfUrl ?? result.invoiceUrl,
      };
    } catch (error) {
      console.error(`[AsaasNfse] Error getting NFS-e status for ${nfseId}:`, error);
      throw new Error(
        `[AsaasNfse] getNfseStatus failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ── NFS-e Cancellation ─────────────────────────────────────────────────────

  /**
   * Cancels a previously emitted NFS-e.
   * Uses POST /invoices/{id}/cancel (NOT DELETE).
   */
  async cancelNfse(nfseId: string): Promise<void> {
    try {
      await this.request<Record<string, unknown>>(
        'POST',
        `/invoices/${nfseId}/cancel`
      );
      console.log(`[AsaasNfse] NFS-e canceled: ${nfseId}`);
    } catch (error) {
      console.error(`[AsaasNfse] Error canceling NFS-e ${nfseId}:`, error);
      throw new Error(
        `[AsaasNfse] cancelNfse failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const asaasNfseService = new AsaasNfseService();
