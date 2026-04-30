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
    // Convert Buffer to BlobPart compatible format
    formData.append('file', new Blob([fileBuffer as unknown as BlobPart], { type: mimeType }), filename);

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

  // ===== TEMPLATES CRUD =====

  /**
   * List message templates for the WABA
   * Supports pagination and filtering by status/name
   */
  async listTemplates(params?: {
    limit?: number;
    after?: string;
    status?: string;
    name?: string;
  }): Promise<any> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.after) query.set('after', params.after);
    if (params?.status) query.set('status', params.status);
    if (params?.name) query.set('name', params.name);
    const qs = query.toString();
    return this.request('GET', `/${this.wabaId}/message_templates${qs ? '?' + qs : ''}`);
  }

  /**
   * Get a single template by its ID
   */
  async getTemplate(templateId: string): Promise<any> {
    return this.request('GET', `/${templateId}`);
  }

  /**
   * Create a new message template
   */
  async createTemplate(data: {
    name: string;
    language: string;
    category: string;
    components: any[];
  }): Promise<any> {
    return this.request('POST', `/${this.wabaId}/message_templates`, data);
  }

  /**
   * Edit an existing template by ID
   */
  async editTemplate(templateId: string, data: { components: any[] }): Promise<any> {
    return this.request('POST', `/${templateId}`, data);
  }

  /**
   * Delete a template by ID
   */
  async deleteTemplate(templateId: string): Promise<any> {
    return this.request('DELETE', `/${templateId}`);
  }

  /**
   * Delete a template by name
   */
  async deleteTemplateByName(name: string): Promise<any> {
    return this.request(
      'DELETE',
      `/${this.wabaId}/message_templates?name=${encodeURIComponent(name)}`
    );
  }

  // ===== FLOWS CRUD =====

  /**
   * List all flows for the WABA
   */
  async listFlows(): Promise<any> {
    return this.request('GET', `/${this.wabaId}/flows`);
  }

  /**
   * Get a single flow by ID
   */
  async getFlow(flowId: string): Promise<any> {
    return this.request('GET', `/${flowId}`);
  }

  /**
   * Create a new flow
   */
  async createFlow(data: {
    name: string;
    categories: string[];
    clone_flow_id?: string;
    endpoint_uri?: string;
  }): Promise<any> {
    return this.request('POST', `/${this.wabaId}/flows`, data);
  }

  /**
   * Update flow metadata
   */
  async updateFlow(flowId: string, data: Record<string, any>): Promise<any> {
    return this.request('POST', `/${flowId}`, data);
  }

  /**
   * Publish a draft flow
   */
  async publishFlow(flowId: string): Promise<any> {
    return this.request('POST', `/${flowId}/publish`);
  }

  /**
   * Deprecate a published flow
   */
  async deprecateFlow(flowId: string): Promise<any> {
    return this.request('POST', `/${flowId}/deprecate`);
  }

  /**
   * Delete a flow
   */
  async deleteFlow(flowId: string): Promise<any> {
    return this.request('DELETE', `/${flowId}`);
  }

  /**
   * Send a flow message to a user
   */
  async sendFlowMessage(
    to: string,
    data: {
      flowId: string;
      flowCta: string;
      mode: 'draft' | 'published';
      flowActionPayload?: Record<string, any>;
      headerText?: string;
      bodyText?: string;
      footerText?: string;
    }
  ): Promise<CloudAPIMessageResponse> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'interactive',
      interactive: {
        type: 'flow',
        ...(data.headerText && { header: { type: 'text', text: data.headerText } }),
        body: { text: data.bodyText || 'Flow message' },
        ...(data.footerText && { footer: { text: data.footerText } }),
        action: {
          name: 'flow',
          parameters: {
            flow_id: data.flowId,
            flow_cta: data.flowCta,
            mode: data.mode,
            ...(data.flowActionPayload && {
              flow_action_payload: data.flowActionPayload,
            }),
          },
        },
      },
    };
    return this.request<CloudAPIMessageResponse>(
      'POST',
      `/${this.phoneNumberId}/messages`,
      payload
    );
  }

  /**
   * Upload/update flow JSON definition
   * Uses form-data upload (cannot use the standard request() helper)
   */
  async updateFlowJSON(
    flowId: string,
    jsonContent: string | Record<string, any>
  ): Promise<any> {
    const jsonStr =
      typeof jsonContent === 'string' ? jsonContent : JSON.stringify(jsonContent);
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([jsonStr], { type: 'application/json' }),
      'flow.json'
    );
    formData.append('name', 'flow.json');
    formData.append('asset_type', 'FLOW_JSON');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/${flowId}/assets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.accessToken}` },
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || `Upload failed: ${response.status}`);
      }
      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Flow JSON upload timeout');
      }
      throw error;
    }
  }

  // ===== BUSINESS PROFILE =====

  /**
   * Get the WhatsApp Business Profile for this phone number
   */
  async getBusinessProfile(): Promise<any> {
    return this.request(
      'GET',
      `/${this.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`
    );
  }

  /**
   * Update the WhatsApp Business Profile
   */
  async updateBusinessProfile(data: Record<string, any>): Promise<any> {
    return this.request('POST', `/${this.phoneNumberId}/whatsapp_business_profile`, {
      messaging_product: 'whatsapp',
      ...data,
    });
  }

  // ===== COMMERCE =====

  /**
   * Get commerce settings for this phone number
   */
  async getCommerceSettings(): Promise<any> {
    return this.request(
      'GET',
      `/${this.phoneNumberId}/whatsapp_commerce_settings`
    );
  }

  /**
   * Update commerce settings
   */
  async updateCommerceSettings(data: {
    is_catalog_visible?: boolean;
    is_cart_enabled?: boolean;
  }): Promise<any> {
    return this.request('POST', `/${this.phoneNumberId}/whatsapp_commerce_settings`, {
      ...data,
    });
  }

  /**
   * Send a single product message
   */
  async sendProductMessage(
    to: string,
    catalogId: string,
    productRetailerId: string,
    body?: string,
    footer?: string
  ): Promise<CloudAPIMessageResponse> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'interactive',
      interactive: {
        type: 'product',
        body: body ? { text: body } : undefined,
        footer: footer ? { text: footer } : undefined,
        action: {
          catalog_id: catalogId,
          product_retailer_id: productRetailerId,
        },
      },
    };
    return this.request<CloudAPIMessageResponse>(
      'POST',
      `/${this.phoneNumberId}/messages`,
      payload
    );
  }

  /**
   * Send a product list message with sections
   */
  async sendProductListMessage(
    to: string,
    data: {
      catalogId: string;
      headerText: string;
      bodyText: string;
      footerText?: string;
      sections: Array<{
        title: string;
        productItems: Array<{ product_retailer_id: string }>;
      }>;
    }
  ): Promise<CloudAPIMessageResponse> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'interactive',
      interactive: {
        type: 'product_list',
        header: { type: 'text', text: data.headerText },
        body: { text: data.bodyText },
        ...(data.footerText && { footer: { text: data.footerText } }),
        action: {
          catalog_id: data.catalogId,
          sections: data.sections,
        },
      },
    };
    return this.request<CloudAPIMessageResponse>(
      'POST',
      `/${this.phoneNumberId}/messages`,
      payload
    );
  }

  /**
   * Send a catalog message (shows entire catalog)
   */
  async sendCatalogMessage(
    to: string,
    bodyText: string,
    footerText?: string,
    thumbnailProductRetailerId?: string
  ): Promise<CloudAPIMessageResponse> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'interactive',
      interactive: {
        type: 'catalog_message',
        body: { text: bodyText },
        ...(footerText && { footer: { text: footerText } }),
        action: {
          name: 'catalog_message',
          ...(thumbnailProductRetailerId && {
            parameters: {
              thumbnail_product_retailer_id: thumbnailProductRetailerId,
            },
          }),
        },
      },
    };
    return this.request<CloudAPIMessageResponse>(
      'POST',
      `/${this.phoneNumberId}/messages`,
      payload
    );
  }

  // ===== QR CODES =====

  /**
   * Create a QR code with a prefilled message
   */
  async createQRCode(prefilledMessage: string): Promise<any> {
    return this.request('POST', `/${this.phoneNumberId}/message_qrdls`, {
      prefilled_message: prefilledMessage,
      generate_qr_image: 'SVG',
    });
  }

  /**
   * Get all QR codes for this phone number
   */
  async getQRCodes(): Promise<any> {
    return this.request('GET', `/${this.phoneNumberId}/message_qrdls`);
  }

  /**
   * Get a specific QR code by ID
   */
  async getQRCode(qrId: string): Promise<any> {
    return this.request('GET', `/${this.phoneNumberId}/message_qrdls/${qrId}`);
  }

  /**
   * Update a QR code's prefilled message
   */
  async updateQRCode(qrId: string, prefilledMessage: string): Promise<any> {
    return this.request('POST', `/${this.phoneNumberId}/message_qrdls/${qrId}`, {
      prefilled_message: prefilledMessage,
    });
  }

  /**
   * Delete a QR code
   */
  async deleteQRCode(qrId: string): Promise<any> {
    return this.request('DELETE', `/${this.phoneNumberId}/message_qrdls/${qrId}`);
  }

  // ===== BLOCK USERS =====

  /**
   * Block one or more users
   */
  async blockUsers(users: string[]): Promise<any> {
    return this.request('POST', `/${this.phoneNumberId}/block_users`, {
      messaging_product: 'whatsapp',
      block_users: users.map((u) => ({ user: this.formatPhoneNumber(u) })),
    });
  }

  /**
   * Unblock one or more users
   */
  async unblockUsers(users: string[]): Promise<any> {
    return this.request('POST', `/${this.phoneNumberId}/unblock_users`, {
      messaging_product: 'whatsapp',
      unblock_users: users.map((u) => ({ user: this.formatPhoneNumber(u) })),
    });
  }

  /**
   * Get list of blocked users
   */
  async getBlockedUsers(): Promise<any> {
    return this.request('GET', `/${this.phoneNumberId}/blocked`);
  }

  // ===== ANALYTICS =====

  /**
   * Get WABA analytics (sent, delivered, read counts etc.)
   */
  async getAnalytics(params: {
    start: string;
    end: string;
    granularity?: string;
    phone_numbers?: string[];
    country_codes?: string[];
    metric_types?: string[];
  }): Promise<any> {
    const query = new URLSearchParams();
    query.set('start', params.start);
    query.set('end', params.end);
    if (params.granularity) query.set('granularity', params.granularity);
    if (params.phone_numbers)
      query.set('phone_numbers', JSON.stringify(params.phone_numbers));
    if (params.country_codes)
      query.set('country_codes', JSON.stringify(params.country_codes));
    if (params.metric_types)
      query.set('metric_types', JSON.stringify(params.metric_types));
    return this.request('GET', `/${this.wabaId}/analytics?${query.toString()}`);
  }

  /**
   * Get conversation analytics (billing-related)
   */
  async getConversationAnalytics(params: {
    start: string;
    end: string;
    granularity?: string;
    phone_numbers?: string[];
    dimensions?: string[];
  }): Promise<any> {
    const query = new URLSearchParams();
    query.set('start', params.start);
    query.set('end', params.end);
    if (params.granularity) query.set('granularity', params.granularity);
    if (params.phone_numbers)
      query.set('phone_numbers', JSON.stringify(params.phone_numbers));
    if (params.dimensions)
      query.set('dimensions', JSON.stringify(params.dimensions));
    return this.request(
      'GET',
      `/${this.wabaId}/conversation_analytics?${query.toString()}`
    );
  }

  // ===== PHONE NUMBER MANAGEMENT =====

  /**
   * Get detailed phone number information
   */
  async getPhoneNumberDetails(phoneNumberId?: string): Promise<any> {
    const id = phoneNumberId || this.phoneNumberId;
    return this.request(
      'GET',
      `/${id}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,is_official_business_account,account_mode,certificate,name_status,new_name_status`
    );
  }

  /**
   * Register a phone number with the Cloud API
   */
  async registerPhoneNumber(pin: string): Promise<any> {
    return this.request('POST', `/${this.phoneNumberId}/register`, {
      messaging_product: 'whatsapp',
      pin,
    });
  }

  /**
   * Deregister a phone number from the Cloud API
   */
  async deregisterPhoneNumber(): Promise<any> {
    return this.request('POST', `/${this.phoneNumberId}/deregister`);
  }

  /**
   * Set or update two-step verification PIN
   */
  async setTwoStepVerification(pin: string): Promise<any> {
    return this.request('POST', `/${this.phoneNumberId}`, { pin });
  }

  // ===== STICKER =====

  /**
   * Send a sticker message (by media ID or URL)
   */
  async sendSticker(
    to: string,
    stickerIdOrUrl: string,
    isUrl: boolean = false
  ): Promise<CloudAPIMessageResponse> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'sticker',
      sticker: isUrl ? { link: stickerIdOrUrl } : { id: stickerIdOrUrl },
    };
    return this.request<CloudAPIMessageResponse>(
      'POST',
      `/${this.phoneNumberId}/messages`,
      payload
    );
  }

  // ===== EDIT MESSAGE =====

  /**
   * Edit a previously sent text message
   */
  async editMessage(
    messageId: string,
    newText: string
  ): Promise<CloudAPIMessageResponse> {
    return this.request<CloudAPIMessageResponse>(
      'POST',
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        type: 'text',
        text: { body: newText },
        context: { message_id: messageId },
      }
    );
  }

  // ===== DELETE MEDIA =====

  /**
   * Delete a media asset by its ID
   */
  async deleteMediaById(mediaId: string): Promise<any> {
    return this.request('DELETE', `/${mediaId}`);
  }

  // ===== GETTERS =====

  getPhoneNumberId(): string {
    return this.phoneNumberId;
  }

  getWabaId(): string {
    return this.wabaId;
  }
}
