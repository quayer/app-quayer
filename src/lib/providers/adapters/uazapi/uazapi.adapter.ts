/**
 * UAZapi Adapter
 *
 * Implementação do IWhatsAppProvider para a API UAZapi
 * Traduz operações normalizadas para chamadas específicas da UAZapi
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
  MessageResult,
  WebhookConfig,
  NormalizedWebhook,
  Chat,
  Contact,
  ChatFilters,
} from '../../core/provider.types';
import { UAZClient } from './uazapi.client';
import { database } from '@/services/database';

export class UAZapiAdapter implements IWhatsAppProvider {
  readonly name = 'UAZapi';
  readonly version = '2.0';

  private client: UAZClient;

  constructor() {
    this.client = new UAZClient({
      baseUrl: process.env.UAZAPI_URL || 'https://quayer.uazapi.com',
      adminToken: process.env.UAZAPI_ADMIN_TOKEN!,
    });
  }

  // ===== INSTÂNCIAS =====
  async createInstance(data: CreateInstanceInput): Promise<InstanceResult> {
    const response = await this.client.createInstance({
      instanceName: data.name,
      webhook: data.webhookUrl,
      webhookEvents: data.webhookEvents,
    });

    return {
      instanceId: response.data.instanceId || response.data.id,
      token: response.data.token,
      status: this.mapStatus(response.data.status),
      qrCode: response.data.qrcode,
      pairingCode: response.data.paircode,
    };
  }

  async deleteInstance(instanceId: string): Promise<void> {
    await this.client.deleteInstance(instanceId);
  }

  async getInstanceStatus(instanceId: string): Promise<InstanceStatus> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.getInstanceInfo(instanceId, token);
    return this.mapStatus(response.data.status);
  }

  // ===== QR CODE =====
  async generateQRCode(instanceId: string): Promise<QRCodeResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.getInstanceQRCode(instanceId, token);

    return {
      qrCode: response.data.qrcode || response.data.qr,
      pairingCode: response.data.paircode,
    };
  }

  async getPairingCode(instanceId: string): Promise<PairingCodeResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.getPairingCode(instanceId, token);

    return {
      pairingCode: response.data.paircode || response.data.code,
    };
  }

  async disconnect(instanceId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.disconnectInstance(instanceId, token);
  }

  async restart(instanceId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.restartInstance(instanceId, token);
  }

  // ===== MENSAGENS =====
  async sendText(instanceId: string, data: SendTextInput): Promise<MessageResult> {
    const token = await this.getInstanceToken(instanceId);

    const response = await this.client.sendText(instanceId, token, {
      number: data.to,
      text: data.text,
      delay: data.delay,
    });

    return {
      messageId: response.data.messageId || response.data.id,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  async sendMedia(instanceId: string, data: SendMediaInput): Promise<MessageResult> {
    const token = await this.getInstanceToken(instanceId);

    // Mapear tipo de mídia
    const mediaTypeMap: Record<string, 'image' | 'video' | 'audio' | 'myaudio' | 'document'> = {
      image: 'image',
      video: 'video',
      audio: 'audio',
      voice: 'myaudio', // UAZapi usa 'myaudio' para voz
      document: 'document',
    };

    const response = await this.client.sendMedia(instanceId, token, {
      number: data.to,
      mediatype: mediaTypeMap[data.mediaType],
      media: data.mediaUrl!,
      caption: data.caption,
      filename: data.fileName,
      mimetype: data.mimeType,
    });

    return {
      messageId: response.data.messageId || response.data.id,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  async sendImage(instanceId: string, data: SendImageInput): Promise<MessageResult> {
    return this.sendMedia(instanceId, {
      to: data.to,
      mediaType: 'image',
      mediaUrl: data.imageUrl,
      caption: data.caption,
    });
  }

  async sendVideo(instanceId: string, data: SendVideoInput): Promise<MessageResult> {
    return this.sendMedia(instanceId, {
      to: data.to,
      mediaType: 'video',
      mediaUrl: data.videoUrl,
      caption: data.caption,
    });
  }

  async sendAudio(instanceId: string, data: SendAudioInput): Promise<MessageResult> {
    return this.sendMedia(instanceId, {
      to: data.to,
      mediaType: 'audio',
      mediaUrl: data.audioUrl,
    });
  }

  async sendDocument(instanceId: string, data: SendDocumentInput): Promise<MessageResult> {
    return this.sendMedia(instanceId, {
      to: data.to,
      mediaType: 'document',
      mediaUrl: data.documentUrl,
      fileName: data.fileName,
      caption: data.caption,
    });
  }

  async sendLocation(instanceId: string, data: SendLocationInput): Promise<MessageResult> {
    // UAZapi não tem endpoint específico de location documentado
    // Implementar quando disponível
    throw new Error('Location messages not yet supported by UAZapi adapter');
  }

  async sendContact(instanceId: string, data: SendContactInput): Promise<MessageResult> {
    // UAZapi não tem endpoint específico de contact documentado
    // Implementar quando disponível
    throw new Error('Contact messages not yet supported by UAZapi adapter');
  }

  // ===== CHATS E CONTATOS =====
  async getChats(instanceId: string, filters?: ChatFilters): Promise<Chat[]> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.getChats(instanceId, token);

    // Mapear para formato normalizado
    const chats: Chat[] = (response.data || []).map((chat: any) => ({
      id: chat.id || chat.wa_chatid,
      name: chat.name || chat.wa_name || chat.wa_contactName,
      isGroup: chat.wa_isGroup || false,
      unreadCount: chat.wa_unreadCount || 0,
      lastMessage: chat.wa_lastMessage ? {
        content: chat.wa_lastMessage.body || '',
        timestamp: new Date(chat.wa_lastMessage.timestamp * 1000),
      } : undefined,
    }));

    // Aplicar filtros
    if (filters?.unreadOnly) {
      return chats.filter(chat => chat.unreadCount > 0);
    }

    if (filters?.limit) {
      return chats.slice(0, filters.limit);
    }

    return chats;
  }

  async getContacts(instanceId: string): Promise<Contact[]> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.getContacts(instanceId, token);

    return (response.data || []).map((contact: any) => ({
      id: contact.id,
      name: contact.name || contact.pushname,
      phone: contact.id.split('@')[0], // Remove @s.whatsapp.net
      profilePicUrl: contact.profilePicUrl,
      isBusiness: contact.isBusiness,
    }));
  }

  // ===== WEBHOOKS =====
  async configureWebhook(instanceId: string, config: WebhookConfig): Promise<void> {
    const token = await this.getInstanceToken(instanceId);

    await this.client.configureWebhook(instanceId, token, {
      url: config.url,
      events: config.events,
      enabled: config.enabled ?? true,
    });
  }

  normalizeWebhook(rawWebhook: any): NormalizedWebhook {
    // UAZapi format detection
    // Pode vir em diferentes formatos dependendo do evento

    const event = this.mapEvent(rawWebhook.event || rawWebhook.type);
    const instanceId = rawWebhook.instanceId || rawWebhook.instance_id;

    return {
      event,
      instanceId,
      timestamp: new Date(rawWebhook.timestamp || Date.now()),
      data: {
        chatId: rawWebhook.data?.chatId || rawWebhook.chatId,
        from: rawWebhook.data?.from || rawWebhook.from,
        to: rawWebhook.data?.to,
        message: rawWebhook.data?.message ? {
          id: rawWebhook.data.message.id || rawWebhook.data.message.key?.id,
          type: this.mapMessageType(rawWebhook.data.message.type || rawWebhook.data.message.messageType),
          content: rawWebhook.data.message.body || rawWebhook.data.message.text || rawWebhook.data.message.caption || '',
          media: rawWebhook.data.message.mediaUrl ? {
            id: rawWebhook.data.message.id,
            type: this.mapMessageType(rawWebhook.data.message.type),
            mediaUrl: rawWebhook.data.message.mediaUrl,
            caption: rawWebhook.data.message.caption,
            fileName: rawWebhook.data.message.filename,
            mimeType: rawWebhook.data.message.mimetype,
            size: rawWebhook.data.message.fileSize,
            duration: rawWebhook.data.message.seconds,
          } : undefined,
          timestamp: new Date(rawWebhook.data.message.timestamp || Date.now()),
        } : undefined,
        status: rawWebhook.data?.status ? this.mapStatus(rawWebhook.data.status) : undefined,
        qrCode: rawWebhook.data?.qrcode || rawWebhook.qrcode,
      },
      rawPayload: rawWebhook, // Para debug
    };
  }

  // ===== PROFILE =====
  async getProfilePicture(instanceId: string, number: string): Promise<string | null> {
    const token = await this.getInstanceToken(instanceId);
    try {
      const response = await this.client.getProfilePicture(instanceId, token, number);
      return response.data.profilePicUrl || response.data.url || null;
    } catch {
      return null;
    }
  }

  async updateProfilePicture(instanceId: string, imageUrl: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.updateProfilePicture(instanceId, token, imageUrl);
  }

  // ===== HEALTH =====
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  // ===== HELPERS =====
  private async getInstanceToken(instanceId: string): Promise<string> {
    // Buscar token da instância no banco
    const instance = await database.instance.findUnique({
      where: { id: instanceId },
      select: { uazToken: true },
    });

    if (!instance?.uazToken) {
      throw new Error(`Instance ${instanceId} not found or missing UAZ token`);
    }

    return instance.uazToken;
  }

  private mapStatus(uazStatus: string): InstanceStatus {
    const mapping: Record<string, InstanceStatus> = {
      'open': 'connected',
      'close': 'disconnected',
      'connecting': 'connecting',
      'qrReadSuccess': 'connected',
      'qrReadError': 'error',
      'connected': 'connected',
      'disconnected': 'disconnected',
    };
    return mapping[uazStatus] || 'disconnected';
  }

  private mapEvent(uazEvent: string): NormalizedWebhook['event'] {
    const mapping: Record<string, NormalizedWebhook['event']> = {
      'messages': 'message.received',
      'message': 'message.received',
      'message.send': 'message.sent',
      'messages_update': 'message.updated',
      'connection': 'instance.connected',
      'connection.update': 'instance.connected',
      'qr': 'instance.qr',
      'chats': 'chat.created',
      'contacts': 'contact.updated',
    };
    return mapping[uazEvent] || 'message.received';
  }

  private mapMessageType(uazType: string): any {
    const mapping: Record<string, string> = {
      'conversation': 'text',
      'extendedTextMessage': 'text',
      'imageMessage': 'image',
      'videoMessage': 'video',
      'audioMessage': 'audio',
      'ptt': 'voice',
      'documentMessage': 'document',
      'locationMessage': 'location',
      'contactMessage': 'contact',
    };
    return mapping[uazType] || 'text';
  }
}
