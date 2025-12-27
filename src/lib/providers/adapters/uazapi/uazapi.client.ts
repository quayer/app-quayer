/**
 * UAZapi HTTP Client
 *
 * Cliente HTTP para comunicação com a API UAZapi
 * Com suporte a Circuit Breaker para resiliência
 */

// ============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  failureThreshold: number;    // Failures before opening circuit
  successThreshold: number;    // Successes in half-open to close circuit
  timeout: number;             // Time in ms before attempting half-open
}

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  nextAttempt: number | null;
}

class CircuitBreaker {
  private state: CircuitBreakerState;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold || 5,
      successThreshold: config?.successThreshold || 2,
      timeout: config?.timeout || 30000, // 30s default
    };
    this.state = {
      state: 'CLOSED',
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      nextAttempt: null,
    };
  }

  canRequest(): boolean {
    if (this.state.state === 'CLOSED') return true;
    if (this.state.state === 'OPEN') {
      // Check if timeout has passed
      if (this.state.nextAttempt && Date.now() >= this.state.nextAttempt) {
        this.state.state = 'HALF_OPEN';
        this.state.successes = 0;
        console.log('[CircuitBreaker] Transitioning to HALF_OPEN state');
        return true;
      }
      return false;
    }
    // HALF_OPEN - allow limited requests
    return true;
  }

  recordSuccess(): void {
    if (this.state.state === 'HALF_OPEN') {
      this.state.successes++;
      if (this.state.successes >= this.config.successThreshold) {
        this.state.state = 'CLOSED';
        this.state.failures = 0;
        this.state.successes = 0;
        console.log('[CircuitBreaker] Circuit CLOSED - service recovered');
      }
    } else if (this.state.state === 'CLOSED') {
      // Reset failure count on success
      this.state.failures = 0;
    }
  }

  recordFailure(error: Error): void {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();

    if (this.state.state === 'HALF_OPEN') {
      // Any failure in half-open immediately opens circuit
      this.openCircuit();
    } else if (this.state.failures >= this.config.failureThreshold) {
      this.openCircuit();
    }
  }

  private openCircuit(): void {
    this.state.state = 'OPEN';
    this.state.nextAttempt = Date.now() + this.config.timeout;
    console.warn(`[CircuitBreaker] Circuit OPEN - will retry at ${new Date(this.state.nextAttempt).toISOString()}`);
  }

  getState(): CircuitState {
    return this.state.state;
  }

  getStats(): { state: CircuitState; failures: number; nextAttempt: string | null } {
    return {
      state: this.state.state,
      failures: this.state.failures,
      nextAttempt: this.state.nextAttempt ? new Date(this.state.nextAttempt).toISOString() : null,
    };
  }
}

// Per-endpoint category circuit breakers
// Each category has its own breaker to prevent cascading failures
type EndpointCategory = 'instance' | 'message' | 'webhook' | 'chat' | 'profile' | 'default';

const circuitBreakers: Record<EndpointCategory, CircuitBreaker> = {
  instance: new CircuitBreaker({ failureThreshold: 5, successThreshold: 2, timeout: 30000 }),
  message: new CircuitBreaker({ failureThreshold: 3, successThreshold: 2, timeout: 15000 }), // More sensitive for messages
  webhook: new CircuitBreaker({ failureThreshold: 5, successThreshold: 2, timeout: 30000 }),
  chat: new CircuitBreaker({ failureThreshold: 5, successThreshold: 2, timeout: 30000 }),
  profile: new CircuitBreaker({ failureThreshold: 5, successThreshold: 2, timeout: 60000 }), // Longer timeout for profile ops
  default: new CircuitBreaker({ failureThreshold: 5, successThreshold: 2, timeout: 30000 }),
};

/**
 * Get the appropriate circuit breaker for a given endpoint path
 */
function getCircuitBreaker(path: string): CircuitBreaker {
  if (path.includes('/instance') || path.includes('/connect') || path.includes('/disconnect')) {
    return circuitBreakers.instance;
  }
  if (path.includes('/message') || path.includes('/send')) {
    return circuitBreakers.message;
  }
  if (path.includes('/webhook') || path.includes('/globalwebhook')) {
    return circuitBreakers.webhook;
  }
  if (path.includes('/chat') || path.includes('/chats')) {
    return circuitBreakers.chat;
  }
  if (path.includes('/profile')) {
    return circuitBreakers.profile;
  }
  return circuitBreakers.default;
}

