/**
 * UAZapi HTTP Client
 *
 * Cliente HTTP para comunicação com a API UAZapi
 */

export interface UAZClientConfig {
  baseUrl: string;
  adminToken: string;
  timeout?: number;
}

export interface UAZResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export class UAZClient {
  private baseUrl: string;
  private adminToken: string;
  private timeout: number;

  constructor(config: UAZClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.adminToken = config.adminToken;
    this.timeout = config.timeout || 30000; // 30s default
  }

  /**
   * Request genérico
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
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      return data;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
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
    return this.request('POST', `/send/text`, {
      token,
      body: {
        number: data.number,
        text: data.text,
        delay: data.delay,
      },
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
    return this.request('POST', `/send/media`, {
      token,
      body: data,
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
}
