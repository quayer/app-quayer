/**
 * @module Instagram Adapter
 * @description Instagram Messaging adapter implementing IWhatsAppProvider.
 * No QR/pairing (Page Access Token); createInstance unsupported; webhooks set
 * in the Meta App Dashboard; outbound DMs use the send API (`/me/messages`).
 * Credentials: igAccountId, igPageAccessToken, igAppSecret, igVerifyToken.
 * @see https://developers.facebook.com/docs/messenger-platform/instagram
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
  PresenceType,
  MediaDownloadResult,
} from '../../core/provider.types';
import { InstagramClient } from './instagram.client';
import { normalizeInstagramWebhook } from './instagram.normalizer';
import { database } from '@/server/services/database';
import { decrypt } from '@/lib/crypto';

/** lib/crypto ciphertext = `<32 hex iv>:<hex data>`. */
const CIPHERTEXT_RE = /^[0-9a-f]{32}:[0-9a-f]+$/i;

/**
 * The channel-credentials route encrypts ig* secrets before persisting. Decrypt
 * on read; tolerate legacy plaintext + fall back to the raw value on failure
 * (mirrors the CloudAPI adapter so both paths behave identically).
 */
function decryptSecret(value: string): string {
  if (!CIPHERTEXT_RE.test(value)) return value;
  try {
    return decrypt(value);
  } catch (error) {
    console.error('[Instagram] Failed to decrypt stored secret, using raw value:', error);
    return value;
  }
}

/** Throws a uniform "unsupported feature" error. */
function unsupported(feature: string): never {
  throw new Error(`Instagram adapter does not support ${feature}.`);
}

/**
 * @class InstagramAdapter
 * @description Adapter for Instagram Messaging via the Meta Graph API.
 */
export class InstagramAdapter implements IWhatsAppProvider {
  readonly name = 'Instagram';
  readonly version = '1.0.0';

  /** Cache of clients keyed by instanceId (Connection id). */
  private clientCache: Map<string, InstagramClient> = new Map();

  // ===== INSTANCE MANAGEMENT =====

  async createInstance(_data: CreateInstanceInput): Promise<InstanceResult> {
    throw new Error('Instagram has no dynamic instance creation. Link the IG account in the Meta App Dashboard.');
  }

  async deleteInstance(instanceId: string): Promise<void> {
    console.log(`[Instagram] Deleting instance ${instanceId} - local configuration only`);
    this.clientCache.delete(instanceId);
  }

  async getInstanceStatus(instanceId: string): Promise<InstanceStatus> {
    try {
      const client = await this.getClientForInstance(instanceId);
      return (await client.healthCheck()) ? 'connected' : 'error';
    } catch (error) {
      console.error(`[Instagram] Status check failed for ${instanceId}:`, error);
      return 'error';
    }
  }

  // ===== CONNECTION (not used for Instagram) =====

  async generateQRCode(_instanceId: string): Promise<QRCodeResult> {
    throw new Error('Instagram does not use QR Code; connect via the Page Access Token.');
  }

  async getPairingCode(_instanceId: string): Promise<PairingCodeResult> {
    throw new Error('Instagram does not use Pairing Code; connect via the Page Access Token.');
  }

  async disconnect(instanceId: string): Promise<void> {
    console.log(`[Instagram] Disconnect called for ${instanceId} - no-op`);
    this.clientCache.delete(instanceId);
  }

  async restart(instanceId: string): Promise<void> {
    this.clientCache.delete(instanceId);
    const client = await this.getClientForInstance(instanceId);
    if (!(await client.healthCheck())) {
      throw new Error('Instagram Page Access Token is invalid or expired. Please update it.');
    }
  }

  // ===== MESSAGE SENDING =====

  /** Send a text DM via the Messenger send API. */
  async sendText(instanceId: string, data: SendTextInput): Promise<MessageResult> {
    const client = await this.getClientForInstance(instanceId);
    if (data.delay && data.delay > 0) await this.delay(data.delay * 1000);
    const response = await client.sendText(data.to, data.text);
    return { messageId: response.message_id, status: 'sent', timestamp: new Date() };
  }