// Legacy: Global circuit breaker for backwards compatibility
const uazapiCircuitBreaker = circuitBreakers.default;

// ============================================================================
// CLIENT TYPES
// ============================================================================

export interface UAZClientConfig {
  baseUrl: string;
  adminToken: string;
  timeout?: number;
  useCircuitBreaker?: boolean;
}

export interface UAZResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export class CircuitOpenError extends Error {
  constructor(nextAttempt: string | null) {
    super(`Circuit breaker is OPEN. Next attempt: ${nextAttempt || 'unknown'}`);
    this.name = 'CircuitOpenError';
  }
}

// ============================================================================
// UAZ CLIENT
// ============================================================================

export class UAZClient {
  private baseUrl: string;
  private adminToken: string;
  private timeout: number;
  private useCircuitBreaker: boolean;

  constructor(config: UAZClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.adminToken = config.adminToken;
    this.timeout = config.timeout || 30000; // 30s default
    this.useCircuitBreaker = config.useCircuitBreaker !== false; // Default true
  }

  /**
   * Retry com backoff exponencial
   * Tenta a operação até 3 vezes com delays crescentes (1s, 2s, 4s)
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry on client errors (4xx) or circuit open
        if (
          error.message?.includes('HTTP 4') ||
          error.name === 'CircuitOpenError'
        ) {
          throw error;
        }

        // If not last attempt, wait before retry
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt); // 1s, 2s, 4s
          console.warn(`[UAZClient] Attempt ${attempt + 1} failed, retry in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error(`[UAZClient] All ${maxRetries} attempts failed`);
    throw lastError || new Error('All retry attempts failed');
  }

  /**
   * Get all circuit breaker statuses
   */
  getCircuitBreakerStatus() {
    return {
      instance: circuitBreakers.instance.getStats(),
      message: circuitBreakers.message.getStats(),
      webhook: circuitBreakers.webhook.getStats(),
      chat: circuitBreakers.chat.getStats(),
      profile: circuitBreakers.profile.getStats(),
      default: circuitBreakers.default.getStats(),
    };
  }

