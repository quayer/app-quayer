/**
 * @module CloudAPI Adapter
 * @description WhatsApp Cloud API adapter implementing IWhatsAppProvider
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import type { IWhatsAppProvider } from '../../core/provider.interface';
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
  MessageResult,
  WebhookConfig,
  NormalizedWebhook,
  Chat,
  Contact,
  ChatFilters,
  MessageFilters,
  PresenceType,
  MediaDownloadResult,
} from '../../core/provider.types';
import { CloudAPIClient } from './cloudapi.client';
import { normalizeCloudAPIWebhook } from './cloudapi.normalizer';
import { database } from '@/services/database';

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
export class CloudAPIAdapter implements IWhatsAppProvider {
  readonly name = 'WhatsApp Cloud API';
  readonly version = '1.0.0';

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
  async sendTemplate(
    instanceId: string,
    to: string,
    templateName: string,
    languageCode: string = 'pt_BR',
    components?: any[]
  ): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);

    const response = await client.sendTemplate(to, templateName, languageCode, components);

    return {
      messageId: response.messages[0].id,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  // ===== CHATS & CONTACTS =====

  /**
   * Get chats - Not available via Cloud API
   * Chats must be managed locally in the database
   */
  async getChats(_instanceId: string, _filters?: ChatFilters): Promise<Chat[]> {
    console.log('[CloudAPI] getChats - Not available via Cloud API, use local database');
    return [];
  }

  /**
   * Get chat messages - Not available via Cloud API
   * Messages must be stored locally when received via webhook
   */
  async getChatMessages(_instanceId: string, _chatId: string, _filters?: MessageFilters): Promise<any[]> {
    console.log('[CloudAPI] getChatMessages - Not available via Cloud API, use local database');
    return [];
  }

  /**
   * Get contacts - Not available via Cloud API
   */
  async getContacts(_instanceId: string): Promise<Contact[]> {
    console.log('[CloudAPI] getContacts - Not available via Cloud API, use local database');
    return [];
  }

  // ===== WEBHOOKS =====

  /**
   * Configure webhook - Not supported via API
   * Webhooks must be configured in Meta Business Dashboard
   */
  async configureWebhook(_instanceId: string, _config: WebhookConfig): Promise<void> {
    throw new Error(
      'Cloud API webhooks must be configured in Meta Business Dashboard. ' +
      'Go to App Dashboard > WhatsApp > Configuration to set up webhooks.'
    );
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

  // ===== AÇÕES DE MENSAGEM =====

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
    // Cloud API não suporta deletar mensagens via API
    // A mensagem permanece para o usuário final
  }

  // ===== PRESENÇA =====

  /**
   * Send presence (typing/recording indicator)
   * Cloud API doesn't have a specific typing indicator API
   * Presence is handled automatically by the platform
   */
  async sendPresence(_instanceId: string, _to: string, _type: PresenceType): Promise<void> {
    console.log('[CloudAPI] sendPresence - Handled automatically by Cloud API platform');
    // Cloud API não tem endpoint de presença/digitação
    // O indicador de "digitando" é gerenciado automaticamente pela plataforma
  }

  // ===== MENSAGENS INTERATIVAS =====

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
