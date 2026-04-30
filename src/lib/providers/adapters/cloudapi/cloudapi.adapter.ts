/**
 * @module CloudAPI Adapter
 * @description WhatsApp Cloud API adapter implementing IWhatsAppProvider
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import type { IWhatsAppProvider } from '../../core/provider.interface';
import { ProviderCapability } from '../../core/provider.types';
import type {
  CreateInstanceInput,
  InstanceResult,
  InstanceStatus,
  QRCodeResult,
  PairingCodeResult,
  SendTextInput,
  SendMediaInput,
  SendImageInput,
  SendVideoInput,
  SendAudioInput,
  SendDocumentInput,
  SendLocationInput,
  SendContactInput,
  SendInteractiveListInput,
  SendInteractiveButtonsInput,
  SendCarouselInput,
  SendMenuInput,
  MessageResult,
  WebhookConfig,
  WebhookSetupInstructions,
  NormalizedWebhook,
  PresenceType,
  MediaDownloadResult,
  Template,
  TemplateListInput,
  CreateTemplateInput,
  SendTemplateInput,
  UploadMediaInput,
  MediaInfo,
  // Flows
  Flow,
  CreateFlowInput,
  SendFlowMessageInput,
  // Analytics
  AnalyticsInput,
  AnalyticsResult,
  ConversationAnalyticsResult,
  // Business
  BusinessProfile,
  UpdateBusinessProfileInput,
  // Catalog
  CatalogProduct,
  CommerceSettings,
  SendProductMessageInput,
  SendProductListMessageInput,
  SendCatalogMessageInput,
} from '../../core/provider.types';
import type {
  IMessagingCapability,
  IInteractiveCapability,
  IInstanceCapability,
  IWebhookCapability,
  ITemplateCapability,
  IMediaManagementCapability,
  IFlowCapability,
  IAnalyticsCapability,
  IBusinessCapability,
  ICatalogCapability,
} from '../../core/capabilities';
import { CloudAPIClient } from './cloudapi.client';
import { normalizeCloudAPIWebhook } from './cloudapi.normalizer';
import { database } from '@/server/services/database';

/**
 * @class CloudAPIAdapter
 * @description Adapter for WhatsApp Cloud API (Official Meta API)
 * Implements IWhatsAppProvider interface for unified provider access
 *
 * Key differences from UAZapi:
 * - No QR Code connection (uses permanent token)
 * - Instances are pre-configured in Meta Business Dashboard
 * - Webhooks are configured in Meta Dashboard (not via API)
 * - Template messages required for initiating conversations
 */
