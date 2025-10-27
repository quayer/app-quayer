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
  async createInstance(data: {
    instanceName: string;
    webhook?: string;
    webhookEvents?: string[];
  }) {
    return this.request('POST', '/instance/create', { body: data });
  }

  async deleteInstance(instanceId: string) {
    return this.request('DELETE', `/instance/delete/${instanceId}`);
  }

  async getInstanceInfo(instanceId: string, token: string) {
    return this.request('GET', `/instance/info/${instanceId}`, { token });
  }

  async getInstanceQRCode(instanceId: string, token: string) {
    return this.request('GET', `/instance/qrcode/${instanceId}`, { token });
  }

  async getPairingCode(instanceId: string, token: string) {
    return this.request('GET', `/instance/paircode/${instanceId}`, { token });
  }

  async disconnectInstance(instanceId: string, token: string) {
    return this.request('POST', `/instance/logout/${instanceId}`, { token });
  }

  async restartInstance(instanceId: string, token: string) {
    return this.request('POST', `/instance/restart/${instanceId}`, { token });
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

  // ===== WEBHOOKS =====
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

  // ===== HEALTH =====
  async ping() {
    return this.request('GET', '/ping');
  }
}
