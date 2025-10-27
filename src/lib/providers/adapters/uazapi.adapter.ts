/**
 * UAZapi Adapter
 *
 * Implementa a interface IProviderAdapter para o UAZapi.
 * Traduz chamadas padronizadas para o formato específico do UAZapi.
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

export class UAZapiAdapter implements IProviderAdapter {
  readonly providerType = ProviderType.UAZAPI;
  readonly providerName = 'UAZapi';

  // ==========================================
  // INSTANCE MANAGEMENT
  // ==========================================

  async createInstance(params: {
    instanceId: string;
    name: string;
    webhookUrl?: string;
  }): Promise<ProviderResponse<NormalizedInstance>> {
    const startTime = Date.now();

    try {
      const result = await uazService.createInstance(params.name, params.webhookUrl);

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
      const result = await uazService.connectInstance(params.token);

      return {
        success: true,
        data: {
          qrCode: result.qrCode,
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
      await uazService.disconnectInstance(params.token);

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
      const result = await uazService.getInstanceStatus(params.token);

      return {
        success: true,
        data: {
          id: result.instance?.name || '',
          name: result.instance?.name || '',
          status: this.normalizeInstanceStatus(result.state),
          phoneNumber: result.instance?.owner,
          profileName: result.instance?.profileName,
          profilePicture: result.instance?.profilePicUrl,
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
      await uazService.deleteInstance(params.token);

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
      const result = await uazService.sendTextMessage(
        params.token,
        params.to,
        params.text
      );

      return {
        success: true,
        data: {
          id: result.key?.id || '',
          instanceId: params.token,
          from: result.key?.fromMe ? 'me' : params.to,
          to: params.to,
          isGroup: params.to.includes('@g.us'),
          type: MessageType.TEXT,
          content: {
            text: params.text,
          },
          timestamp: new Date(),
          isFromMe: true,
          status: MessageStatus.SENT,
          raw: result,
        },
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
      const result = await uazService.sendMediaMessage(
        params.token,
        params.to,
        params.mediaUrl,
        params.caption,
        params.fileName
      );

      return {
        success: true,
        data: {
          id: result.key?.id || '',
          instanceId: params.token,
          from: 'me',
          to: params.to,
          isGroup: params.to.includes('@g.us'),
          type: this.detectMessageType(result), // ✅ Detecção automática de mimeType
          content: {
            mediaUrl: params.mediaUrl,
            caption: params.caption,
            fileName: params.fileName,
          },
          timestamp: new Date(),
          isFromMe: true,
          status: MessageStatus.SENT,
          raw: result,
        },
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
      const result = await uazService.sendButtonsMessage(
        params.token,
        params.to,
        params.text,
        params.buttons
      );

      return {
        success: true,
        data: {
          id: result.key?.id || '',
          instanceId: params.token,
          from: 'me',
          to: params.to,
          isGroup: params.to.includes('@g.us'),
          type: MessageType.BUTTONS,
          content: {
            text: params.text,
            buttons: params.buttons,
          },
          timestamp: new Date(),
          isFromMe: true,
          status: MessageStatus.SENT,
          raw: result,
        },
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
      const result = await uazService.sendListMessage(
        params.token,
        params.to,
        params.text,
        params.buttonText,
        params.sections
      );

      return {
        success: true,
        data: {
          id: result.key?.id || '',
          instanceId: params.token,
          from: 'me',
          to: params.to,
          isGroup: params.to.includes('@g.us'),
          type: MessageType.LIST,
          content: {
            text: params.text,
            listItems: params.sections.flatMap((s) => s.rows),
          },
          timestamp: new Date(),
          isFromMe: true,
          status: MessageStatus.SENT,
          raw: result,
        },
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
      const result = await uazService.sendLocationMessage(
        params.token,
        params.to,
        params.latitude,
        params.longitude,
        params.name,
        params.address
      );

      return {
        success: true,
        data: {
          id: result.key?.id || '',
          instanceId: params.token,
          from: 'me',
          to: params.to,
          isGroup: params.to.includes('@g.us'),
          type: MessageType.LOCATION,
          content: {
            latitude: params.latitude,
            longitude: params.longitude,
            text: params.name,
          },
          timestamp: new Date(),
          isFromMe: true,
          status: MessageStatus.SENT,
          raw: result,
        },
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
      const result = await uazService.sendContactMessage(
        params.token,
        params.to,
        params.contacts
      );

      return {
        success: true,
        data: {
          id: result.key?.id || '',
          instanceId: params.token,
          from: 'me',
          to: params.to,
          isGroup: params.to.includes('@g.us'),
          type: MessageType.CONTACT,
          content: {
            contacts: params.contacts,
          },
          timestamp: new Date(),
          isFromMe: true,
          status: MessageStatus.SENT,
          raw: result,
        },
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
      const result = await uazService.getMessages(
        params.token,
        params.chatId,
        params.limit
      );

      const messages: NormalizedMessage[] = (result.messages || []).map(
        (msg: any) => this.normalizeMessage(msg, params.token)
      );

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
      await uazService.markAsRead(params.token, params.messageId);

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
      await uazService.deleteMessage(params.token, params.messageId);

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
      await uazService.sendPresence(params.token, params.to, params.presence);

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
      const result = await uazService.getContact(params.token, params.phoneNumber);

      return {
        success: true,
        data: {
          phoneNumber: params.phoneNumber,
          name: result.name,
          profilePicture: result.profilePicUrl,
          isBlocked: false,
          isBusiness: result.isBusiness || false,
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
      const result = await uazService.checkNumber(params.token, params.phoneNumber);

      return {
        success: true,
        data: {
          exists: result.exists,
          jid: result.jid,
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
      const result = await uazService.getProfilePicture(
        params.token,
        params.phoneNumber
      );

      return {
        success: true,
        data: {
          url: result.url,
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
      await uazService.blockContact(params.token, params.phoneNumber);

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
      await uazService.unblockContact(params.token, params.phoneNumber);

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
      const result = await uazService.createGroup(
        params.token,
        params.name,
        params.participants
      );

      return {
        success: true,
        data: {
          groupId: result.groupId,
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
      await uazService.addGroupParticipants(
        params.token,
        params.groupId,
        params.participants
      );

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
      await uazService.removeGroupParticipants(
        params.token,
        params.groupId,
        params.participants
      );

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
      await uazService.leaveGroup(params.token, params.groupId);

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
      const result = await uazService.getGroupInviteLink(
        params.token,
        params.groupId
      );

      return {
        success: true,
        data: {
          inviteLink: result.inviteLink,
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
    const event = rawPayload.event;
    const instanceId = rawPayload.instance?.name || '';
    const timestamp = new Date(rawPayload.date_time || Date.now());

    // Switch para todos os 14 eventos do UAZapi
    switch (event) {
      case 'messages':
        return {
          event: WebhookEvent.MESSAGE_RECEIVED,
          instanceId,
          timestamp,
          message: this.normalizeMessage(rawPayload.data, instanceId),
          raw: rawPayload,
        };

      case 'messages_update':
        // Atualização de status de mensagem (entregue, lida, etc.)
        return {
          event: WebhookEvent.MESSAGE_STATUS_UPDATE,
          instanceId,
          timestamp,
          message: this.normalizeMessage(rawPayload.data, instanceId),
          raw: rawPayload,
        };

      case 'connection':
        return {
          event: WebhookEvent.CONNECTION_UPDATE,
          instanceId,
          timestamp,
          instanceUpdate: {
            status: this.normalizeInstanceStatus(rawPayload.data?.state),
            qrCode: rawPayload.data?.qrCode,
          },
          raw: rawPayload,
        };

      case 'call':
        return {
          event: WebhookEvent.CALL_RECEIVED,
          instanceId,
          timestamp,
          callUpdate: {
            callId: rawPayload.data?.id,
            from: rawPayload.data?.from,
            timestamp: new Date(rawPayload.data?.timestamp || Date.now()),
            status: 'ringing',
          },
          raw: rawPayload,
        };

      case 'presence':
        return {
          event: WebhookEvent.PRESENCE_UPDATE,
          instanceId,
          timestamp,
          presenceUpdate: {
            phoneNumber: rawPayload.data?.id?.replace('@s.whatsapp.net', '') || '',
            presence: rawPayload.data?.presences?.[rawPayload.data?.id]?.lastKnownPresence || 'unavailable',
          },
          raw: rawPayload,
        };

      case 'groups':
        return {
          event: WebhookEvent.GROUP_UPDATE,
          instanceId,
          timestamp,
          groupUpdate: {
            groupId: rawPayload.data?.id || '',
            action: this.normalizeGroupAction(rawPayload.data?.action),
            participants: rawPayload.data?.participants || [],
          },
          raw: rawPayload,
        };

      case 'contacts':
      case 'chats':
      case 'labels':
      case 'chat_labels':
      case 'blocks':
      case 'history':
      case 'leads':
      case 'sender':
        // Eventos que não têm enum específico ainda
        // Retornar evento genérico mas com payload original preservado
        return {
          event: WebhookEvent.MESSAGE_RECEIVED, // Fallback temporário
          instanceId,
          timestamp,
          raw: rawPayload,
        };

      default:
        // Evento desconhecido - log warning e retorna com raw
        console.warn(`[UAZapiAdapter] Evento de webhook desconhecido: ${event}`);
        return {
          event: WebhookEvent.MESSAGE_RECEIVED, // Fallback
          instanceId,
          timestamp,
          raw: rawPayload,
        };
    }
  }

  // ==========================================
  // HEALTH CHECK
  // ==========================================

  async healthCheck(): Promise<
    ProviderResponse<{ healthy: boolean; latency: number }>
  > {
    const startTime = Date.now();

    try {
      // Fazer uma requisição simples para verificar saúde
      await fetch(`${process.env.UAZ_API_URL}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const latency = Date.now() - startTime;

      return {
        success: true,
        data: {
          healthy: true,
          latency,
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    } catch (error) {
      const latency = Date.now() - startTime;

      return {
        success: false,
        data: {
          healthy: false,
          latency,
        },
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'UAZapi não está acessível',
          details: error,
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      };
    }
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private normalizeMessage(msg: any, instanceId: string): NormalizedMessage {
    return {
      id: msg.key?.id || '',
      instanceId,
      from: msg.key?.remoteJid?.replace('@s.whatsapp.net', '') || '',
      to: msg.key?.remoteJid || '',
      isGroup: msg.key?.remoteJid?.includes('@g.us') || false,
      type: this.detectMessageType(msg), // ✅ Detecção automática de mimeType
      content: {
        text: msg.message?.conversation || msg.message?.extendedTextMessage?.text,
        caption: msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption,
        mediaUrl: msg.message?.imageMessage?.url || msg.message?.videoMessage?.url || msg.message?.documentMessage?.url,
        fileName: msg.message?.documentMessage?.fileName,
        mimeType: msg.message?.imageMessage?.mimetype || msg.message?.videoMessage?.mimetype || msg.message?.documentMessage?.mimetype,
      },
      timestamp: new Date(msg.messageTimestamp * 1000),
      isFromMe: msg.key?.fromMe || false,
      status: MessageStatus.DELIVERED,
      raw: msg,
    };
  }

  private normalizeMessageType(type: string): MessageType {
    const typeMap: Record<string, MessageType> = {
      conversation: MessageType.TEXT,
      extendedTextMessage: MessageType.TEXT,
      imageMessage: MessageType.IMAGE,
      videoMessage: MessageType.VIDEO,
      audioMessage: MessageType.AUDIO,
      documentMessage: MessageType.DOCUMENT,
      stickerMessage: MessageType.STICKER,
      locationMessage: MessageType.LOCATION,
      contactMessage: MessageType.CONTACT,
      buttonsMessage: MessageType.BUTTONS,
      listMessage: MessageType.LIST,
    };

    return typeMap[type] || MessageType.TEXT;
  }

  private normalizeInstanceStatus(state: string): InstanceStatus {
    const statusMap: Record<string, InstanceStatus> = {
      open: InstanceStatus.CONNECTED,
      connecting: InstanceStatus.CONNECTING,
      close: InstanceStatus.DISCONNECTED,
      qr: InstanceStatus.QR_CODE,
    };

    return statusMap[state] || InstanceStatus.DISCONNECTED;
  }

  private normalizeGroupAction(action: string): 'create' | 'update' | 'delete' | 'participant_add' | 'participant_remove' {
    const actionMap: Record<string, 'create' | 'update' | 'delete' | 'participant_add' | 'participant_remove'> = {
      create: 'create',
      add: 'participant_add',
      remove: 'participant_remove',
      promote: 'update',
      demote: 'update',
      update: 'update',
      delete: 'delete',
    };

    return actionMap[action] || 'update';
  }

  private detectMessageType(message: any): MessageType {
    // Detectar tipo baseado no mimeType se disponível
    const mimeType =
      message.message?.imageMessage?.mimetype ||
      message.message?.videoMessage?.mimetype ||
      message.message?.audioMessage?.mimetype ||
      message.message?.documentMessage?.mimetype;

    if (mimeType) {
      if (mimeType.startsWith('image/')) return MessageType.IMAGE;
      if (mimeType.startsWith('video/')) return MessageType.VIDEO;
      if (mimeType.startsWith('audio/')) return MessageType.AUDIO;
      return MessageType.DOCUMENT;
    }

    // Fallback para messageType
    return this.normalizeMessageType(message.messageType);
  }

  private errorResponse(error: any, operation: string): ProviderResponse<any> {
    return {
      success: false,
      error: {
        code: 'UAZAPI_ERROR',
        message: `Erro ao executar ${operation}`,
        details: error instanceof Error ? error.message : error,
      },
      provider: ProviderType.UAZAPI,
      timestamp: new Date(),
    };
  }
}

// Singleton instance
export const uazapiAdapter = new UAZapiAdapter();
