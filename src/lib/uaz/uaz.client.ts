/**
 * UAZ API Client
 *
 * Cliente completo para integração com UAZ API (WhatsApp)
 * https://quayer.uazapi.com
 */

/**
 * Configuração do UAZ Client
 */
export interface UAZConfig {
  baseUrl: string;
  adminToken: string;
  timeout?: number;
}

/**
 * Status da instância
 */
export type InstanceStatus = 'connected' | 'disconnected' | 'connecting' | 'qr';

/**
 * Resposta da API UAZ
 */
export interface UAZResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Dados da instância
 */
export interface InstanceData {
  instanceId: string;
  status: InstanceStatus;
  phoneNumber?: string;
  qrCode?: string;
  webhookUrl?: string;
  createdAt: string;
  lastConnected?: string;
}

/**
 * Dados de mensagem
 */
export interface MessageData {
  to: string;
  message: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  delay?: number;
}

/**
 * Cliente UAZ API
 */
export class UAZClient {
  private config: Required<UAZConfig>;

  constructor(config: UAZConfig) {
    this.config = {
      ...config,
      timeout: config.timeout || 30000,
    };
  }

  /**
   * Faz requisição HTTP para a API
   */
  private async request<T = any>(
    method: string,
    endpoint: string,
    data?: any,
    token?: string
  ): Promise<UAZResponse<T>> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token || this.config.adminToken}`,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseData = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: responseData.message || responseData.error || 'Request failed',
        };
      }

      return {
        success: true,
        data: responseData,
      };
    } catch (error: any) {
      console.error('UAZ API Error:', error);

      return {
        success: false,
        error: error.message || 'Network error',
      };
    }
  }

  /**
   * 1. Criar nova instância
   */
  async createInstance(params: {
    name: string;
    webhookUrl?: string;
    token?: string;
  }): Promise<UAZResponse<InstanceData>> {
    return this.request('POST', '/instance/create', params, params.token);
  }

  /**
   * 2. Obter informações da instância
   */
  async getInstance(instanceId: string, token?: string): Promise<UAZResponse<InstanceData>> {
    return this.request('GET', `/instance/${instanceId}`, undefined, token);
  }

  /**
   * 3. Listar todas as instâncias
   */
  async listInstances(token?: string): Promise<UAZResponse<InstanceData[]>> {
    return this.request('GET', '/instance/list', undefined, token);
  }

  /**
   * 4. Conectar instância (gerar QR Code)
   */
  async connectInstance(
    instanceId: string,
    token?: string
  ): Promise<UAZResponse<{ qrCode: string; status: InstanceStatus }>> {
    return this.request('POST', `/instance/${instanceId}/connect`, undefined, token);
  }

  /**
   * 5. Desconectar instância
   */
  async disconnectInstance(
    instanceId: string,
    logout: boolean = false,
    token?: string
  ): Promise<UAZResponse<{ status: InstanceStatus }>> {
    return this.request('POST', `/instance/${instanceId}/disconnect`, { logout }, token);
  }

  /**
   * 6. Deletar instância
   */
  async deleteInstance(instanceId: string, token?: string): Promise<UAZResponse<void>> {
    return this.request('DELETE', `/instance/${instanceId}`, undefined, token);
  }

  /**
   * 7. Obter QR Code
   */
  async getQRCode(
    instanceId: string,
    format: 'base64' | 'svg' | 'terminal' = 'base64',
    token?: string
  ): Promise<UAZResponse<{ qrCode: string }>> {
    return this.request('GET', `/instance/${instanceId}/qr?format=${format}`, undefined, token);
  }

  /**
   * 8. Verificar status da conexão
   */
  async getConnectionStatus(
    instanceId: string,
    token?: string
  ): Promise<UAZResponse<{ status: InstanceStatus; phoneNumber?: string }>> {
    return this.request('GET', `/instance/${instanceId}/status`, undefined, token);
  }

  /**
   * 9. Enviar mensagem de texto
   */
  async sendMessage(
    instanceId: string,
    message: MessageData,
    token?: string
  ): Promise<UAZResponse<{ messageId: string }>> {
    return this.request('POST', `/instance/${instanceId}/send/text`, message, token);
  }

  /**
   * 10. Enviar mensagem com mídia
   */
  async sendMedia(
    instanceId: string,
    params: {
      to: string;
      mediaUrl: string;
      mediaType: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      filename?: string;
    },
    token?: string
  ): Promise<UAZResponse<{ messageId: string }>> {
    return this.request('POST', `/instance/${instanceId}/send/media`, params, token);
  }

  /**
   * 11. Enviar mensagens em lote
   */
  async sendBulkMessages(
    instanceId: string,
    messages: MessageData[],
    options?: {
      respectDelay?: boolean;
      randomizeDelay?: boolean;
    },
    token?: string
  ): Promise<UAZResponse<{ jobId: string; total: number }>> {
    return this.request(
      'POST',
      `/instance/${instanceId}/send/bulk`,
      { messages, options },
      token
    );
  }

  /**
   * 12. Verificar se número está no WhatsApp
   */
  async checkNumber(
    instanceId: string,
    phoneNumber: string,
    token?: string
  ): Promise<UAZResponse<{ exists: boolean; jid?: string }>> {
    return this.request(
      'GET',
      `/instance/${instanceId}/check/${phoneNumber}`,
      undefined,
      token
    );
  }

  /**
   * 13. Configurar webhook
   */
  async setWebhook(
    instanceId: string,
    webhookUrl: string,
    events?: string[],
    token?: string
  ): Promise<UAZResponse<void>> {
    return this.request(
      'POST',
      `/instance/${instanceId}/webhook`,
      { url: webhookUrl, events },
      token
    );
  }

  /**
   * 14. Obter perfil do WhatsApp
   */
  async getProfile(
    instanceId: string,
    phoneNumber: string,
    token?: string
  ): Promise<
    UAZResponse<{
      name: string;
      profilePicUrl?: string;
      status?: string;
    }>
  > {
    return this.request('GET', `/instance/${instanceId}/profile/${phoneNumber}`, undefined, token);
  }

  /**
   * 15. Obter estatísticas da instância
   */
  async getStats(
    instanceId: string,
    startDate?: string,
    endDate?: string,
    token?: string
  ): Promise<
    UAZResponse<{
      messagesSent: number;
      messagesReceived: number;
      mediaSent: number;
      errors: number;
      uptime: number;
    }>
  > {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request('GET', `/instance/${instanceId}/stats${query}`, undefined, token);
  }

  /**
   * Helper: Aguarda conexão da instância
   *
   * Faz polling do status até que a instância esteja conectada
   */
  async waitForConnection(
    instanceId: string,
    maxAttempts: number = 60,
    intervalMs: number = 2000,
    token?: string
  ): Promise<UAZResponse<{ status: InstanceStatus; phoneNumber?: string }>> {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await this.getConnectionStatus(instanceId, token);

      if (!response.success) {
        return response;
      }

      if (response.data?.status === 'connected') {
        return response;
      }

      if (response.data?.status === 'disconnected') {
        return {
          success: false,
          error: 'Instance disconnected during connection attempt',
        };
      }

      // Aguardar antes da próxima tentativa
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return {
      success: false,
      error: 'Connection timeout',
    };
  }
}

/**
 * Cliente UAZ singleton
 */
export const uazClient = new UAZClient({
  baseUrl: process.env.UAZAPI_URL || 'https://quayer.uazapi.com',
  adminToken: process.env.UAZAPI_ADMIN_TOKEN || '',
});