export class CloudAPIAdapter
  implements
    IWhatsAppProvider,
    IMessagingCapability,
    IInteractiveCapability,
    IInstanceCapability,
    IWebhookCapability,
    ITemplateCapability,
    IMediaManagementCapability,
    IFlowCapability,
    IAnalyticsCapability,
    IBusinessCapability,
    ICatalogCapability
{
  readonly name = 'WhatsApp Cloud API';
  readonly version = '1.0.0';

  readonly capabilities: ProviderCapability[] = [
    ProviderCapability.MESSAGING,
    ProviderCapability.INTERACTIVE,
    ProviderCapability.INSTANCE_MANAGEMENT,
    ProviderCapability.WEBHOOKS,
    ProviderCapability.TEMPLATES,
    ProviderCapability.MEDIA_MANAGEMENT,
    ProviderCapability.ANALYTICS,
    ProviderCapability.BUSINESS_PROFILE,
    ProviderCapability.CATALOG,
    ProviderCapability.FLOWS,
  ];

  // Cache of clients by instanceId
  private clientCache: Map<string, CloudAPIClient> = new Map();

  // ===== INSTANCE MANAGEMENT =====

  /**
   * Create instance - Not supported for Cloud API
   * Cloud API instances are pre-configured in Meta Business Dashboard
   */
  async createInstance(_data: CreateInstanceInput): Promise<InstanceResult> {
    throw new Error(
      'Cloud API does not support dynamic instance creation. ' +
      'Configure your WhatsApp Business Account in Meta Business Dashboard.'
    );
  }

  /**
   * Delete instance - Removes local configuration only
   * Does not affect Meta Business configuration
   */
  async deleteInstance(instanceId: string): Promise<void> {
    console.log(`[CloudAPI] Deleting instance ${instanceId} - local configuration only`);
    this.clientCache.delete(instanceId);
    // Local database cleanup is handled by the controller
  }

  /**
   * Get instance status by checking token validity
   */
  async getInstanceStatus(instanceId: string): Promise<InstanceStatus> {
    try {
      const client = await this.getClientForInstance(instanceId);
      const isHealthy = await client.healthCheck();
      return isHealthy ? 'connected' : 'error';
    } catch (error) {
      console.error(`[CloudAPI] Status check failed for ${instanceId}:`, error);
      return 'error';
    }
  }

  // ===== CONNECTION METHODS (Not used for Cloud API) =====

  /**
   * Generate QR Code - Not supported for Cloud API
   * Cloud API uses permanent access tokens, not QR codes
   */
  async generateQRCode(_instanceId: string): Promise<QRCodeResult> {
    throw new Error(
      'Cloud API does not use QR Code for connection. ' +
      'Connection is established via Access Token from Meta Business Dashboard.'
    );
  }

  /**
   * Get pairing code - Not supported for Cloud API
   */
  async getPairingCode(_instanceId: string): Promise<PairingCodeResult> {
    throw new Error(
      'Cloud API does not use Pairing Code. ' +
      'Connection is established via Access Token.'
    );
  }

  /**
   * Disconnect - No-op for Cloud API
   * Token remains valid until revoked in Meta Dashboard
   */
  async disconnect(instanceId: string): Promise<void> {
    console.log(`[CloudAPI] Disconnect called for ${instanceId} - no-op for Cloud API`);
    // Token remains valid, just clear local cache
    this.clientCache.delete(instanceId);
  }

  /**
   * Restart - Validate token is still valid
   */
  async restart(instanceId: string): Promise<void> {
    console.log(`[CloudAPI] Restart called for ${instanceId} - validating token`);

    // Clear cache to force re-fetch
    this.clientCache.delete(instanceId);

    const client = await this.getClientForInstance(instanceId);
    const isHealthy = await client.healthCheck();

    if (!isHealthy) {
      throw new Error('Cloud API token is invalid or expired. Please update your Access Token.');
    }
  }

  // ===== MESSAGE SENDING =====

  /**
   * Send text message
   */
  async sendText(instanceId: string, data: SendTextInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);

    // Apply delay if specified
    if (data.delay && data.delay > 0) {
      await this.delay(data.delay * 1000);
    }

    const response = await client.sendText(data.to, data.text);

    return {
      messageId: response.messages[0].id,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  /**
   * Send media message (generic)
   */
  async sendMedia(instanceId: string, data: SendMediaInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);

    let response;

    switch (data.mediaType) {
      case 'image':
        response = await client.sendImage(data.to, data.mediaUrl!, data.caption);
        break;

      case 'video':
        response = await client.sendVideo(data.to, data.mediaUrl!, data.caption);
        break;

      case 'audio':
      case 'voice':
        response = await client.sendAudio(data.to, data.mediaUrl!);
        break;

      case 'document':
        response = await client.sendDocument(
          data.to,
          data.mediaUrl!,
          data.fileName || 'document',
          data.caption
        );
        break;

      default:
        throw new Error(`Unsupported media type: ${data.mediaType}`);
    }

    return {
      messageId: response.messages[0].id,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  /**
   * Send image message
   */
  async sendImage(instanceId: string, data: SendImageInput): Promise<MessageResult> {
    return this.sendMedia(instanceId, {
      to: data.to,
      mediaType: 'image',
      mediaUrl: data.imageUrl,
      caption: data.caption,
    });
  }

  /**
   * Send video message
   */
  async sendVideo(instanceId: string, data: SendVideoInput): Promise<MessageResult> {
    return this.sendMedia(instanceId, {
      to: data.to,
      mediaType: 'video',
      mediaUrl: data.videoUrl,
      caption: data.caption,
    });
  }

  /**
   * Send audio message
   */
  async sendAudio(instanceId: string, data: SendAudioInput): Promise<MessageResult> {
    return this.sendMedia(instanceId, {
      to: data.to,
      mediaType: 'audio',
      mediaUrl: data.audioUrl,
    });
  }

  /**
   * Send document message
   */
  async sendDocument(instanceId: string, data: SendDocumentInput): Promise<MessageResult> {
    return this.sendMedia(instanceId, {
      to: data.to,
      mediaType: 'document',
      mediaUrl: data.documentUrl,
      fileName: data.fileName,
      caption: data.caption,
    });
  }

  /**
   * Send location message
   */
  async sendLocation(instanceId: string, data: SendLocationInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);

    const response = await client.sendLocation(
      data.to,
      data.latitude,
      data.longitude,
      data.name,
      data.address
    );

    return {
      messageId: response.messages[0].id,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  /**
   * Send contact message
   */
  async sendContact(instanceId: string, data: SendContactInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);

    const response = await client.sendContact(data.to, {
      name: data.contact.name,
      phone: data.contact.phone,
    });

    return {
      messageId: response.messages[0]?.id || `contact_${Date.now()}`,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  /**
   * Send template message (required for initiating conversations)
   */
  async sendTemplate(instanceId: string, input: SendTemplateInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);

    const response = await client.sendTemplate(
      input.to,
      input.templateName,
      input.language,
      input.components
    );

    return {
      messageId: response.messages[0].id,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  // ===== WEBHOOKS =====

  /**
   * Configure webhook — returns manual setup instructions.
   *
   * Meta Cloud API does not expose a webhook registration endpoint; webhooks
   * must be configured inside the Meta App Dashboard. Instead of throwing,
   * this method returns a structured instructions object so callers can
   * surface the steps to the user (F3-001).
   */
  async configureWebhook(
    _instanceId: string,
    config: WebhookConfig
  ): Promise<WebhookSetupInstructions> {
    return {
      type: 'manual_setup',
      instructions: [
        'Acesse o Meta App Dashboard (developers.facebook.com/apps)',
        'Selecione o seu aplicativo e vá para WhatsApp > Configuração',
        'Na seção "Webhooks", clique em "Editar" e informe a URL de callback',
        'Defina o token de verificação e salve as alterações',
        'Assine os campos de webhook que deseja receber (messages, message_deliveries, etc.)',
      ],
      callbackUrl: config.callbackUrl ?? config.url ?? null,
      verifyToken: config.verifyToken ?? null,
    };
  }

  /**
   * Normalize incoming webhook payload
   */
  normalizeWebhook(rawWebhook: any): NormalizedWebhook {
    return normalizeCloudAPIWebhook(rawWebhook);
  }

  // ===== PROFILE =====

  /**
   * Get profile picture - Not available via Cloud API
   * Cloud API does not provide access to other users' profile pictures
   */
  async getProfilePicture(_instanceId: string, _number: string): Promise<string | null> {
    console.log('[CloudAPI] getProfilePicture - Not available via Cloud API');
    return null;
  }

  /**
   * Update profile picture - Not supported
   */
  async updateProfilePicture(_instanceId: string, _imageUrl: string): Promise<void> {
    throw new Error('Profile picture update not available via Cloud API');
  }

  // ===== MEDIA HANDLING =====

  /**
   * Get media URL from media ID
   * Returns a temporary URL that can be used to download the media
   */
  async getMediaUrl(instanceId: string, mediaId: string): Promise<string> {
    const client = await this.getClientForInstance(instanceId);
    const mediaInfo = await client.getMediaUrl(mediaId);
    return mediaInfo.url;
  }

  /**
   * Download media file by message ID
   * For Cloud API, we first need to get the media URL then download
   */
  async downloadMedia(instanceId: string, mediaId: string): Promise<MediaDownloadResult> {
    const client = await this.getClientForInstance(instanceId);

    // Get the temporary URL for the media
    const mediaInfo = await client.getMediaUrl(mediaId);
    const mediaInfoAny = mediaInfo as any;

    // Download the media using the URL
    const buffer = await client.downloadMedia(mediaInfo.url);

    return {
      data: buffer.toString('base64'),
      mimeType: mediaInfo.mime_type || 'application/octet-stream',
      fileName: mediaInfoAny.file_name || undefined,
      size: buffer.length,
    };
  }

  // ===== MESSAGE ACTIONS =====

  /**
   * Mark message as read
   */
  async markAsRead(instanceId: string, messageId: string): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    await client.markAsRead(messageId);
  }

  /**
   * React to a message with an emoji
   */
  async reactToMessage(instanceId: string, messageId: string, emoji: string): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    await client.reactToMessage(messageId, emoji);
  }

  /**
   * Delete message - Not supported via Cloud API
   * Cloud API does not provide a delete message endpoint
   */
  async deleteMessage(_instanceId: string, _messageId: string): Promise<void> {
    console.log('[CloudAPI] deleteMessage - Not supported by Cloud API');
    // Cloud API does not support deleting messages via API
  }

  /**
   * Edit a previously sent text message
   */
  async editMessage(instanceId: string, messageId: string, newText: string): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    await client.editMessage(messageId, newText);
  }

  // ===== PRESENCE =====

  /**
   * Send presence (typing/recording indicator) — no-op by design (F3-014).
   *
   * Meta WhatsApp Cloud API does not expose a typing-indicator endpoint.
   * Presence signals are managed entirely by the WhatsApp client application
   * on the recipient side and cannot be triggered programmatically via the
   * Graph API. This method intentionally does nothing rather than throwing so
   * that callers that iterate over providers transparently skip this step for
   * Cloud API instances.
   */
  async sendPresence(_instanceId: string, _to: string, _type: PresenceType): Promise<void> {
    // No-op: Meta Cloud API has no typing/presence endpoint (by design).
  }

  // ===== INTERACTIVE MESSAGES =====

  /**
   * Send interactive list message
   */
  async sendInteractiveList(instanceId: string, data: SendInteractiveListInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);

    const response = await this.sendInteractiveMessage(client, data.to, {
      type: 'list',
      header: data.title ? { type: 'text', text: data.title } : undefined,
      body: { text: data.description },
      footer: data.footer ? { text: data.footer } : undefined,
      action: {
        button: data.buttonText,
        sections: data.sections.map(section => ({
          title: section.title,
          rows: section.rows.map(row => ({
            id: row.id,
            title: row.title,
            description: row.description,
          })),
        })),
      },
    });

    return {
      messageId: response.messages[0]?.id || `list_${Date.now()}`,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  /**
   * Send interactive buttons message
   */
  async sendInteractiveButtons(instanceId: string, data: SendInteractiveButtonsInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);

    const response = await this.sendInteractiveMessage(client, data.to, {
      type: 'button',
      header: data.header ? {
        type: data.header.type,
        ...(data.header.type === 'text' && { text: data.header.text }),
        ...(data.header.type === 'image' && { image: { link: data.header.mediaUrl } }),
        ...(data.header.type === 'video' && { video: { link: data.header.mediaUrl } }),
        ...(data.header.type === 'document' && { document: { link: data.header.mediaUrl } }),
      } : undefined,
      body: { text: data.text },
      footer: data.footer ? { text: data.footer } : undefined,
      action: {
        buttons: data.buttons.map(btn => ({
          type: 'reply',
          reply: {
            id: btn.id,
            title: btn.text,
          },
        })),
      },
    });

    return {
      messageId: response.messages[0]?.id || `btn_${Date.now()}`,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  /**
   * Send carousel message
   * CloudAPI does not support native carousel messages.
   * Use sendProductListMessage for product carousels or sendInteractiveButtons for alternatives.
   */
  async sendCarousel(_instanceId: string, _data: SendCarouselInput): Promise<MessageResult> {
    throw new Error(
      'CloudAPI does not support native carousel messages. ' +
      'Use sendProductListMessage for product carousels or sendInteractiveButtons for button-based alternatives.'
    );
  }

  /**
   * Send menu message
   * Maps to interactive list or button message depending on the type
   */
  async sendMenu(instanceId: string, data: SendMenuInput): Promise<MessageResult> {
    if (data.type === 'list') {
      return this.sendInteractiveList(instanceId, {
        to: data.to,
        title: data.title || '',
        description: data.text,
        buttonText: 'Menu',
        sections: [{
          title: 'Options',
          rows: data.choices.map(c => ({
            id: c.id,
            title: c.text,
            description: c.description,
          })),
        }],
        footer: data.footer,
      });
    }

    // For 'button' and 'poll' types, map to interactive buttons (max 3)
    return this.sendInteractiveButtons(instanceId, {
      to: data.to,
      text: data.text,
      buttons: data.choices.slice(0, 3).map(c => ({
        id: c.id,
        text: c.text,
      })),
      footer: data.footer,
    });
  }

  /**
   * Helper: Send interactive message to Cloud API
   */
  private async sendInteractiveMessage(
    client: CloudAPIClient,
    to: string,
    interactive: any
  ): Promise<any> {
    const phoneNumberId = client.getPhoneNumberId();
    const baseUrl = 'https://graph.facebook.com/v20.0';

    // Format phone number (remove @c.us suffix and special chars)
    const formattedTo = to
      .replace(/@c\.us$/, '')
      .replace(/@s\.whatsapp\.net$/, '')
      .replace(/[^\d]/g, '');

    const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await this.getTokenForInstance(client)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedTo,
        type: 'interactive',
        interactive,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `Failed to send interactive message: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Helper: Get token from instance via database
   */
  private async getTokenForInstance(client: CloudAPIClient): Promise<string> {
    // We need to find the instance by phoneNumberId and get its token
    const phoneNumberId = client.getPhoneNumberId();
    const connection = await database.connection.findFirst({
      where: { cloudApiPhoneNumberId: phoneNumberId },
      select: { cloudApiAccessToken: true },
    });

    if (!connection?.cloudApiAccessToken) {
      throw new Error('Cloud API token not found');
    }

    return connection.cloudApiAccessToken;
  }

  // ===== TEMPLATES (ITemplateCapability) =====

  /**
   * List message templates from the WABA
   */
  async listTemplates(instanceId: string, input?: TemplateListInput): Promise<Template[]> {
    const client = await this.getClientForInstance(instanceId);
    const response = await client.listTemplates({
      limit: input?.limit,
      status: input?.status,
    });

    return (response.data || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      category: t.category,
      language: t.language,
      components: t.components || [],
    }));
  }

  /**
   * Get a single template by ID
   */
  async getTemplate(instanceId: string, templateId: string): Promise<Template> {
    const client = await this.getClientForInstance(instanceId);
    const t = await client.getTemplate(templateId) as any;

    return {
      id: t.id,
      name: t.name,
      status: t.status,
      category: t.category,
      language: t.language,
      components: t.components || [],
    };
  }

  /**
   * Create a new message template
   */
  async createTemplate(instanceId: string, input: CreateTemplateInput): Promise<Template> {
    const client = await this.getClientForInstance(instanceId);
    const result = await client.createTemplate(input) as any;

    return {
      id: result.id,
      name: input.name,
      status: result.status || 'PENDING',
      category: result.category || input.category,
      language: input.language,
      components: input.components,
    };
  }

  /**
   * Edit an existing message template
   */
  async editTemplate(instanceId: string, templateId: string, input: Partial<CreateTemplateInput>): Promise<Template> {
    const client = await this.getClientForInstance(instanceId);
    const result = await client.editTemplate(templateId, {
      components: input.components || [],
    }) as any;

    return {
      id: result.id || templateId,
      name: result.name || input.name || '',
      status: result.status || 'PENDING',
      category: result.category || input.category || '',
      language: result.language || input.language || '',
      components: result.components || input.components || [],
    };
  }

  /**
   * Delete a message template by ID
   */
  async deleteTemplate(instanceId: string, templateId: string): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    await client.deleteTemplate(templateId);
  }

  // ===== MEDIA MANAGEMENT (IMediaManagementCapability) =====

  /**
   * Upload media to the Cloud API
   */
  async uploadMedia(instanceId: string, input: UploadMediaInput): Promise<MediaInfo> {
    const client = await this.getClientForInstance(instanceId);
    const fileBuffer = typeof input.file === 'string'
      ? Buffer.from(input.file, 'base64')
      : input.file;

    const response = await client.uploadMedia(
      fileBuffer,
      input.fileName || 'file',
      input.mimeType
    );

    return {
      id: response.id,
      mimeType: input.mimeType,
    };
  }

  /**
   * Get media info by media ID
   */
  async getMediaInfo(instanceId: string, mediaId: string): Promise<MediaInfo> {
    const client = await this.getClientForInstance(instanceId);
    const info = await client.getMediaUrl(mediaId);
    return {
      id: mediaId,
      url: info.url,
      mimeType: info.mime_type || 'application/octet-stream',
    };
  }

  /**
   * Delete media by media ID
   */
  async deleteMedia(instanceId: string, mediaId: string): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    await client.deleteMediaById(mediaId);
  }

  // ===== FLOWS (IFlowCapability) =====

  /**
   * List all flows for the WABA
   */
  async listFlows(instanceId: string): Promise<Flow[]> {
    const client = await this.getClientForInstance(instanceId);
    const response = await client.listFlows();

    return (response.data || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      status: f.status,
      categories: f.categories || [],
      validationErrors: f.validation_errors,
    }));
  }

  /**
   * Get a single flow by ID
   */
  async getFlow(instanceId: string, flowId: string): Promise<Flow> {
    const client = await this.getClientForInstance(instanceId);
    const f = await client.getFlow(flowId) as any;

    return {
      id: f.id,
      name: f.name,
      status: f.status,
      categories: f.categories || [],
      validationErrors: f.validation_errors,
    };
  }

  /**
   * Create a new flow
   */
  async createFlow(instanceId: string, input: CreateFlowInput): Promise<Flow> {
    const client = await this.getClientForInstance(instanceId);
    const result = await client.createFlow(input) as any;

    return {
      id: result.id,
      name: input.name,
      status: 'DRAFT',
      categories: input.categories,
    };
  }

  /**
   * Update flow metadata
   */
  async updateFlow(instanceId: string, flowId: string, input: Partial<CreateFlowInput>): Promise<Flow> {
    const client = await this.getClientForInstance(instanceId);
    const result = await client.updateFlow(flowId, input) as any;

    return {
      id: result.id || flowId,
      name: result.name || input.name || '',
      status: result.status || 'DRAFT',
      categories: result.categories || input.categories || [],
      validationErrors: result.validation_errors,
    };
  }

  /**
   * Update the JSON definition of a flow
   */
  async updateFlowJSON(instanceId: string, flowId: string, jsonContent: string | Record<string, any>): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    await client.updateFlowJSON(flowId, jsonContent);
  }

  /**
   * Publish a draft flow
   */
  async publishFlow(instanceId: string, flowId: string): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    await client.publishFlow(flowId);
  }

  /**
   * Deprecate a published flow
   */
  async deprecateFlow(instanceId: string, flowId: string): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    await client.deprecateFlow(flowId);
  }

  /**
   * Delete a flow
   */
  async deleteFlow(instanceId: string, flowId: string): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    await client.deleteFlow(flowId);
  }

  /**
   * Send a flow message to a recipient
   */
  async sendFlowMessage(instanceId: string, input: SendFlowMessageInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);
    const response = await client.sendFlowMessage(input.to, {
      flowId: input.flowId,
      flowCta: input.flowCta,
      mode: input.mode,
      flowActionPayload: input.flowActionPayload,
      headerText: input.headerText,
      bodyText: input.bodyText,
      footerText: input.footerText,
    });

    return {
      messageId: response.messages[0].id,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  // ===== ANALYTICS (IAnalyticsCapability) =====

  /**
   * Get messaging analytics (sent, delivered, read counts)
   */
  async getAnalytics(instanceId: string, input: AnalyticsInput): Promise<AnalyticsResult> {
    const client = await this.getClientForInstance(instanceId);
    const response = await client.getAnalytics({
      start: input.start,
      end: input.end,
      granularity: input.granularity,
      phone_numbers: input.phoneNumbers,
      country_codes: input.countryCodes,
      metric_types: input.metricTypes,
    }) as any;

    return {
      dataPoints: response.analytics?.data_points || response.data || [],
    };
  }

  /**
   * Get conversation-based analytics (conversation counts, costs)
   */
  async getConversationAnalytics(instanceId: string, input: AnalyticsInput): Promise<ConversationAnalyticsResult> {
    const client = await this.getClientForInstance(instanceId);
    const response = await client.getConversationAnalytics({
      start: input.start,
      end: input.end,
      granularity: input.granularity,
      phone_numbers: input.phoneNumbers,
      dimensions: input.metricTypes,
    }) as any;

    return {
      dataPoints: response.conversation_analytics?.data_points || response.data || [],
    };
  }

  // ===== BUSINESS PROFILE (IBusinessCapability) =====

  /**
   * Get the WhatsApp Business Profile for the phone number
   */
  async getBusinessProfile(instanceId: string): Promise<BusinessProfile> {
    const client = await this.getClientForInstance(instanceId);
    const response = await client.getBusinessProfile() as any;
    const profile = response.data?.[0] || {};

    return {
      description: profile.description,
      address: profile.address,
      email: profile.email,
      website: profile.websites,
      profilePictureUrl: profile.profile_picture_url,
      vertical: profile.vertical,
      about: profile.about,
    };
  }

  /**
   * Update the WhatsApp Business Profile
   */
  async updateBusinessProfile(instanceId: string, input: UpdateBusinessProfileInput): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    await client.updateBusinessProfile({
      description: input.description,
      address: input.address,
      email: input.email,
      websites: input.websites,
      profile_picture_url: input.profilePictureUrl,
      vertical: input.vertical,
      about: input.about,
    });
  }

  // ===== CATALOG (ICatalogCapability) =====

  /**
   * List products - Not available via Cloud API
   * Products are managed through Meta Commerce Manager
   */
  async listProducts(_instanceId: string): Promise<CatalogProduct[]> {
    throw new Error(
      'Product listing is managed via Meta Commerce Manager, not via API. ' +
      'Use the Meta Business Suite to manage your product catalog.'
    );
  }

  /**
   * Get product info - Not available via Cloud API
   * Products are managed through Meta Commerce Manager
   */
  async getProductInfo(_instanceId: string, _productId: string): Promise<CatalogProduct> {
    throw new Error(
      'Product info is managed via Meta Commerce Manager, not via API. ' +
      'Use the Meta Business Suite to view product details.'
    );
  }

  /**
   * Send a single product message to a recipient
   */
  async sendProductMessage(instanceId: string, input: SendProductMessageInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);
    const response = await client.sendProductMessage(
      input.to,
      input.catalogId,
      input.productRetailerId,
      input.bodyText,
      input.footerText
    );

    return {
      messageId: response.messages[0].id,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  /**
   * Send a product list message (multi-product message)
   */
  async sendProductListMessage(instanceId: string, input: SendProductListMessageInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);
    const response = await client.sendProductListMessage(input.to, {
      catalogId: input.catalogId,
      headerText: input.headerText,
      bodyText: input.bodyText,
      sections: input.sections.map(s => ({
        title: s.title,
        productItems: s.productItems.map(p => ({
          product_retailer_id: p.productRetailerId,
        })),
      })),
    });

    return {
      messageId: response.messages[0].id,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  /**
   * Send a catalog message (shows the full catalog)
   */
  async sendCatalogMessage(instanceId: string, input: SendCatalogMessageInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);
    const response = await client.sendCatalogMessage(
      input.to,
      input.bodyText,
      input.footerText,
      input.thumbnailProductRetailerId
    );

    return {
      messageId: response.messages[0].id,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  /**
   * Get commerce settings for the WhatsApp Business Account
   */
  async getCommerceSettings(instanceId: string): Promise<CommerceSettings> {
    const client = await this.getClientForInstance(instanceId);
    const response = await client.getCommerceSettings() as any;

    return {
      isCatalogVisible: response.is_catalog_visible ?? true,
      isCartEnabled: response.is_cart_enabled ?? true,
    };
  }

  /**
   * Update commerce settings for the WhatsApp Business Account
   */
  async updateCommerceSettings(instanceId: string, settings: Partial<CommerceSettings>): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    await client.updateCommerceSettings({
      is_catalog_visible: settings.isCatalogVisible,
      is_cart_enabled: settings.isCartEnabled,
    });
  }

  // ===== HEALTH CHECK =====

  /**
   * Health check for the adapter itself (not a specific instance)
   */
  async healthCheck(): Promise<boolean> {
    // Adapter is always "healthy" - actual health is per-instance
    return true;
  }

  /**
   * Health check for a specific instance
   */
  async healthCheckInstance(instanceId: string): Promise<boolean> {
    try {
      const client = await this.getClientForInstance(instanceId);
      return client.healthCheck();
    } catch {
      return false;
    }
  }

  // ===== PRIVATE HELPERS =====

  /**
   * Get or create CloudAPI client for an instance
   */
  private async getClientForInstance(instanceId: string): Promise<CloudAPIClient> {
    // Check cache first
    const cached = this.clientCache.get(instanceId);
    if (cached) {
      return cached;
    }

    // Fetch credentials from database
    const connection = await database.connection.findUnique({
      where: { id: instanceId },
      select: {
        cloudApiAccessToken: true,
        cloudApiPhoneNumberId: true,
        cloudApiWabaId: true,
      },
    });

    if (!connection) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    if (!connection.cloudApiAccessToken) {
      throw new Error(`Instance ${instanceId} missing Cloud API Access Token`);
    }

    if (!connection.cloudApiPhoneNumberId) {
      throw new Error(`Instance ${instanceId} missing Cloud API Phone Number ID`);
    }

    if (!connection.cloudApiWabaId) {
      throw new Error(`Instance ${instanceId} missing Cloud API WABA ID`);
    }

    // Create and cache client
    const client = new CloudAPIClient({
      accessToken: connection.cloudApiAccessToken,
      phoneNumberId: connection.cloudApiPhoneNumberId,
      wabaId: connection.cloudApiWabaId,
    });

    this.clientCache.set(instanceId, client);

    return client;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear client cache (useful for testing or token refresh)
   */
  clearCache(): void {
    this.clientCache.clear();
  }

  /**
   * Clear specific instance from cache
   */
  clearInstanceCache(instanceId: string): void {
    this.clientCache.delete(instanceId);
  }
}
