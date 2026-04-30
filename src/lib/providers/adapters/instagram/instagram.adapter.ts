/**
 * @module Instagram Adapter
 * @description Instagram Messaging adapter implementing IWhatsAppProvider
 * Uses the same Meta Graph API as CloudAPI with messaging_product='instagram'
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
  MessageResult,
  WebhookConfig,
  NormalizedWebhook,
  PresenceType,
  MediaDownloadResult,
  UploadMediaInput,
  MediaInfo,
} from '../../core/provider.types';
import type {
  IMessagingCapability,
  IInstanceCapability,
  IWebhookCapability,
  IMediaManagementCapability,
} from '../../core/capabilities';
import { InstagramClient } from './instagram.client';
import { normalizeInstagramWebhook } from './instagram.normalizer';
import { database } from '@/server/services/database';

export class InstagramAdapter implements IWhatsAppProvider, IMessagingCapability, IInstanceCapability, IWebhookCapability, IMediaManagementCapability {
  readonly name = 'Instagram';
  readonly version = '1.0.0';

  readonly capabilities: ProviderCapability[] = [
    ProviderCapability.MESSAGING,
    ProviderCapability.INSTANCE_MANAGEMENT,
    ProviderCapability.WEBHOOKS,
    ProviderCapability.MEDIA_MANAGEMENT,
  ];

  private clientCache: Map<string, InstagramClient> = new Map();

  // ===== INSTANCE MANAGEMENT =====

  async createInstance(_data: CreateInstanceInput): Promise<InstanceResult> {
    throw new Error(
      'Instagram does not support dynamic instance creation. ' +
      'Configure your Instagram Business Account via Meta Business Dashboard and OAuth.'
    );
  }

  async deleteInstance(instanceId: string): Promise<void> {
    console.log(`[Instagram] Deleting instance ${instanceId} - local configuration only`);
    this.clientCache.delete(instanceId);
  }

  async getInstanceStatus(instanceId: string): Promise<InstanceStatus> {
    try {
      const client = await this.getClientForInstance(instanceId);
      const isHealthy = await client.healthCheck();
      return isHealthy ? 'connected' : 'error';
    } catch {
      return 'error';
    }
  }

  async generateQRCode(_instanceId: string): Promise<QRCodeResult> {
    throw new Error('Instagram does not use QR Code. Connection is via OAuth token.');
  }

  async getPairingCode(_instanceId: string): Promise<PairingCodeResult> {
    throw new Error('Instagram does not use Pairing Code. Connection is via OAuth token.');
  }

  async disconnect(instanceId: string): Promise<void> {
    console.log(`[Instagram] Disconnect called for ${instanceId} - clearing cache`);
    this.clientCache.delete(instanceId);
  }

  async restart(instanceId: string): Promise<void> {
    this.clientCache.delete(instanceId);
    const client = await this.getClientForInstance(instanceId);
    const isHealthy = await client.healthCheck();
    if (!isHealthy) {
      throw new Error('Instagram token is invalid or expired. Please re-authenticate via OAuth.');
    }
  }

  // ===== MESSAGING =====

  async sendText(instanceId: string, data: SendTextInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);
    if (data.delay && data.delay > 0) {
      await this.delay(data.delay * 1000);
    }
    const response = await client.sendText(data.to, data.text);
    return { messageId: response.message_id, status: 'sent', timestamp: new Date() };
  }

  async sendMedia(instanceId: string, data: SendMediaInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);

    let response;
    switch (data.mediaType) {
      case 'image':
        response = await client.sendImage(data.to, data.mediaUrl!);
        break;
      case 'video':
        response = await client.sendVideo(data.to, data.mediaUrl!);
        break;
      case 'audio':
      case 'voice':
        response = await client.sendAudio(data.to, data.mediaUrl!);
        break;
      case 'document':
        throw new Error('Instagram does not support document messages');
      default:
        throw new Error(`Unsupported media type for Instagram: ${data.mediaType}`);
    }

    return { messageId: response.message_id, status: 'sent', timestamp: new Date() };
  }

  async sendImage(instanceId: string, data: SendImageInput): Promise<MessageResult> {
    return this.sendMedia(instanceId, { to: data.to, mediaType: 'image', mediaUrl: data.imageUrl });
  }

  async sendVideo(instanceId: string, data: SendVideoInput): Promise<MessageResult> {
    return this.sendMedia(instanceId, { to: data.to, mediaType: 'video', mediaUrl: data.videoUrl });
  }

  async sendAudio(instanceId: string, data: SendAudioInput): Promise<MessageResult> {
    return this.sendMedia(instanceId, { to: data.to, mediaType: 'audio', mediaUrl: data.audioUrl });
  }

  async sendDocument(_instanceId: string, _data: SendDocumentInput): Promise<MessageResult> {
    throw new Error('Instagram does not support document messages');
  }

  async sendLocation(_instanceId: string, _data: SendLocationInput): Promise<MessageResult> {
    throw new Error('Instagram does not support location messages');
  }

  async sendContact(_instanceId: string, _data: SendContactInput): Promise<MessageResult> {
    throw new Error('Instagram does not support contact messages');
  }

  async markAsRead(instanceId: string, messageId: string): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    await client.markAsRead(messageId);
  }

  async reactToMessage(instanceId: string, messageId: string, emoji: string): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    await client.reactToMessage(messageId, emoji);
  }

  async deleteMessage(_instanceId: string, _messageId: string): Promise<void> {
    console.log('[Instagram] deleteMessage - Not supported');
  }

  async sendPresence(instanceId: string, to: string, type: PresenceType): Promise<void> {
    const client = await this.getClientForInstance(instanceId);
    if (type === 'composing') {
      await client.sendTypingOn(to);
    } else {
      await client.sendTypingOff(to);
    }
  }

  async downloadMedia(instanceId: string, mediaUrl: string): Promise<MediaDownloadResult> {
    const client = await this.getClientForInstance(instanceId);
    const buffer = await client.downloadMedia(mediaUrl);
    return {
      data: buffer.toString('base64'),
      mimeType: 'application/octet-stream',
      size: buffer.length,
    };
  }

  // ===== WEBHOOKS =====

  async configureWebhook(_instanceId: string, _config: WebhookConfig): Promise<void> {
    throw new Error(
      'Instagram webhooks must be configured in Meta App Dashboard. ' +
      'Go to App Dashboard > Instagram > Webhooks to set up.'
    );
  }

  normalizeWebhook(rawWebhook: any): NormalizedWebhook {
    return normalizeInstagramWebhook(rawWebhook);
  }

  // ===== MEDIA MANAGEMENT =====

  async uploadMedia(_instanceId: string, _input: UploadMediaInput): Promise<MediaInfo> {
    throw new Error('Instagram media upload is handled via attachment URLs in send methods');
  }

  async getMediaInfo(_instanceId: string, _mediaId: string): Promise<MediaInfo> {
    throw new Error('Instagram does not support direct media info retrieval');
  }

  async deleteMedia(_instanceId: string, _mediaId: string): Promise<void> {
    throw new Error('Instagram does not support media deletion via API');
  }

  // ===== HEALTH =====

  async healthCheck(): Promise<boolean> {
    return true;
  }

  // ===== PRIVATE HELPERS =====

  private async getClientForInstance(instanceId: string): Promise<InstagramClient> {
    const cached = this.clientCache.get(instanceId);
    if (cached) return cached;

    const connection = await database.connection.findUnique({
      where: { id: instanceId },
      select: {
        cloudApiAccessToken: true,
        cloudApiPhoneNumberId: true,
        cloudApiWabaId: true,
      },
    });

    if (!connection) throw new Error(`Instance ${instanceId} not found`);
    if (!connection.cloudApiAccessToken) throw new Error(`Instance ${instanceId} missing access token`);
    if (!connection.cloudApiPhoneNumberId) throw new Error(`Instance ${instanceId} missing Instagram Account ID`);
    if (!connection.cloudApiWabaId) throw new Error(`Instance ${instanceId} missing Page ID`);

    // Reuse cloudApi fields: phoneNumberId -> instagramAccountId, wabaId -> pageId
    const client = new InstagramClient({
      accessToken: connection.cloudApiAccessToken,
      instagramAccountId: connection.cloudApiPhoneNumberId,
      pageId: connection.cloudApiWabaId,
    });

    this.clientCache.set(instanceId, client);
    return client;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clearCache(): void {
    this.clientCache.clear();
  }
}