  async sendMedia(_instanceId: string, _data: SendMediaInput): Promise<MessageResult> {
    return unsupported('media messages yet');
  }
  async sendImage(_instanceId: string, _data: SendImageInput): Promise<MessageResult> {
    return unsupported('image messages yet');
  }
  async sendVideo(_instanceId: string, _data: SendVideoInput): Promise<MessageResult> {
    return unsupported('video messages yet');
  }
  async sendAudio(_instanceId: string, _data: SendAudioInput): Promise<MessageResult> {
    return unsupported('audio messages yet');
  }
  async sendDocument(_instanceId: string, _data: SendDocumentInput): Promise<MessageResult> {
    return unsupported('document messages');
  }
  async sendLocation(_instanceId: string, _data: SendLocationInput): Promise<MessageResult> {
    return unsupported('location messages');
  }
  async sendContact(_instanceId: string, _data: SendContactInput): Promise<MessageResult> {
    return unsupported('contact messages');
  }

  // ===== INTERACTIVE MESSAGES =====

  async sendInteractiveList(_i: string, _d: SendInteractiveListInput): Promise<MessageResult> {
    return unsupported('interactive list messages');
  }
  async sendInteractiveButtons(_i: string, _d: SendInteractiveButtonsInput): Promise<MessageResult> {
    return unsupported('interactive button messages');
  }

  // ===== MESSAGE ACTIONS / PRESENCE (handled by platform or unsupported) =====

  async markAsRead(_i: string, _messageId: string): Promise<void> {} // platform-managed
  async reactToMessage(_i: string, _messageId: string, _emoji: string): Promise<void> {} // unsupported
  async deleteMessage(_i: string, _messageId: string): Promise<void> {} // unsupported
  async sendPresence(_i: string, _to: string, _type: PresenceType): Promise<void> {} // platform-managed

  // ===== MEDIA / CHATS / CONTACTS =====

  async downloadMedia(_instanceId: string, _messageId: string): Promise<MediaDownloadResult> {
    return unsupported('media download yet');
  }
  async getChats(_instanceId: string, _filters?: ChatFilters): Promise<Chat[]> {
    return []; // not available via API
  }
  async getContacts(_instanceId: string): Promise<Contact[]> {
    return []; // not available via API
  }

  // ===== WEBHOOKS =====

  async configureWebhook(_instanceId: string, _config: WebhookConfig): Promise<void> {
    throw new Error(
      'Instagram webhooks must be configured in the Meta App Dashboard. ' +
        'Go to App Dashboard > Webhooks and subscribe the Instagram object.',
    );
  }

  normalizeWebhook(rawWebhook: any): NormalizedWebhook {
    return normalizeInstagramWebhook(rawWebhook);
  }

  // ===== PROFILE =====

  async getProfilePicture(_instanceId: string, _number: string): Promise<string | null> {
    return null; // not available via API
  }
  async updateProfilePicture(_instanceId: string, _imageUrl: string): Promise<void> {
    return unsupported('profile picture updates');
  }

  // ===== HEALTH =====

  /** The adapter is always healthy; actual health is per-instance. */
  async healthCheck(): Promise<boolean> {
    return true;
  }

  // ===== PRIVATE HELPERS =====

  /** Get or create an InstagramClient for the given Connection id. */
  private async getClientForInstance(instanceId: string): Promise<InstagramClient> {
    const cached = this.clientCache.get(instanceId);
    if (cached) return cached;

    const connection = await database.connection.findUnique({
      where: { id: instanceId },
      select: {
        igAccountId: true,
        igPageAccessToken: true,
        igAppSecret: true,
        igVerifyToken: true,
      },
    });

    if (!connection) throw new Error(`Instance ${instanceId} not found`);
    if (!connection.igPageAccessToken)
      throw new Error(`Instance ${instanceId} missing Instagram Page Access Token`);
    if (!connection.igAccountId)
      throw new Error(`Instance ${instanceId} missing Instagram Account ID`);

    const client = new InstagramClient({
      igAccountId: connection.igAccountId,
      pageAccessToken: decryptSecret(connection.igPageAccessToken),
      appSecret: connection.igAppSecret ? decryptSecret(connection.igAppSecret) : '',
      verifyToken: connection.igVerifyToken ? decryptSecret(connection.igVerifyToken) : '',
    });

    this.clientCache.set(instanceId, client);
    return client;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  clearCache(): void {
    this.clientCache.clear();
  }

  clearInstanceCache(instanceId: string): void {
    this.clientCache.delete(instanceId);
  }
}