  /**
   * Request genérico com Circuit Breaker por categoria de endpoint
   */
  private async request<T = any>(
    method: string,
    path: string,
    options: {
      token?: string;
      body?: any;
      headers?: Record<string, string>;
    } = {}
  ): Promise<UAZResponse<T>> {
    // Get circuit breaker for this endpoint category
    const breaker = getCircuitBreaker(path);

    // Check circuit breaker
    if (this.useCircuitBreaker && !breaker.canRequest()) {
      const stats = breaker.getStats();
      throw new CircuitOpenError(stats.nextAttempt);
    }

    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Usar token da instância ou adminToken
    if (options.token) {
      headers['token'] = options.token;
    } else {
      headers['admintoken'] = this.adminToken;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        const error = new Error(data.error || data.message || `HTTP ${response.status}`);
        if (this.useCircuitBreaker) {
          breaker.recordFailure(error);
        }
        throw error;
      }

      // Record success
      if (this.useCircuitBreaker) {
        breaker.recordSuccess();
      }

      return data;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Request timeout after ${this.timeout}ms`);
        if (this.useCircuitBreaker) {
          breaker.recordFailure(timeoutError);
        }
        throw timeoutError;
      }
      if (this.useCircuitBreaker && error.name !== 'CircuitOpenError') {
        breaker.recordFailure(error);
      }
      throw error;
    }
  }

  // ===== INSTANCES =====

  /**
   * POST /instance/init - Criar nova instância
   * Cria uma nova instância no UAZapi
   *
   * Estados possíveis da instância:
   * - disconnected: Desconectado do WhatsApp
   * - connecting: Em processo de conexão
   * - connected: Conectado e autenticado
   */
  async createInstance(data: {
    instanceName: string;
    systemName?: string;
    adminField01?: string;
    adminField02?: string;
    webhook?: string;
    webhookEvents?: string[];
  }) {
    return this.request('POST', '/instance/init', {
      body: {
        name: data.instanceName, // lowercase conforme doc UAZapi
        systemName: data.systemName || 'quayer',
        adminField01: data.adminField01,
        adminField02: data.adminField02,
        webhook: data.webhook,
        webhookEvents: data.webhookEvents,
      },
    });
  }

  /**
   * DELETE /instance/delete - Deletar instância
   */
  async deleteInstance(instanceId: string, token: string) {
    return this.request('DELETE', `/instance/delete`, { token });
  }

  /**
   * GET /instance/status - Obter status da instância
   * Retorna: status, qrcode, pairingCode se disponíveis
   */
  async getInstanceStatus(token: string) {
    return this.request('GET', `/instance/status`, { token });
  }

  /**
   * POST /instance/connect - Conectar instância ao WhatsApp
   * Gera QR Code ou Pairing Code para conexão
   * @param phone - Número do telefone (opcional, para pairing code)
   */
  async connectInstance(token: string, phone?: string) {
    return this.request('POST', `/instance/connect`, {
      token,
      body: phone ? { phone } : undefined,
    });
  }

  /**
   * POST /instance/disconnect - Desconectar instância
   */
  async disconnectInstance(token: string) {
    return this.request('POST', `/instance/disconnect`, { token });
  }

  /**
   * POST /instance/restart - Reiniciar instância
   */
  async restartInstance(token: string) {
    return this.request('POST', `/instance/restart`, { token });
  }

  /**
   * GET /instance/all - Listar todas as instâncias
   * Retorna lista completa de todas as instâncias do sistema
   * Requer admintoken
   */
  async listAllInstances() {
    return this.request('GET', `/instance/all`);
  }

  /**
   * POST /instance/updateAdminFields - Atualizar campos administrativos
   * Atualiza os campos adminField01/adminField02 de uma instância
   * Requer admintoken
   */
  async updateAdminFields(data: {
    id: string;
    adminField01?: string;
    adminField02?: string;
  }) {
    return this.request('POST', '/instance/updateAdminFields', {
      body: data,
    });
  }

  // ===== GLOBAL WEBHOOK =====

  /**
   * GET /globalwebhook - Ver configuração do Webhook Global
   * Retorna a configuração atual do webhook global
   * Requer admintoken
   */
  async getGlobalWebhook() {
    return this.request('GET', '/globalwebhook');
  }

  /**
   * POST /globalwebhook - Configurar Webhook Global
   * Configura um webhook global que recebe eventos de todas as instâncias
   *
   * Eventos disponíveis:
   * - connection: Alterações no estado da conexão
   * - messages: Novas mensagens recebidas
   * - messages_update: Atualizações em mensagens existentes
   * - call: Eventos de chamadas VoIP
   * - contacts: Atualizações na agenda de contatos
   * - presence: Alterações no status de presença
   * - groups: Modificações em grupos
   * - labels: Gerenciamento de etiquetas
   * - chats: Eventos de conversas
   * - history: Recebimento de histórico de mensagens
   *
   * Filtros excludeMessages:
   * - wasSentByApi: Mensagens originadas pela API (IMPORTANTE: use sempre para evitar loops)
   * - wasNotSentByApi: Mensagens não originadas pela API
   * - fromMeYes: Mensagens enviadas pelo usuário
   * - fromMeNo: Mensagens recebidas de terceiros
   * - isGroupYes: Mensagens em grupos
   * - isGroupNo: Mensagens em conversas individuais
   */
  async setGlobalWebhook(data: {
    url: string;
    events: string[];
    excludeMessages?: string[];
    addUrlEvents?: boolean;
    addUrlTypesMessages?: boolean;
  }) {
    return this.request('POST', '/globalwebhook', {
      body: data,
    });
  }

  // ===== MESSAGES =====
  async sendText(instanceId: string, token: string, data: {
    number: string;
    text: string;
    delay?: number;
  }) {
    // Use withRetry for resilience
    return this.withRetry(async () => {
      // Try multiple endpoint formats for compatibility with different UAZapi versions
      const endpoints = [
        `/message/sendText/${instanceId}`,  // Evolution API v2
        `/send/text`,                         // Legacy format
        `/sendText`,                          // Alternative
        `/chat/sendText/${instanceId}`,      // Another common format
      ];

      let lastError: any = null;

      for (const endpoint of endpoints) {
        try {
          console.log(`[UAZClient] Trying endpoint: ${endpoint}`);
          return await this.request('POST', endpoint, {
            token,
            body: {
              number: data.number,
              text: data.text,
              delay: data.delay,
            },
          });
        } catch (error: any) {
          lastError = error;
          // If 404/405, try next endpoint
          if (error.message?.includes('404') || error.message?.includes('405')) {
            console.log(`[UAZClient] Endpoint ${endpoint} returned 404/405, trying next...`);
            continue;
          }
          // For other errors, throw immediately
          throw error;
        }
      }

      // If all endpoints failed, throw the last error
      console.error('[UAZClient] All sendText endpoints failed');
      throw lastError || new Error('All sendText endpoints failed');
    });
  }

  async sendMedia(instanceId: string, token: string, data: {
    number: string;
    mediatype: 'image' | 'video' | 'audio' | 'myaudio' | 'document';
    media: string; // URL ou base64
    caption?: string;
    filename?: string;
    mimetype?: string;
  }) {
    // Use withRetry for resilience
    return this.withRetry(async () => {
      // Try multiple endpoint formats for compatibility with different UAZapi versions
      const endpoints = [
        `/message/sendMedia/${instanceId}`,  // Evolution API v2
        `/send/media`,                        // Legacy format
        `/sendMedia`,                         // Alternative
        `/chat/sendMedia/${instanceId}`,     // Another common format
      ];

      let lastError: any = null;

      for (const endpoint of endpoints) {
        try {
          console.log(`[UAZClient] Trying media endpoint: ${endpoint}`);
          return await this.request('POST', endpoint, {
            token,
            body: data,
          });
        } catch (error: any) {
          lastError = error;
          // If 404/405, try next endpoint
          if (error.message?.includes('404') || error.message?.includes('405')) {
            console.log(`[UAZClient] Endpoint ${endpoint} returned 404/405, trying next...`);
            continue;
          }
          // For other errors, throw immediately
          throw error;
        }
      }

      // If all endpoints failed, throw the last error
      console.error('[UAZClient] All sendMedia endpoints failed');
      throw lastError || new Error('All sendMedia endpoints failed');
    });
  }

  // ===== INSTANCE WEBHOOKS =====

  /**
   * GET /webhook - Ver Webhook da Instância
   * Retorna a configuração de webhook atual da instância
   */
  async getInstanceWebhook(token: string) {
    return this.request('GET', `/webhook`, { token });
  }

  /**
   * POST /webhook - Configurar Webhook da Instância
   * Gerencia webhooks da instância (add, update, delete)
   *
   * @param action - 'add' | 'update' | 'delete'
   * @param data - Configuração do webhook
   *
   * Eventos disponíveis:
   * - connection: Alterações no estado da conexão
   * - messages: Novas mensagens recebidas
   * - messages_update: Atualizações em mensagens existentes
   * - call: Eventos de chamadas VoIP
   * - contacts: Atualizações na agenda de contatos
   * - presence: Alterações no status de presença
   * - groups: Modificações em grupos
   * - labels: Gerenciamento de etiquetas
   * - chats: Eventos de conversas
   * - history: Recebimento de histórico de mensagens
   *
   * Filtros excludeMessages:
   * - wasSentByApi: Mensagens originadas pela API (IMPORTANTE: use sempre para evitar loops)
   * - wasNotSentByApi: Mensagens não originadas pela API
   * - fromMeYes: Mensagens enviadas pelo usuário
   * - fromMeNo: Mensagens recebidas de terceiros
   * - isGroupYes: Mensagens em grupos
   * - isGroupNo: Mensagens em conversas individuais
   */
  async configureInstanceWebhook(
    token: string,
    action: 'add' | 'update' | 'delete',
    data: {
      id?: string; // Required for update/delete
      url?: string;
      events?: string[];
      excludeMessages?: string[];
      addUrlEvents?: boolean;
      addUrlTypesMessages?: boolean;
    }
  ) {
    return this.request('POST', `/webhook`, {
      token,
      body: {
        action,
        ...data,
      },
    });
  }

  /**
   * Legacy method - use configureInstanceWebhook instead
   * @deprecated
   */
  async configureWebhook(instanceId: string, token: string, data: {
    url: string;
    events: string[];
    enabled: boolean;
  }) {
    return this.request('POST', `/webhook/set`, {
      token,
      body: data,
    });
  }

  // ===== SSE (Server-Sent Events) =====

  /**
   * GET /sse - Conectar ao SSE da Instância
   * Retorna a URL para conexão SSE da instância
   *
   * O SSE envia eventos em tempo real conforme acontecem:
   * - Novas mensagens
   * - Mudanças de status
   * - Eventos de conexão
   *
   * Uso: EventSource(`${baseUrl}/sse?token=${token}`)
   */
  getSSEUrl(token: string): string {
    return `${this.baseUrl}/sse?token=${token}`;
  }

  /**
   * Criar EventSource para SSE da instância
   * Método utilitário para facilitar conexão SSE
   */
  createSSEConnection(token: string): EventSource | null {
    if (typeof EventSource === 'undefined') {
      console.warn('[UAZClient] EventSource not available (server-side?)');
      return null;
    }
    return new EventSource(this.getSSEUrl(token));
  }

  // ===== PROFILE =====
  async getProfilePicture(instanceId: string, token: string, number: string) {
    return this.request('GET', `/profile/image/${number}`, { token });
  }

  async updateProfilePicture(instanceId: string, token: string, image: string) {
    return this.request('POST', `/profile/image`, {
      token,
      body: { image },
    });
  }

  // ===== CHATS =====
  async getChats(instanceId: string, token: string) {
    return this.request('GET', `/chats/all`, { token });
  }

  async getContacts(instanceId: string, token: string) {
    return this.request('GET', `/contacts/all`, { token });
  }

  // ===== MESSAGES =====
  /**
   * POST /message/find - Buscar mensagens
   * Permite buscar mensagens com filtros variados
   *
   * @param token - Token da instância
   * @param params - Parâmetros de busca
   * @returns Lista de mensagens com metadados de paginação
   */
  async findMessages(token: string, params?: {
    id?: string;
    chatid?: string;
    track_source?: string;
    track_id?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.request<{
      returnedMessages: number;
      messages: Array<{
        id: string;
        chatid: string;
        fromMe: boolean;
        type: string;
        text?: string;
        timestamp: number;
        status: string;
        from?: string;
        to?: string;
        pushName?: string;
        mediaType?: string;
        caption?: string;
      }>;
      limit: number;
      offset: number;
      nextOffset: number;
      hasMore: boolean;
    }>('POST', '/message/find', {
      token,
      body: {
        limit: params?.limit || 100,
        offset: params?.offset || 0,
        ...(params?.id && { id: params.id }),
        ...(params?.chatid && { chatid: params.chatid }),
        ...(params?.track_source && { track_source: params.track_source }),
        ...(params?.track_id && { track_id: params.track_id }),
      },
    });
  }

  // ===== HEALTH =====
  async ping() {
    return this.request('GET', '/ping');
  }

  // ===== SYNC GLOBAL WEBHOOK =====
  /**
   * Sincroniza webhook global com todas as instâncias UAZapi
   * Usado pelo painel admin para configurar webhook centralizado
   */
  async syncGlobalWebhook(config: {
    url: string;
    events: string[];
    excludeMessages?: string[];
    addUrlEvents?: boolean;
    addUrlTypesMessages?: boolean;
  }): Promise<{ synced: number; total: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;
    let total = 0;

    try {
      // 1. Configurar webhook global na UAZapi
      await this.setGlobalWebhook(config);
      console.log('[UAZClient] Global webhook configured:', config.url);

      // 2. Listar todas as instâncias para sincronizar
      const instancesResponse = await this.listAllInstances();
      const instances = instancesResponse.data || [];
      total = instances.length;

      console.log(`[UAZClient] Found ${total} instances to sync webhook`);

      // 3. O webhook global já aplica a todas as instâncias automaticamente
      // Não é necessário configurar individualmente
      synced = total;

      return { synced, total, errors };
    } catch (error: any) {
      console.error('[UAZClient] Failed to sync global webhook:', error);
      errors.push(error.message);
      return { synced, total, errors };
    }
  }
}

// ===== SINGLETON INSTANCE =====
/**
 * Instância singleton do UAZClient
 * Configurada automaticamente com variáveis de ambiente
 * Use getConfiguredUazapiClient() para obter cliente com credenciais do banco
 */
export const uazapiClient = new UAZClient({
  baseUrl: process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com',
  adminToken: process.env.UAZAPI_ADMIN_TOKEN || '',
});

/**
 * Factory para criar UAZClient com credenciais do banco de dados
 * Prioridade: banco de dados > variáveis de ambiente
 */
export async function getConfiguredUazapiClient(): Promise<UAZClient> {
  try {
    // Import dynamically to avoid circular dependencies
    const { systemSettingsRepository } = await import('@/features/system-settings/system-settings.repository');
    const uazapiSettings = await systemSettingsRepository.getByCategory('uazapi');

    const baseUrl = uazapiSettings?.baseUrl || process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';
    const adminToken = uazapiSettings?.adminToken || process.env.UAZAPI_ADMIN_TOKEN || '';

    if (!adminToken) {
      console.warn('[UAZClient] No admin token configured');
    }

    return new UAZClient({ baseUrl, adminToken });
  } catch (error) {
    console.error('[UAZClient] Failed to get configured client:', error);
    // Fallback to env-based singleton
    return uazapiClient;
  }
}
