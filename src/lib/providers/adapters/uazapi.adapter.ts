/**
 * UAZapi Adapter (Legacy Interface Wrapper)
 *
 * Este arquivo é um wrapper que expõe a interface IProviderAdapter
 * usando o novo adapter UAZapiAdapter internamente.
 *
 * Mantido para compatibilidade com o ProviderOrchestrator legado.
 */

import { IProviderAdapter } from '../interfaces/provider-adapter.interface';
import {
  NormalizedMessage,
  NormalizedContact,
  NormalizedInstance,
  NormalizedWebhookPayload,
  ProviderResponse,
  ProviderType,
  MessageType,
  MessageStatus,
  InstanceStatus,
  WebhookEvent,
} from '../types/normalized.types';
import { uazService } from '@/lib/uaz/uaz.service';

// Type assertion para métodos dinâmicos do uazService
const uazServiceAny = uazService as any;

class UAZapiLegacyAdapter implements IProviderAdapter {
  readonly providerType = ProviderType.UAZAPI;
  readonly providerName = 'UAZapi';

  // ==========================================
  // INSTANCE MANAGEMENT
  // ==========================================

  async createInstance(params: {
    instanceId: string;
    name: string;
    token?: string;
    webhookUrl?: string;
  }): Promise<ProviderResponse<NormalizedInstance>> {
    try {
      if (params.token) {
        await uazServiceAny.initInstance(params.token, params.name);
      }

      return {
        success: true,
        data: {
          id: params.instanceId,
          name: params.name,
          status: InstanceStatus.DISCONNECTED,
          provider: ProviderType.UAZAPI,
          createdAt: new Date(),
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'createInstance');
    }
  }

  async connectInstance(params: {
    token: string;
    instanceId: string;
  }): Promise<ProviderResponse<{ qrCode?: string }>> {
    try {
      const result = await uazServiceAny.connectInstance(params.token);

      const qrCode = typeof result === 'string'
        ? result
        : result?.qrcode ||
          (result as any)?.instance?.qrcode ||
          (result as any)?.data?.qrcode ||
          (typeof result === 'object' ? JSON.stringify(result) : undefined);

      const isValidQrCode = qrCode &&
        typeof qrCode === 'string' &&
        (qrCode.startsWith('data:image') || qrCode.startsWith('http'));

      return {
        success: true,
        data: {
          qrCode: isValidQrCode ? qrCode : undefined,
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'connectInstance');
    }
  }

  async disconnectInstance(params: {
    token: string;
    instanceId: string;
  }): Promise<ProviderResponse<void>> {
    try {
      await uazServiceAny.disconnectInstance(params.token);

      return {
        success: true,
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'disconnectInstance');
    }
  }

  async getInstanceStatus(params: {
    token: string;
  }): Promise<ProviderResponse<NormalizedInstance>> {
    try {
      const result = await uazServiceAny.getStatus(params.token);

      const status = this.mapStatus(result?.status || result?.state || 'disconnected');

      return {
        success: true,
        data: {
          id: result?.instanceId || '',
          name: result?.instanceName || result?.name || '',
          status,
          phoneNumber: result?.phoneNumber || result?.owner,
          profileName: result?.profileName,
          profilePicture: result?.profilePicUrl,
          provider: ProviderType.UAZAPI,
          createdAt: new Date(),
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'getInstanceStatus');
    }
  }

  async deleteInstance(params: {
    token: string;
    instanceId: string;
  }): Promise<ProviderResponse<void>> {
    try {
      await uazServiceAny.deleteInstance(params.token);

      return {
        success: true,
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'deleteInstance');
    }
  }

  // ==========================================
  // MESSAGE OPERATIONS
  // ==========================================

  async sendTextMessage(params: {
    token: string;
    to: string;
    text: string;
    quotedMessageId?: string;
  }): Promise<ProviderResponse<NormalizedMessage>> {
    try {
      const result = await uazServiceAny.sendText(params.token, params.to, params.text);

      return {
        success: true,
        data: this.normalizeMessage(result),
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'sendTextMessage');
    }
  }

  async sendMediaMessage(params: {
    token: string;
    to: string;
    mediaUrl: string;
    caption?: string;
    fileName?: string;
  }): Promise<ProviderResponse<NormalizedMessage>> {
    try {
      const result = await uazServiceAny.sendMedia(
        params.token,
        params.to,
        params.mediaUrl,
        params.caption,
        params.fileName
      );

      return {
        success: true,
        data: this.normalizeMessage(result),
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'sendMediaMessage');
    }
  }

  async sendButtonsMessage(params: {
    token: string;
    to: string;
    text: string;
    buttons: Array<{ id: string; text: string }>;
  }): Promise<ProviderResponse<NormalizedMessage>> {
    try {
      const result = await uazServiceAny.sendButtons(
        params.token,
        params.to,
        params.text,
        params.buttons
      );

      return {
        success: true,
        data: this.normalizeMessage(result),
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'sendButtonsMessage');
    }
  }

  async sendListMessage(params: {
    token: string;
    to: string;
    text: string;
    buttonText: string;
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  }): Promise<ProviderResponse<NormalizedMessage>> {
    try {
      const result = await uazServiceAny.sendList(
        params.token,
        params.to,
        params.text,
        params.buttonText,
        params.sections
      );

      return {
        success: true,
        data: this.normalizeMessage(result),
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'sendListMessage');
    }
  }

  async sendLocationMessage(params: {
    token: string;
    to: string;
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  }): Promise<ProviderResponse<NormalizedMessage>> {
    try {
      const result = await uazServiceAny.sendLocation(
        params.token,
        params.to,
        params.latitude,
        params.longitude,
        params.name,
        params.address
      );

      return {
        success: true,
        data: this.normalizeMessage(result),
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'sendLocationMessage');
    }
  }

  async sendContactMessage(params: {
    token: string;
    to: string;
    contacts: Array<{ name: string; phone: string }>;
  }): Promise<ProviderResponse<NormalizedMessage>> {
    try {
      const result = await uazServiceAny.sendContact(
        params.token,
        params.to,
        params.contacts
      );

      return {
        success: true,
        data: this.normalizeMessage(result),
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'sendContactMessage');
    }
  }

  // ==========================================
  // CHAT OPERATIONS
  // ==========================================

  async getMessages(params: {
    token: string;
    chatId: string;
    limit?: number;
  }): Promise<ProviderResponse<NormalizedMessage[]>> {
    try {
      const result = await uazServiceAny.findMessages(params.token, {
        chatId: params.chatId,
        limit: params.limit || 50,
      });

      const messages = (result?.messages || []).map((msg: any) => this.normalizeMessage(msg));

      return {
        success: true,
        data: messages,
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'getMessages');
    }
  }

  async markAsRead(params: {
    token: string;
    messageId: string;
  }): Promise<ProviderResponse<void>> {
    try {
      await uazServiceAny.markAsRead(params.token, params.messageId);

      return {
        success: true,
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'markAsRead');
    }
  }

  async deleteMessage(params: {
    token: string;
    messageId: string;
  }): Promise<ProviderResponse<void>> {
    try {
      await uazServiceAny.deleteMessage(params.token, params.messageId);

      return {
        success: true,
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'deleteMessage');
    }
  }

  async sendPresence(params: {
    token: string;
    to: string;
    presence: 'composing' | 'recording' | 'paused';
  }): Promise<ProviderResponse<void>> {
    try {
      await uazServiceAny.sendPresence(params.token, params.to, params.presence);

      return {
        success: true,
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'sendPresence');
    }
  }

  // ==========================================
  // CONTACT OPERATIONS
  // ==========================================

  async getContact(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<NormalizedContact>> {
    try {
      const result = await uazServiceAny.getContact(params.token, params.phoneNumber);

      return {
        success: true,
        data: {
          phoneNumber: params.phoneNumber,
          name: result?.pushname || result?.name,
          profilePicture: result?.profilePicUrl,
          isBlocked: result?.isBlocked || false,
          isBusiness: result?.isBusiness || false,
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'getContact');
    }
  }

  async checkNumber(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<{ exists: boolean; jid?: string }>> {
    try {
      const result = await uazServiceAny.checkNumber(params.token, params.phoneNumber);

      return {
        success: true,
        data: {
          exists: result?.exists || result?.numberExists || false,
          jid: result?.jid || result?.id,
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'checkNumber');
    }
  }

  async getProfilePicture(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<{ url: string }>> {
    try {
      const result = await uazServiceAny.getProfilePicture(params.token, params.phoneNumber);

      return {
        success: true,
        data: {
          url: result?.url || result?.profilePicUrl || '',
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'getProfilePicture');
    }
  }

  async blockContact(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<void>> {
    try {
      await uazServiceAny.blockContact(params.token, params.phoneNumber);

      return {
        success: true,
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'blockContact');
    }
  }

  async unblockContact(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<void>> {
    try {
      await uazServiceAny.unblockContact(params.token, params.phoneNumber);

      return {
        success: true,
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'unblockContact');
    }
  }

  // ==========================================
  // GROUP OPERATIONS
  // ==========================================

  async createGroup(params: {
    token: string;
    name: string;
    participants: string[];
  }): Promise<ProviderResponse<{ groupId: string }>> {
    try {
      const result = await uazServiceAny.createGroup(params.token, params.name, params.participants);

      return {
        success: true,
        data: {
          groupId: result?.groupId || result?.id || '',
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'createGroup');
    }
  }

  async addGroupParticipants(params: {
    token: string;
    groupId: string;
    participants: string[];
  }): Promise<ProviderResponse<void>> {
    try {
      await uazServiceAny.addGroupParticipants(params.token, params.groupId, params.participants);

      return {
        success: true,
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'addGroupParticipants');
    }
  }

  async removeGroupParticipants(params: {
    token: string;
    groupId: string;
    participants: string[];
  }): Promise<ProviderResponse<void>> {
    try {
      await uazServiceAny.removeGroupParticipants(params.token, params.groupId, params.participants);

      return {
        success: true,
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'removeGroupParticipants');
    }
  }

  async leaveGroup(params: {
    token: string;
    groupId: string;
  }): Promise<ProviderResponse<void>> {
    try {
      await uazServiceAny.leaveGroup(params.token, params.groupId);

      return {
        success: true,
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'leaveGroup');
    }
  }

  async getGroupInviteLink(params: {
    token: string;
    groupId: string;
  }): Promise<ProviderResponse<{ inviteLink: string }>> {
    try {
      const result = await uazServiceAny.getGroupInviteLink(params.token, params.groupId);

      return {
        success: true,
        data: {
          inviteLink: result?.inviteLink || result?.link || '',
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.errorResponse(error, 'getGroupInviteLink');
    }
  }

  // ==========================================
  // WEBHOOK NORMALIZATION
  // ==========================================

  async normalizeWebhook(rawPayload: any): Promise<NormalizedWebhookPayload> {
    const event = rawPayload.event || 'unknown';
    const instance = rawPayload.instance || {};

    // Mapear evento UAZapi para evento normalizado
    const eventMap: Record<string, WebhookEvent> = {
      'messages': WebhookEvent.MESSAGE_RECEIVED,
      'messages_update': WebhookEvent.MESSAGE_STATUS_UPDATE,
      'connection': WebhookEvent.CONNECTION_UPDATE,
      'contacts': WebhookEvent.CONTACT_UPDATE,
      'call': WebhookEvent.CALL_RECEIVED,
      'presence': WebhookEvent.PRESENCE_UPDATE,
      'groups': WebhookEvent.GROUP_UPDATE,
      'chats': WebhookEvent.CHAT_UPDATE,
      'qrcode': WebhookEvent.QR_CODE,
    };

    const normalizedEvent = eventMap[event] || WebhookEvent.UNKNOWN;

    return {
      event: normalizedEvent,
      instanceId: instance.instanceId || instance.name || rawPayload.instanceId,
      instanceName: instance.instanceName || instance.name,
      provider: ProviderType.UAZAPI,
      timestamp: new Date(),
      rawData: rawPayload,
      ...(rawPayload.data?.message && {
        message: this.normalizeMessage(rawPayload.data.message),
      }),
    };
  }

  // ==========================================
  // HEALTH CHECK
  // ==========================================

  async healthCheck(): Promise<ProviderResponse<{ healthy: boolean; latency: number }>> {
    const start = Date.now();

    try {
      // Verificar se o serviço UAZapi está acessível
      const baseUrl = process.env.UAZAPI_URL || 'https://quayer.uazapi.com';
      const response = await fetch(`${baseUrl}/`, { method: 'HEAD' });
      const latency = Date.now() - start;

      return {
        success: true,
        data: {
          healthy: response.ok,
          latency,
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        data: {
          healthy: false,
          latency: Date.now() - start,
        },
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: error instanceof Error ? error.message : 'Health check failed',
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    }
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private mapStatus(status: string): InstanceStatus {
    const statusMap: Record<string, InstanceStatus> = {
      'open': InstanceStatus.CONNECTED,
      'connected': InstanceStatus.CONNECTED,
      'close': InstanceStatus.DISCONNECTED,
      'closed': InstanceStatus.DISCONNECTED,
      'disconnected': InstanceStatus.DISCONNECTED,
      'connecting': InstanceStatus.CONNECTING,
      'qrcode': InstanceStatus.QR_CODE,
      'qr_code': InstanceStatus.QR_CODE,
      'error': InstanceStatus.ERROR,
      'failed': InstanceStatus.ERROR,
    };

    return statusMap[status?.toLowerCase()] || InstanceStatus.DISCONNECTED;
  }

  private normalizeMessage(rawMessage: any): NormalizedMessage {
    const remoteJid = rawMessage?.key?.remoteJid || rawMessage?.chatid || rawMessage?.from || '';
    const isGroup = remoteJid.includes('@g.us');

    return {
      id: rawMessage?.key?.id || rawMessage?.id || rawMessage?.messageid || '',
      instanceId: rawMessage?.instanceId || '',
      from: rawMessage?.key?.participant || rawMessage?.author || rawMessage?.from || '',
      to: rawMessage?.to,
      isGroup,
      groupId: isGroup ? remoteJid : undefined,
      type: this.mapMessageType(rawMessage?.type || rawMessage?.messageType),
      content: {
        text: rawMessage?.message?.conversation ||
              rawMessage?.message?.extendedTextMessage?.text ||
              rawMessage?.text ||
              rawMessage?.caption ||
              '',
      },
      timestamp: rawMessage?.messageTimestamp
        ? new Date(rawMessage.messageTimestamp * 1000)
        : new Date(),
      isFromMe: rawMessage?.key?.fromMe || rawMessage?.fromMe || false,
      status: this.mapMessageStatus(rawMessage?.status || rawMessage?.ack),
      quotedMessage: rawMessage?.quotedMsg ? {
        id: rawMessage.quotedMsg.key?.id || '',
        from: rawMessage.quotedMsg.key?.participant || rawMessage.quotedMsg.from || '',
        content: rawMessage.quotedMsg.message?.conversation || '',
      } : undefined,
      raw: rawMessage,
    };
  }

  private mapMessageType(type: string): MessageType {
    const typeMap: Record<string, MessageType> = {
      'conversation': MessageType.TEXT,
      'text': MessageType.TEXT,
      'extendedTextMessage': MessageType.TEXT,
      'image': MessageType.IMAGE,
      'imageMessage': MessageType.IMAGE,
      'video': MessageType.VIDEO,
      'videoMessage': MessageType.VIDEO,
      'audio': MessageType.AUDIO,
      'audioMessage': MessageType.AUDIO,
      'voice': MessageType.AUDIO,
      'ptt': MessageType.AUDIO, // Push-to-talk voice messages
      'document': MessageType.DOCUMENT,
      'documentMessage': MessageType.DOCUMENT,
      'sticker': MessageType.STICKER,
      'stickerMessage': MessageType.STICKER,
      'location': MessageType.LOCATION,
      'locationMessage': MessageType.LOCATION,
      'contact': MessageType.CONTACT,
      'contactMessage': MessageType.CONTACT,
      'buttons': MessageType.BUTTONS,
      'buttonsMessage': MessageType.BUTTONS,
      'list': MessageType.LIST,
      'listMessage': MessageType.LIST,
    };

    return typeMap[type] || MessageType.UNKNOWN;
  }

  private mapMessageStatus(status: string | number): MessageStatus {
    const statusMap: Record<string | number, MessageStatus> = {
      'pending': MessageStatus.PENDING,
      'sent': MessageStatus.SENT,
      'delivered': MessageStatus.DELIVERED,
      'read': MessageStatus.READ,
      'failed': MessageStatus.FAILED,
      0: MessageStatus.PENDING,
      1: MessageStatus.SENT,
      2: MessageStatus.DELIVERED,
      3: MessageStatus.READ,
      4: MessageStatus.READ,
    };

    return statusMap[status] || MessageStatus.PENDING;
  }

  private errorResponse<T>(error: any, operation: string): ProviderResponse<T> {
    const message = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: {
        code: `UAZAPI_${operation.toUpperCase()}_ERROR`,
        message: `[UAZapi ${operation}] ${message}`,
      },
      provider: ProviderType.UAZAPI,
      timestamp: new Date(),
    } as ProviderResponse<T>;
  }
}

// Singleton instance para uso no orchestrator legado
export const uazapiAdapter = new UAZapiLegacyAdapter();

// Export da classe para extensão
export { UAZapiLegacyAdapter };
