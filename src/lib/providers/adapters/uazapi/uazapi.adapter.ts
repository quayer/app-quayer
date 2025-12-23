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
import { UAZClient } from './uazapi.client';
import { uazService } from '@/lib/uaz/uaz.service';
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
    const token = await this.getInstanceToken(instanceId);
    await this.client.deleteInstance(instanceId, token);
  }

  async getInstanceStatus(instanceId: string): Promise<InstanceStatus> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.getInstanceStatus(token);
    return this.mapStatus(response.data.status);
  }

  // ===== QR CODE / CONNECTION =====

  /**
   * Conecta a instância ao WhatsApp gerando QR Code
   * Usa POST /instance/connect
   */
  async generateQRCode(instanceId: string): Promise<QRCodeResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.connectInstance(token);

    return {
      qrCode: response.data.qrcode || response.data.qr,
      pairingCode: response.data.pairingCode || response.data.paircode,
    };
  }

  /**
   * Gera pairing code para conexão via número de telefone
   * Usa POST /instance/connect com phone
   */
  async getPairingCode(instanceId: string, phone?: string): Promise<PairingCodeResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.connectInstance(token, phone);

    return {
      pairingCode: response.data.pairingCode || response.data.paircode || response.data.code,
    };
  }

  async disconnect(instanceId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.disconnectInstance(token);
  }

  async restart(instanceId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.restartInstance(token);
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
    const token = await this.getInstanceToken(instanceId);
    const response = await uazService.sendLocation(token, {
      number: data.to,
      lat: data.latitude,
      lng: data.longitude,
      name: data.name,
      address: data.address,
    });

    return {
      messageId: response.messageId || response.id || `loc_${Date.now()}`,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  async sendContact(instanceId: string, data: SendContactInput): Promise<MessageResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await uazService.sendContact(token, {
      number: data.to,
      contact: {
        name: data.contact.name,
        number: data.contact.phone,
      },
    });

    return {
      messageId: response.messageId || response.id || `contact_${Date.now()}`,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  // ===== MENSAGENS INTERATIVAS =====
  async sendInteractiveList(instanceId: string, data: SendInteractiveListInput): Promise<MessageResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await uazService.sendList(token, {
      number: data.to,
      title: data.title,
      description: data.description,
      buttonText: data.buttonText,
      sections: data.sections,
      footer: data.footer,
    });

    return {
      messageId: response.messageId || response.id || `list_${Date.now()}`,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  async sendInteractiveButtons(instanceId: string, data: SendInteractiveButtonsInput): Promise<MessageResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await uazService.sendButtons(token, {
      number: data.to,
      text: data.text,
      buttons: data.buttons,
      footer: data.footer,
    });

    return {
      messageId: response.messageId || response.id || `btn_${Date.now()}`,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  // ===== AÇÕES DE MENSAGEM =====
  async markAsRead(instanceId: string, messageId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await uazService.markAsRead(token, messageId);
  }

  async reactToMessage(instanceId: string, messageId: string, emoji: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await uazService.reactToMessage(token, messageId, emoji);
  }

  async deleteMessage(instanceId: string, messageId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await uazService.deleteMessage(token, messageId);
  }

  // ===== PRESENÇA =====
  async sendPresence(instanceId: string, to: string, type: PresenceType): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await uazService.sendPresence(token, to, type);
  }

  // ===== MÍDIA =====
  async downloadMedia(instanceId: string, messageId: string): Promise<MediaDownloadResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await uazService.downloadMedia(token, messageId);

    return {
      data: response.data, // Base64
      mimeType: response.mimetype,
      fileName: response.fileName,
      size: response.size,
    };
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
    // UAZapi Global Webhook format:
    // {
    //   "BaseUrl": "https://quayer.uazapi.com",
    //   "EventType": "messages",
    //   "chat": { "wa_chatid": "...", "wa_name": "..." },
    //   "instanceName": "...",
    //   "message": { "chatid": "...", "content": { "text": "...", "key": { "ID": "..." } } },
    //   "token": "..."
    // }

    // Map event type - UAZapi uses "EventType" or "type"
    const eventType = rawWebhook.EventType || rawWebhook.event || rawWebhook.type || 'messages';
    const event = this.mapEvent(eventType);

    // Instance ID will be resolved by token in the webhook handler
    // We pass the token here for lookup
    const instanceId = rawWebhook.instanceId || rawWebhook.instance_id || rawWebhook.token || '';

    // Extract chat info - UAZapi uses "chat" object
    const chat = rawWebhook.chat || {};
    const chatId = chat.wa_chatid || rawWebhook.chatId || rawWebhook.message?.chatid || '';

    // Extract "from" - for incoming messages, it's the chat ID (phone@s.whatsapp.net or group@g.us)
    const from = chatId || rawWebhook.from || rawWebhook.data?.from || '';

    // Extract message content - UAZapi uses "message" object with "content" inside
    const rawMessage = rawWebhook.message || rawWebhook.data?.message;
    const messageContent = rawMessage?.content || rawMessage;

    let message: NormalizedWebhook['data']['message'] = undefined;

    if (rawMessage && messageContent) {
      const messageId = messageContent.key?.ID || messageContent.key?.id || rawMessage.id || '';
      const messageType = rawMessage.type || messageContent.type || 'text';
      const textContent = messageContent.text || messageContent.body || messageContent.caption || rawMessage.text || '';

      // Check for media
      const mediaUrl = messageContent.mediaUrl || rawMessage.mediaUrl || messageContent.url;

      message = {
        id: messageId,
        type: this.mapMessageType(messageType),
        content: textContent,
        media: mediaUrl ? {
          id: messageId,
          type: this.mapMessageType(messageType),
          mediaUrl: mediaUrl,
          caption: messageContent.caption || '',
          fileName: messageContent.filename || messageContent.fileName || '',
          mimeType: messageContent.mimetype || messageContent.mimeType || '',
          size: messageContent.fileSize || messageContent.size,
          duration: messageContent.seconds || messageContent.duration,
        } : undefined,
        timestamp: new Date(messageContent.senderTimestampMS || rawMessage.timestamp || Date.now()),
        // Location data
        latitude: messageContent.latitude || messageContent.lat,
        longitude: messageContent.longitude || messageContent.lng,
        locationName: messageContent.name || messageContent.locationName,
      };
    }

    return {
      event,
      instanceId,
      timestamp: new Date(rawWebhook.timestamp || chat.wa_lastMsgTimestamp || Date.now()),
      data: {
        chatId,
        from,
        to: rawWebhook.to || rawWebhook.data?.to,
        message,
        status: rawWebhook.state || rawWebhook.data?.status ? this.mapStatus(rawWebhook.state || rawWebhook.data?.status) : undefined,
        qrCode: rawWebhook.qrcode || rawWebhook.data?.qrcode,
      },
      rawPayload: rawWebhook,
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
    const instance = await database.connection.findUnique({
      where: { id: instanceId },
      select: { uazapiToken: true },
    });

    if (!instance?.uazapiToken) {
      throw new Error(`Instance ${instanceId} not found or missing UAZ token`);
    }

    return instance.uazapiToken;
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
