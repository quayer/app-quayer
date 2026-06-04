/**
 * @module Instagram Client
 * @description HTTP client for Instagram Messaging (Meta Graph API)
 * @see https://developers.facebook.com/docs/messenger-platform/instagram
 *
 * Handles all HTTP communication with the Graph API endpoints used for
 * Instagram DMs. Outbound text goes through `/me/messages` authenticated with
 * the Page Access Token.
 */

import type {
  InstagramClientConfig,
  InstagramMessageResponse,
  InstagramSendMessagePayload,
  InstagramErrorResponse,
} from './instagram.types';

/**
 * @class InstagramClient
 * @description HTTP client for Instagram Messaging via Meta Graph API
 */
export class InstagramClient {
  private readonly baseUrl: string;
  private readonly igAccountId: string;
  private readonly pageAccessToken: string;
  private readonly appSecret: string;
  private readonly verifyToken: string;
  private readonly timeout: number;

  constructor(config: InstagramClientConfig) {
    const apiVersion = config.apiVersion || 'v20.0';
    this.baseUrl = `https://graph.facebook.com/${apiVersion}`;
    this.igAccountId = config.igAccountId;
    this.pageAccessToken = config.pageAccessToken;
    this.appSecret = config.appSecret;
    this.verifyToken = config.verifyToken;
    this.timeout = config.timeout || 30000;
  }

  // ===== PRIVATE HELPERS =====

  /**
   * Make an HTTP request to the Graph API
   */
  private async request<T = any>(
    method: string,
    path: string,
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${this.pageAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        const errorData = data as InstagramErrorResponse;
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
        const error = new Error(errorMessage) as Error & { code: number; response: any };
        error.code = errorData.error?.code || response.status;
        error.response = errorData;
        throw error;
      }

      return data as T;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Extract the Instagram-scoped recipient id (IGSID) from a raw value.
   * Strips any provider-specific suffixes that may leak in from other modules.
   */
  private formatRecipientId(id: string): string {
    return id
      .replace(/@c\.us$/, '')
      .replace(/@s\.whatsapp\.net$/, '')
      .trim();
  }

  // ===== ACCOUNT INFO =====

  /**
   * Get basic Instagram account info. Used to validate credentials.
   */
  async getAccountInfo(): Promise<{ id: string; username?: string }> {
    return this.request<{ id: string; username?: string }>(
      'GET',
      `/${this.igAccountId}?fields=id,username`,
    );
  }

  /**
   * Health check — validate that the Page Access Token works.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getAccountInfo();
      return true;
    } catch (error) {
      console.error('[Instagram] Health check failed:', error);
      return false;
    }
  }

  // ===== SEND MESSAGES =====

  /**
   * Send a text message via the Messenger send API (`/me/messages`).
   */
  async sendText(to: string, text: string): Promise<InstagramMessageResponse> {
    const payload: InstagramSendMessagePayload = {
      recipient: { id: this.formatRecipientId(to) },
      message: { text },
      messaging_type: 'RESPONSE',
    };

    return this.request<InstagramMessageResponse>('POST', `/me/messages`, payload);
  }

  // ===== GETTERS =====

  getAccountId(): string {
    return this.igAccountId;
  }

  getAppSecret(): string {
    return this.appSecret;
  }

  getVerifyToken(): string {
    return this.verifyToken;
  }
}
