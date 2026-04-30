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
type EndpointCategory = 'instance' | 'message' | 'webhook' | 'chat' | 'profile' | 'sender' | 'business' | 'group' | 'default';

const circuitBreakers: Record<EndpointCategory, CircuitBreaker> = {
  instance: new CircuitBreaker({ failureThreshold: 5, successThreshold: 2, timeout: 30000 }),
  message: new CircuitBreaker({ failureThreshold: 3, successThreshold: 2, timeout: 15000 }), // More sensitive for messages
  webhook: new CircuitBreaker({ failureThreshold: 5, successThreshold: 2, timeout: 30000 }),
  chat: new CircuitBreaker({ failureThreshold: 5, successThreshold: 2, timeout: 30000 }),
  profile: new CircuitBreaker({ failureThreshold: 5, successThreshold: 2, timeout: 60000 }), // Longer timeout for profile ops
  sender: new CircuitBreaker({ failureThreshold: 3, successThreshold: 2, timeout: 30000 }),
  business: new CircuitBreaker({ failureThreshold: 5, successThreshold: 2, timeout: 30000 }),
  group: new CircuitBreaker({ failureThreshold: 5, successThreshold: 2, timeout: 30000 }),
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
  if (path.includes('/sender')) {
    return circuitBreakers.sender;
  }
  if (path.includes('/business') || path.includes('/catalog')) {
    return circuitBreakers.business;
  }
  if (path.includes('/group') || path.includes('/community')) {
    return circuitBreakers.group;
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
      sender: circuitBreakers.sender.getStats(),
      business: circuitBreakers.business.getStats(),
      group: circuitBreakers.group.getStats(),
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
  /**
   * POST /send/text - Enviar mensagem de texto
   *
   * TESTADO E FUNCIONANDO:
   * - Endpoint: POST /send/text
   * - Body: { number: "5512996269235", text: "mensagem" }
   * - Requer: header 'token' com token da instância
   */
  async sendText(instanceId: string, token: string, data: {
    number: string;
    text: string;
    delay?: number;
  }) {
    // Normalizar número (remover sufixo @s.whatsapp.net se presente)
    const number = data.number.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');

    console.log(`[UAZClient] Sending text to ${number} via POST /send/text`);

    return this.withRetry(async () => {
      return await this.request('POST', '/send/text', {
        token,
        body: {
          number,
          text: data.text,
          ...(data.delay && { delay: data.delay }),
        },
      });
    });
  }

  /**
   * POST /send/menu - Enviar menu interativo (botões, lista, enquete, carousel)
   */
  async sendMenu(instanceId: string, token: string, data: {
    number: string;
    type: 'button' | 'list' | 'poll' | 'carousel';
    text: string;
    choices: string[];
    footerText?: string;
    listButton?: string;
    selectableCount?: number;
    imageButton?: string;
    delay?: number;
  }) {
    const number = data.number.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');

    console.log(`[UAZClient] Sending menu (${data.type}) to ${number} via POST /send/menu`);

    return this.withRetry(async () => {
      return await this.request('POST', '/send/menu', {
        token,
        body: {
          number,
          type: data.type,
          text: data.text,
          choices: data.choices,
          ...(data.footerText && { footerText: data.footerText }),
          ...(data.listButton && { listButton: data.listButton }),
          ...(data.selectableCount && { selectableCount: data.selectableCount }),
          ...(data.imageButton && { imageButton: data.imageButton }),
          ...(data.delay && { delay: data.delay }),
        },
      });
    });
  }

  /**
   * POST /send/media - Enviar mídia (imagem, documento, áudio, vídeo)
   *
   * FORMATO DESCOBERTO VIA TESTES:
   * - Use 'type' (não 'mediatype')
   * - Use 'file' (não 'media')
   * - Para documentos, incluir 'filename'
   * - Para áudio PTT, usar type: 'ptt' ou type: 'audio' com ptt: true
   *
   * Tipos suportados:
   * - image: Envia como ImageMessage
   * - document: Envia como DocumentMessage (requer filename)
   * - audio: Envia como AudioMessage
   * - ptt: Envia como mensagem de voz (push-to-talk)
   * - video: Envia como VideoMessage (requer MP4 válido)
   */
  async sendMedia(instanceId: string, token: string, data: {
    number: string;
    mediatype: 'image' | 'video' | 'audio' | 'myaudio' | 'document';
    media: string; // URL ou base64 (data URI)
    caption?: string;
    filename?: string;
    mimetype?: string;
    ptt?: boolean;
  }) {
    // Normalizar número
    const number = data.number.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');

    // Mapear mediatype para type (formato esperado pela UAZapi)
    const typeMap: Record<string, string> = {
      'image': 'image',
      'video': 'video',
      'audio': 'audio',
      'myaudio': 'ptt',  // myaudio = mensagem de voz
      'document': 'document',
    };
    const type = typeMap[data.mediatype] || data.mediatype;

    // Montar body no formato correto
    const body: Record<string, any> = {
      number,
      type,
      file: data.media, // UAZapi espera 'file', não 'media'
    };

    // Adicionar caption se fornecido
    if (data.caption) {
      body.caption = data.caption;
    }

    // Para documentos, filename é obrigatório
    if (type === 'document' && data.filename) {
      body.filename = data.filename;
    }

    // Para áudio PTT
    if ((type === 'audio' || type === 'ptt') && data.ptt) {
      body.ptt = true;
    }

    console.log(`[UAZClient] Sending ${type} to ${number} via POST /send/media`);

    return this.withRetry(async () => {
      return await this.request('POST', '/send/media', {
        token,
        body,
      });
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

  /**
   * POST /chat/details - Obter detalhes completos de um chat
   * Retorna informações completas incluindo image e imagePreview
   *
   * @param instanceId - ID da instância
   * @param token - Token da instância
   * @param number - Número do telefone ou ID do grupo
   * @param preview - Se true, retorna imagem menor (default: false)
   * @returns Detalhes completos do chat incluindo foto de perfil
   */
  async getChatDetails(instanceId: string, token: string, number: string, preview: boolean = false) {
    return this.request('POST', '/chat/details', {
      token,
      body: { number, preview },
    });
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

  /**
   * POST /message/download - Baixar arquivo de uma mensagem de mídia
   *
   * @param token - Token da instância
   * @param messageId - ID da mensagem contendo a mídia
   * @param options - Opções de download
   * @returns URL do arquivo e opcionalmente dados em base64
   */
  async downloadMedia(token: string, messageId: string, options?: {
    return_base64?: boolean;
    generate_mp3?: boolean;     // Para áudios: true = MP3, false = OGG
    return_link?: boolean;      // Retorna URL pública do arquivo
    transcribe?: boolean;       // Transcreve áudios para texto
    openai_apikey?: string;     // Chave OpenAI para transcrição
    download_quoted?: boolean;  // Baixa mídia da mensagem citada
  }) {
    return this.request<{
      fileURL?: string;
      mimetype?: string;
      base64Data?: string;
      transcription?: string;
    }>('POST', '/message/download', {
      token,
      body: {
        id: messageId,
        return_base64: options?.return_base64 ?? false,
        generate_mp3: options?.generate_mp3 ?? true,
        return_link: options?.return_link ?? true,
        transcribe: options?.transcribe ?? false,
        ...(options?.openai_apikey && { openai_apikey: options.openai_apikey }),
        ...(options?.download_quoted && { download_quoted: options.download_quoted }),
      },
    });
  }

  // ===== HEALTH =====
  async ping() {
    return this.request('GET', '/ping');
  }

  // ===== CAROUSEL =====

  /** POST /send/carousel - Send carousel message */
  async sendCarousel(instanceId: string, token: string, data: {
    number: string;
    text: string;
    carousel: Array<{
      text: string;
      image?: string;
      buttons: Array<{ id: string; text: string; type?: 'REPLY' | 'URL'; url?: string }>;
    }>;
  }) {
    const number = data.number.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
    return this.withRetry(() => this.request('POST', '/send/carousel', {
      token,
      body: { number, text: data.text, carousel: data.carousel },
    }));
  }

  // ===== PAYMENT & LOCATION BUTTONS =====

  /** POST /send/pix-button - Send PIX payment button */
  async sendPixButton(token: string, data: {
    number: string;
    pixType: string;
    pixKey: string;
    pixName: string;
    text?: string;
    delay?: number;
  }) {
    const number = data.number.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
    return this.withRetry(() => this.request('POST', '/send/pix-button', {
      token,
      body: { number, pixType: data.pixType, pixKey: data.pixKey, pixName: data.pixName, ...(data.text && { text: data.text }), ...(data.delay && { delay: data.delay }) },
    }));
  }

  /** POST /send/request-payment - Send payment request */
  async sendPaymentRequest(token: string, data: {
    number: string;
    title: string;
    text: string;
    footer?: string;
    itemName: string;
    invoiceNumber: string;
    amount: number;
    pixKey: string;
    pixType: string;
    pixName: string;
    delay?: number;
  }) {
    const number = data.number.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
    return this.withRetry(() => this.request('POST', '/send/request-payment', {
      token,
      body: { number, title: data.title, text: data.text, footer: data.footer, itemName: data.itemName, invoiceNumber: data.invoiceNumber, amount: data.amount, pixKey: data.pixKey, pixType: data.pixType, pixName: data.pixName, ...(data.delay && { delay: data.delay }) },
    }));
  }

  /** POST /send/location-button - Send location request button */
  async sendLocationButton(token: string, data: { number: string; text: string; footer?: string }) {
    const number = data.number.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
    return this.withRetry(() => this.request('POST', '/send/location-button', {
      token,
      body: { number, text: data.text, ...(data.footer && { footer: data.footer }) },
    }));
  }

  // ===== STATUS/STORIES & EDIT MESSAGE =====

  /** POST /send/status - Send status/story */
  async sendStatus(token: string, data: {
    type: 'text' | 'video' | 'image' | 'audio' | 'ptt';
    text?: string;
    background_color?: number;
    font?: number;
    file?: string;
  }) {
    return this.withRetry(() => this.request('POST', '/send/status', { token, body: data }));
  }

  /** POST /message/edit - Edit an existing message */
  async editMessage(token: string, data: { id: string; text: string }) {
    return this.withRetry(() => this.request('POST', '/message/edit', { token, body: data }));
  }

  // ===== CHAT ACTIONS =====

  /** POST /chat/find - Search chats with filters */
  async findChats(token: string, data: {
    lead_name?: string;
    wa_isGroup?: boolean;
    wa_unreadCount?: string;
    sort?: Record<string, 1 | -1>;
    limit?: number;
    offset?: number;
  }) {
    return this.request('POST', '/chat/find', { token, body: data });
  }

  /** POST /chat/pin - Pin or unpin a chat */
  async pinChat(token: string, data: { number: string; pin: boolean }) {
    return this.request('POST', '/chat/pin', { token, body: data });
  }

  /** POST /chat/mute - Mute a chat */
  async muteChat(token: string, data: { number: string; muteEndTime: number }) {
    return this.request('POST', '/chat/mute', { token, body: data });
  }

  /** POST /chat/archive - Archive or unarchive a chat */
  async archiveChat(token: string, data: { number: string; archive: boolean }) {
    return this.request('POST', '/chat/archive', { token, body: data });
  }

  /** POST /chat/read - Mark chat as read or unread */
  async markChatRead(token: string, data: { number: string; read: boolean }) {
    return this.request('POST', '/chat/read', { token, body: data });
  }

  /** POST /chat/delete - Delete a chat */
  async deleteChat(token: string, data: {
    number: string;
    deleteChatWhatsApp?: boolean;
    deleteChatDB?: boolean;
    deleteMessagesDB?: boolean;
  }) {
    return this.request('POST', '/chat/delete', { token, body: data });
  }

  // ===== BLOCK/UNBLOCK =====

  /** POST /chat/block - Block or unblock a contact */
  async blockContact(token: string, data: { number: string; block: boolean }) {
    return this.request('POST', '/chat/block', { token, body: data });
  }

  /** GET /chat/blocklist - Get blocked contacts list */
  async getBlockList(token: string) {
    return this.request('GET', '/chat/blocklist', { token });
  }

  // ===== LABELS =====

  /** GET /labels - Get all labels */
  async getLabels(token: string) {
    return this.request('GET', '/labels', { token });
  }

  /** POST /chat/labels - Set labels on a chat */
  async setChatLabels(token: string, data: { number: string; labelids: string[] }) {
    return this.request('POST', '/chat/labels', { token, body: data });
  }

  /** POST /label/edit - Create, update or delete a label */
  async editLabel(token: string, data: { labelid: string; name?: string; color?: number; delete?: boolean }) {
    return this.request('POST', '/label/edit', { token, body: data });
  }

  // ===== ADVANCED CONTACTS =====

  /** POST /chat/check - Check if numbers are registered on WhatsApp */
  async checkNumber(token: string, data: { numbers: string[] }) {
    return this.request('POST', '/chat/check', { token, body: data });
  }

  /** POST /contact/add - Add a contact */
  async addContact(token: string, data: { phone: string; name: string }) {
    return this.request('POST', '/contact/add', { token, body: data });
  }

  /** POST /contact/remove - Remove a contact */
  async removeContact(token: string, data: { phone: string }) {
    return this.request('POST', '/contact/remove', { token, body: data });
  }

  /** POST /contacts/list - List contacts with pagination */
  async listContactsPaginated(token: string, data: { page?: number; pageSize?: number }) {
    return this.request('POST', '/contacts/list', { token, body: data });
  }

  // ===== BUSINESS PROFILE & CATALOG =====

  /** POST /business/get/profile - Get business profile */
  async getBusinessProfile(token: string, jid: string) {
    return this.request('POST', '/business/get/profile', { token, body: { jid } });
  }

  /** POST /business/update/profile - Update business profile */
  async updateBusinessProfile(token: string, data: {
    description?: string;
    address?: string;
    email?: string;
    website?: string;
    profilePictureUrl?: string;
  }) {
    return this.request('POST', '/business/update/profile', { token, body: data });
  }

  /** GET /business/get/categories - Get business categories */
  async getBusinessCategories(token: string) {
    return this.request('GET', '/business/get/categories', { token });
  }

  /** POST /business/catalog/list - List catalog products */
  async listCatalogProducts(token: string, jid: string) {
    return this.request('POST', '/business/catalog/list', { token, body: { jid } });
  }

  /** POST /business/catalog/info - Get catalog product info */
  async getCatalogProductInfo(token: string, jid: string, productId: string) {
    return this.request('POST', '/business/catalog/info', { token, body: { jid, id: productId } });
  }

  /** POST /business/catalog/show - Show a catalog product */
  async showCatalogProduct(token: string, id: string) {
    return this.request('POST', '/business/catalog/show', { token, body: { id } });
  }

  /** POST /business/catalog/hide - Hide a catalog product */
  async hideCatalogProduct(token: string, id: string) {
    return this.request('POST', '/business/catalog/hide', { token, body: { id } });
  }

  /** POST /business/catalog/delete - Delete a catalog product */
  async deleteCatalogProduct(token: string, id: string) {
    return this.request('POST', '/business/catalog/delete', { token, body: { id } });
  }

  // ===== CAMPAIGNS (SENDER) =====

  /** POST /sender/simple - Send bulk messages (simple mode) */
  async sendBulkSimple(token: string, data: {
    numbers: string[];
    type: string;
    folder: string;
    delayMin: number;
    delayMax: number;
    info?: string;
    text?: string;
    file?: string;
    linkPreview?: boolean;
  }) {
    return this.withRetry(() => this.request('POST', '/sender/simple', { token, body: data }));
  }

  /** POST /sender/advanced - Send bulk messages (advanced mode) */
  async sendBulkAdvanced(token: string, data: {
    delayMin: number;
    delayMax: number;
    info?: string;
    folder: string;
    messages: Array<{
      number: string;
      type: string;
      text?: string;
      file?: string;
      docName?: string;
    }>;
  }) {
    return this.withRetry(() => this.request('POST', '/sender/advanced', { token, body: data }));
  }

  /** POST /sender/edit - Edit campaign folder (delete/stop/continue) */
  async editCampaignFolder(token: string, data: { folder_id: string; action: 'delete' | 'stop' | 'continue' }) {
    return this.request('POST', '/sender/edit', { token, body: data });
  }

  /** GET /sender/listfolders - List campaign folders */
  async listCampaignFolders(token: string) {
    return this.request('GET', '/sender/listfolders', { token });
  }

  /** POST /sender/listmessages - List messages in a campaign folder */
  async listCampaignMessages(token: string, data: { folder_id: string; messageStatus?: string }) {
    return this.request('POST', '/sender/listmessages', { token, body: data });
  }

  /** POST /sender/cleardone - Clear completed campaigns */
  async clearCompletedCampaigns(token: string) {
    return this.request('POST', '/sender/cleardone', { token });
  }

  /** DELETE /sender/clearall - Clear all campaigns */
  async clearAllCampaigns(token: string) {
    return this.request('DELETE', '/sender/clearall', { token });
  }

  // ===== CALLS =====

  /** POST /call/make - Make a voice or video call */
  async makeCall(token: string, data: { number: string; isVideo?: boolean }) {
    return this.withRetry(() => this.request('POST', '/call/make', { token, body: data }));
  }

  /** POST /call/reject - Reject an incoming call */
  async rejectCall(token: string, data?: { number?: string; id?: string }) {
    return this.request('POST', '/call/reject', { token, body: data || {} });
  }

  // ===== GROUPS & COMMUNITIES =====

  /** GET /group/list - List all groups */
  async listGroups(token: string) {
    return this.request('GET', '/group/list', { token });
  }

  /** POST /group/info - Get group info */
  async getGroupInfo(token: string, data: { GroupJID: string; getInviteLink?: boolean; force?: boolean }) {
    return this.request('POST', '/group/info', { token, body: data });
  }

  /** POST /group/create - Create a new group */
  async createGroup(token: string, data: { name: string; participants: string[]; description?: string }) {
    return this.request('POST', '/group/create', { token, body: data });
  }

  /** POST /group/updateName - Update group name */
  async updateGroupName(token: string, data: { GroupJID: string; name: string }) {
    return this.request('POST', '/group/updateName', { token, body: data });
  }

  /** POST /group/updateDescription - Update group description */
  async updateGroupDescription(token: string, data: { GroupJID: string; description: string }) {
    return this.request('POST', '/group/updateDescription', { token, body: data });
  }

  /** POST /group/updateImage - Update group image */
  async updateGroupImage(token: string, data: { GroupJID: string; image: string }) {
    return this.request('POST', '/group/updateImage', { token, body: data });
  }

  /** POST /group/updateParticipants - Add/remove/promote/demote group participants */
  async updateGroupParticipants(token: string, data: { GroupJID: string; participants: string[]; action: 'add' | 'remove' | 'promote' | 'demote' }) {
    return this.request('POST', '/group/updateParticipants', { token, body: data });
  }

  /** POST /group/inviteLink - Get group invite link */
  async getGroupInviteLink(token: string, data: { GroupJID: string }) {
    return this.request('POST', '/group/inviteLink', { token, body: data });
  }

  /** POST /group/resetInviteCode - Reset group invite code */
  async resetGroupInviteCode(token: string, data: { GroupJID: string }) {
    return this.request('POST', '/group/resetInviteCode', { token, body: data });
  }

  /** POST /group/join - Join a group via invite code */
  async joinGroup(token: string, data: { inviteCode: string }) {
    return this.request('POST', '/group/join', { token, body: data });
  }

  /** POST /group/leave - Leave a group */
  async leaveGroup(token: string, data: { GroupJID: string }) {
    return this.request('POST', '/group/leave', { token, body: data });
  }

  /** POST /group/updateLocked - Lock/unlock group settings */
  async updateGroupLocked(token: string, data: { GroupJID: string; locked: boolean }) {
    return this.request('POST', '/group/updateLocked', { token, body: data });
  }

  /** POST /group/updateAnnounce - Set group announce mode */
  async updateGroupAnnounce(token: string, data: { GroupJID: string; announce: boolean }) {
    return this.request('POST', '/group/updateAnnounce', { token, body: data });
  }

  /** POST /community/create - Create a new community */
  async createCommunity(token: string, data: { name: string; participants: string[]; description?: string }) {
    return this.request('POST', '/community/create', { token, body: data });
  }

  /** POST /community/editgroups - Add/remove groups from community */
  async editCommunityGroups(token: string, data: { CommunityJID: string; groups: string[]; action: 'add' | 'remove' }) {
    return this.request('POST', '/community/editgroups', { token, body: data });
  }

  // ===== INSTANCE SETTINGS =====

  /** GET /instance/privacy - Get privacy settings */
  async getPrivacySettings(token: string) {
    return this.request('GET', '/instance/privacy', { token });
  }

  /** POST /instance/privacy - Set privacy settings */
  async setPrivacySettings(token: string, data: {
    groupadd?: string;
    last?: string;
    status?: string;
    profile?: string;
    readreceipts?: string;
    online?: string;
    calladd?: string;
  }) {
    return this.request('POST', '/instance/privacy', { token, body: data });
  }

  /** POST /instance/presence - Set instance presence */
  async setInstancePresence(token: string, data: { presence: 'available' | 'unavailable' }) {
    return this.request('POST', '/instance/presence', { token, body: data });
  }

  /** GET /instance/proxy - Get proxy configuration */
  async getProxyConfig(token: string) {
    return this.request('GET', '/instance/proxy', { token });
  }

  /** POST /instance/proxy - Set proxy configuration */
  async setProxyConfig(token: string, data: { enable: boolean; proxy_url?: string }) {
    return this.request('POST', '/instance/proxy', { token, body: data });
  }

  /** DELETE /instance/proxy - Remove proxy */
  async removeProxy(token: string) {
    return this.request('DELETE', '/instance/proxy', { token });
  }

  /** POST /instance/updateDelaySettings - Update message delay settings */
  async updateDelaySettings(token: string, data: { msg_delay_min: number; msg_delay_max: number }) {
    return this.request('POST', '/instance/updateDelaySettings', { token, body: data });
  }

  // ===== QUICK REPLIES =====

  /** GET /quickreply/showall - Get all quick replies */
  async getAllQuickReplies(token: string) {
    return this.request('GET', '/quickreply/showall', { token });
  }

  /** POST /quickreply/edit - Create, update or delete a quick reply */
  async editQuickReply(token: string, data: {
    delete?: boolean;
    id?: string;
    shortCut: string;
    text: string;
    type: 'text' | 'audio' | 'ptt' | 'document' | 'video' | 'image';
    file?: string;
    docName?: string;
  }) {
    return this.request('POST', '/quickreply/edit', { token, body: data });
  }

  // ===== CRM LEAD MANAGEMENT =====

  /** POST /chat/editLead - Edit lead data */
  async editLead(token: string, data: {
    id: string;
    lead_name?: string;
    lead_fullName?: string;
    lead_email?: string;
    lead_status?: string;
    lead_tags?: string[];
    lead_notes?: string;
    lead_disableChatBotUntil?: string;
    lead_isTicketOpen?: boolean;
    lead_assignedAgent_id?: string;
    [key: string]: any;
  }) {
    return this.request('POST', '/chat/editLead', { token, body: data });
  }

  /** POST /instance/updateFieldsMap - Update custom fields mapping */
  async updateFieldsMap(token: string, data: Record<string, string>) {
    return this.request('POST', '/instance/updateFieldsMap', { token, body: data });
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
    const { systemSettingsRepository } = await import('@/server/core/system-settings/system-settings.repository');
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
