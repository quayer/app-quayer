/**
 * @module CloudAPI Client
 * @description HTTP client for WhatsApp Cloud API (Graph API)
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/reference
 */

import type {
  CloudAPIClientConfig,
  CloudAPIMessageResponse,
  CloudAPIPhoneInfo,
  CloudAPIMediaUploadResponse,
  CloudAPIMediaUrlResponse,
  CloudAPISendTextPayload,
  CloudAPISendImagePayload,
  CloudAPISendVideoPayload,
  CloudAPISendAudioPayload,
  CloudAPISendDocumentPayload,
  CloudAPISendTemplatePayload,
  CloudAPISendLocationPayload,
  CloudAPIErrorResponse,
} from './cloudapi.types';

/**
 * @class CloudAPIClient
 * @description HTTP client for WhatsApp Cloud API (Meta Graph API)
 * Handles all HTTP communication with the Cloud API endpoints
 */
export class CloudAPIClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly wabaId: string;
  private readonly timeout: number;

  constructor(config: CloudAPIClientConfig) {
    const apiVersion = config.apiVersion || 'v20.0';
    this.baseUrl = `https://graph.facebook.com/${apiVersion}`;
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.wabaId = config.wabaId;
    this.timeout = config.timeout || 30000;
  }

  // ===== PRIVATE HELPERS =====

  /**
   * Make HTTP request to Graph API
   */
  private async request<T = any>(
    method: string,
    path: string,
    body?: any,
    headers?: Record<string, string>
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
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        const errorData = data as CloudAPIErrorResponse;
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
   * Format phone number to Cloud API format
   * Removes @c.us suffix and non-numeric characters
   */
  private formatPhoneNumber(number: string): string {
    // Remove @c.us suffix if present (compatibility with UAZapi format)
    // Keep only numbers (remove + and other special chars)
    return number
      .replace(/@c\.us$/, '')
      .replace(/@s\.whatsapp\.net$/, '')
      .replace(/[^\d]/g, '');
  }

  // ===== PHONE INFO =====

  /**
   * Get phone number information
   * Used to validate credentials and get phone status
   */
  async getPhoneInfo(): Promise<CloudAPIPhoneInfo> {
    return this.request<CloudAPIPhoneInfo>(
      'GET',
      `/${this.phoneNumberId}?fields=verified_name,display_phone_number,id,quality_rating,code_verification_status,platform_type,throughput`
    );
  }

  /**
   * Health check - validate if credentials are working
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getPhoneInfo();
      return true;
    } catch (error) {
      console.error('[CloudAPI] Health check failed:', error);
      return false;
    }
  }

  // ===== SEND MESSAGES =====

  /**
   * Send a text message
   */
  async sendText(to: string, text: string, previewUrl: boolean = false): Promise<CloudAPIMessageResponse> {
    const payload: CloudAPISendTextPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'text',
      text: {
        preview_url: previewUrl,
        body: text,
      },
    };

    return this.request<CloudAPIMessageResponse>('POST', `/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send an image message
   */
  async sendImage(to: string, imageUrl: string, caption?: string): Promise<CloudAPIMessageResponse> {
    const payload: CloudAPISendImagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'image',
      image: {
        link: imageUrl,
        caption,
      },
    };

    return this.request<CloudAPIMessageResponse>('POST', `/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send a video message
   */
  async sendVideo(to: string, videoUrl: string, caption?: string): Promise<CloudAPIMessageResponse> {
    const payload: CloudAPISendVideoPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'video',
      video: {
        link: videoUrl,
        caption,
      },
    };

    return this.request<CloudAPIMessageResponse>('POST', `/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send an audio message
   */
  async sendAudio(to: string, audioUrl: string): Promise<CloudAPIMessageResponse> {
    const payload: CloudAPISendAudioPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'audio',
      audio: {
        link: audioUrl,
      },
    };

    return this.request<CloudAPIMessageResponse>('POST', `/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send a document message
   */
  async sendDocument(
    to: string,
    documentUrl: string,
    filename: string,
    caption?: string
  ): Promise<CloudAPIMessageResponse> {
    const payload: CloudAPISendDocumentPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'document',
      document: {
        link: documentUrl,
        filename,
        caption,
      },
    };

    return this.request<CloudAPIMessageResponse>('POST', `/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send a location message
   */
  async sendLocation(
    to: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string
  ): Promise<CloudAPIMessageResponse> {
    const payload: CloudAPISendLocationPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'location',
      location: {
        latitude,
        longitude,
        name,
        address,
      },
    };

    return this.request<CloudAPIMessageResponse>('POST', `/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send a template message (required for initiating conversations)
   */
  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string = 'pt_BR',
    components?: CloudAPISendTemplatePayload['template']['components']
  ): Promise<CloudAPIMessageResponse> {
    const payload: CloudAPISendTemplatePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components,
      },
    };

    return this.request<CloudAPIMessageResponse>('POST', `/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send a message with media ID (pre-uploaded media)
   */
  async sendMediaById(
    to: string,
    mediaId: string,
    type: 'image' | 'video' | 'audio' | 'document',
    options?: { caption?: string; filename?: string }
  ): Promise<CloudAPIMessageResponse> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type,
      [type]: {
        id: mediaId,
        ...(options?.caption && { caption: options.caption }),
        ...(options?.filename && { filename: options.filename }),
      },
    };

    return this.request<CloudAPIMessageResponse>('POST', `/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send a contact message
   */
  async sendContact(
    to: string,
    contact: { name: string; phone: string }
  ): Promise<CloudAPIMessageResponse> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'contacts',
      contacts: [{
        name: {
          formatted_name: contact.name,
          first_name: contact.name,
        },
        phones: [{
          phone: contact.phone,
          type: 'CELL',
        }],
      }],
    };

    return this.request<CloudAPIMessageResponse>('POST', `/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send an interactive list message
   */
  async sendInteractiveList(
    to: string,
    interactive: {
      header?: { type: 'text'; text: string };
      body: { text: string };
      footer?: { text: string };
      action: {
        button: string;
        sections: Array<{
          title: string;
          rows: Array<{
            id: string;
            title: string;
            description?: string;
          }>;
        }>;
      };
    }
  ): Promise<CloudAPIMessageResponse> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'interactive',
      interactive: {
        type: 'list',
        ...interactive,
      },
    };

    return this.request<CloudAPIMessageResponse>('POST', `/${this.phoneNumberId}/messages`, payload);
  }

  /**
   * Send an interactive button message
   */
  async sendInteractiveButtons(
    to: string,
    interactive: {
      header?: any;
      body: { text: string };
      footer?: { text: string };
      action: {
        buttons: Array<{
          type: 'reply';
          reply: {
            id: string;
            title: string;
          };
        }>;
      };
    }
  ): Promise<CloudAPIMessageResponse> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'interactive',
      interactive: {
        type: 'button',
        ...interactive,
      },
    };

    return this.request<CloudAPIMessageResponse>('POST', `/${this.phoneNumberId}/messages`, payload);
  }

  // ===== MEDIA HANDLING =====

  /**
   * Get media URL from media ID
   * The URL is temporary and expires after some time
   */
  async getMediaUrl(mediaId: string): Promise<CloudAPIMediaUrlResponse> {
    return this.request<CloudAPIMediaUrlResponse>('GET', `/${mediaId}`);
  }

  /**
   * Download media from URL (requires auth header)
   */
  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(mediaUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
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
      
      if (error.name === 'AbortError') {
        throw new Error(`Media download timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Upload media to Cloud API
   * Returns a media ID that can be used to send the media
   */
  async uploadMedia(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<CloudAPIMediaUploadResponse> {
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    formData.append('file', new Blob([fileBuffer], { type: mimeType }), filename);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout * 2); // Longer timeout for uploads

    try {
      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/media`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        const errorData = data as CloudAPIErrorResponse;
        throw new Error(errorData.error?.message || `Upload failed: HTTP ${response.status}`);
      }

      return data as CloudAPIMediaUploadResponse;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Media upload timeout`);
      }
      throw error;
    }
  }

  // ===== WABA INFO =====

  /**
   * Get WABA (WhatsApp Business Account) info
   */
  async getWabaInfo(): Promise<any> {
    return this.request('GET', `/${this.wabaId}?fields=id,name,currency,timezone_id,message_template_namespace`);
  }

  /**
   * List phone numbers associated with WABA
   */
  async listPhoneNumbers(): Promise<any> {
    return this.request('GET', `/${this.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`);
  }

  // ===== MARK AS READ =====

  /**
   * Mark a message as read
   */
  async markAsRead(messageId: string): Promise<any> {
    return this.request('POST', `/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  // ===== REACTION =====

  /**
   * React to a message
   */
  async reactToMessage(messageId: string, emoji: string): Promise<CloudAPIMessageResponse> {
    return this.request('POST', `/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      type: 'reaction',
      reaction: {
        message_id: messageId,
        emoji,
      },
    });
  }

  // ===== GETTERS =====

  getPhoneNumberId(): string {
    return this.phoneNumberId;
  }

  getWabaId(): string {
    return this.wabaId;
  }
}
