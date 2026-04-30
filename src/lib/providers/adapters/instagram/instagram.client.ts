/**
 * @module Instagram Client
 * @description HTTP client for Instagram Messaging API (Meta Graph API)
 */

import type {
  InstagramClientConfig,
  InstagramMessageResponse,
} from './instagram.types';

export class InstagramClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly instagramAccountId: string;
  private readonly pageId: string;
  private readonly timeout: number;

  constructor(config: InstagramClientConfig) {
    const apiVersion = config.apiVersion || 'v20.0';
    this.baseUrl = `https://graph.facebook.com/${apiVersion}`;
    this.accessToken = config.accessToken;
    this.instagramAccountId = config.instagramAccountId;
    this.pageId = config.pageId;
    this.timeout = config.timeout || 30000;
  }

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
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error?.message || `HTTP ${response.status}`;
        throw new Error(errorMessage);
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

  async healthCheck(): Promise<boolean> {
    try {
      await this.request('GET', `/${this.pageId}?fields=id,name`);
      return true;
    } catch {
      return false;
    }
  }

  async sendText(recipientId: string, text: string): Promise<InstagramMessageResponse> {
    return this.request<InstagramMessageResponse>('POST', `/${this.pageId}/messages`, {
      recipient: { id: recipientId },
      message: { text },
      messaging_type: 'RESPONSE',
    });
  }

  async sendImage(recipientId: string, imageUrl: string): Promise<InstagramMessageResponse> {
    return this.request<InstagramMessageResponse>('POST', `/${this.pageId}/messages`, {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'image',
          payload: { url: imageUrl, is_reusable: true },
        },
      },
      messaging_type: 'RESPONSE',
    });
  }

  async sendVideo(recipientId: string, videoUrl: string): Promise<InstagramMessageResponse> {
    return this.request<InstagramMessageResponse>('POST', `/${this.pageId}/messages`, {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'video',
          payload: { url: videoUrl, is_reusable: true },
        },
      },
      messaging_type: 'RESPONSE',
    });
  }

  async sendAudio(recipientId: string, audioUrl: string): Promise<InstagramMessageResponse> {
    return this.request<InstagramMessageResponse>('POST', `/${this.pageId}/messages`, {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'audio',
          payload: { url: audioUrl, is_reusable: true },
        },
      },
      messaging_type: 'RESPONSE',
    });
  }

  async sendSticker(recipientId: string, stickerUrl: string): Promise<InstagramMessageResponse> {
    return this.request<InstagramMessageResponse>('POST', `/${this.pageId}/messages`, {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'image',
          payload: { url: stickerUrl, is_reusable: false },
        },
      },
      messaging_type: 'RESPONSE',
    });
  }

  async markAsRead(messageId: string): Promise<void> {
    await this.request('POST', `/${this.pageId}/messages`, {
      recipient: { id: messageId },
      sender_action: 'mark_seen',
    });
  }

  async reactToMessage(messageId: string, emoji: string): Promise<void> {
    await this.request('POST', `/${this.pageId}/messages`, {
      recipient: { comment_id: messageId },
      message: { text: emoji },
      messaging_type: 'RESPONSE',
    });
  }

  async sendTypingOn(recipientId: string): Promise<void> {
    await this.request('POST', `/${this.pageId}/messages`, {
      recipient: { id: recipientId },
      sender_action: 'typing_on',
    });
  }

  async sendTypingOff(recipientId: string): Promise<void> {
    await this.request('POST', `/${this.pageId}/messages`, {
      recipient: { id: recipientId },
      sender_action: 'typing_off',
    });
  }

  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(mediaUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to download media: HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') throw new Error('Media download timeout');
      throw error;
    }
  }

  getPageId(): string {
    return this.pageId;
  }

  getInstagramAccountId(): string {
    return this.instagramAccountId;
  }
}
