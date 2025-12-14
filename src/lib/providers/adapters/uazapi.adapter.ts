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
    token?: string;
    webhookUrl?: string;
  }): Promise<ProviderResponse<NormalizedInstance>> {
    try {
      // initInstance requires a token - if not provided, return basic instance data
      if (params.token) {
        await uazService.initInstance(params.token, params.name);
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
      const result = await uazService.connectInstance(params.token);

      // UAZapi pode retornar QR code em diferentes formatos:
      // 1. { qrcode: "data:image/..." } - direto
      // 2. { instance: { qrcode: "..." } } - wrapping
      // 3. { data: { qrcode: "..." } } - outro wrapping
      const qrCode = typeof result === 'string'
        ? result
        : result?.qrcode ||
          (result as any)?.instance?.qrcode ||
          (result as any)?.data?.qrcode ||
          (typeof result === 'object' ? JSON.stringify(result) : undefined);

      // Validar que qrCode é uma string válida (base64 image ou URL)
      const isValidQrCode = qrCode &&
        typeof qrCode === 'string' &&
        (qrCode.startsWith('data:image') || qrCode.startsWith('http'));

      if (!isValidQrCode) {
        console.warn('[UAZapiAdapter] QR Code inválido recebido:', typeof qrCode, qrCode?.substring?.(0, 50));
      }

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
    instanceId?: string;
  }): Promise<ProviderResponse<NormalizedInstance>> {
    try {
      const result = await uazService.getInstanceStatus(params.token);

      return {
        success: true,
        data: {
          id: params.instanceId || '',
          name: result.profileName || '',
          status: this.normalizeInstanceStatus(result.state),
          phoneNumber: undefined,
          profileName: result.profileName,
          profilePicture: result.profilePicUrl,
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
      const result = (await uazService.sendText(params.token, {
        number: params.to,
        text: params.text,
      })) as any;

      return {
        success: true,
        data: {
          id: result?.key?.id || '',
          instanceId: params.token,
          from: result?.key?.fromMe ? 'me' : params.to,
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
      // Detectar tipo de mídia pela URL ou usar image como padrão
      const mediatype = this.detectMediaType(params.mediaUrl);
      const result = (await uazService.sendMedia(params.token, {
        number: params.to,
        mediatype,
        mimetype: `${mediatype}/*`,
        media: params.mediaUrl,
        caption: params.caption,
        fileName: params.fileName,
      })) as any;

      return {
        success: true,
        data: {
          id: result?.key?.id || '',
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
      const result = (await uazService.sendButtons(params.token, {
        number: params.to,
        text: params.text,
        buttons: params.buttons,
      })) as any;

      return {
        success: true,
        data: {
          id: result?.key?.id || '',
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
      const result = (await uazService.sendList(params.token, {
        number: params.to,
        title: params.text,
        buttonText: params.buttonText,
        sections: params.sections,
      })) as any;

      return {
        success: true,
        data: {
          id: result?.key?.id || '',
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
      const result = (await uazService.sendLocation(params.token, {
        number: params.to,
        latitude: params.latitude,
        longitude: params.longitude,
        name: params.name,
        address: params.address,
      })) as any;

      return {
        success: true,
        data: {
          id: result?.key?.id || '',
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
      // UAZService espera um único contato com vCard
      const contact = params.contacts[0];
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${contact.name}\nTEL;TYPE=CELL:${contact.phone}\nEND:VCARD`;
      const result = (await uazService.sendContact(params.token, {
        number: params.to,
        contact: {
          displayName: contact.name,
          vcard,
        },
      })) as any;

      return {
        success: true,
        data: {
          id: result?.key?.id || '',
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
    // UAZService não possui endpoint para listar mensagens
    // Mensagens são recebidas via webhook
    return {
      success: true,
      data: [],
      provider: ProviderType.UAZAPI,
      timestamp: new Date(),
    };
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
    // UAZService não possui endpoint para buscar contato individual
    // Retorna dados básicos
    return {
      success: true,
      data: {
        phoneNumber: params.phoneNumber,
        name: params.phoneNumber,
        profilePicture: undefined,
        isBlocked: false,
        isBusiness: false,
      },
      provider: ProviderType.UAZAPI,
      timestamp: new Date(),
    };
  }

  async checkNumber(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<{ exists: boolean; jid?: string }>> {
    // UAZService não possui endpoint para verificar número
    // Assume que o número existe
    return {
      success: true,
      data: {
        exists: true,
        jid: `${params.phoneNumber}@s.whatsapp.net`,
      },
      provider: ProviderType.UAZAPI,
      timestamp: new Date(),
    };
  }

  async getProfilePicture(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<{ url: string }>> {
    // UAZService não possui endpoint para foto de perfil individual
    return {
      success: true,
      data: {
        url: '',
      },
      provider: ProviderType.UAZAPI,
      timestamp: new Date(),
    };
  }

  async blockContact(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<void>> {
    // UAZService não possui endpoint para bloquear contato
    return {
      success: false,
      error: { code: 'NOT_SUPPORTED', message: 'Block contact not supported by UAZapi' },
      provider: ProviderType.UAZAPI,
      timestamp: new Date(),
    };
  }

  async unblockContact(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<void>> {
    // UAZService não possui endpoint para desbloquear contato
    return {
      success: false,
      error: { code: 'NOT_SUPPORTED', message: 'Unblock contact not supported by UAZapi' },
      provider: ProviderType.UAZAPI,
      timestamp: new Date(),
    };
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
      const result = await uazService.createGroup(params.token, {
        subject: params.name,
        participants: params.participants,
      });

      return {
        success: true,
        data: {
          groupId: (result as any).id || '',
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
      await uazService.updateGroupParticipants(
        params.token,
        params.groupId,
        'add',
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
      await uazService.updateGroupParticipants(
        params.token,
        params.groupId,
        'remove',
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
          inviteLink: (result as any) || '',
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
      const baseUrl = process.env.UAZAPI_URL || process.env.UAZ_API_URL || 'https://quayer.uazapi.com';
      await fetch(`${baseUrl}/health`, {
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

  private detectMediaType(mediaUrl: string): 'image' | 'video' | 'audio' | 'document' {
    const url = mediaUrl.toLowerCase();
    if (url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)) return 'image';
    if (url.match(/\.(mp4|avi|mov|webm)(\?|$)/i)) return 'video';
    if (url.match(/\.(mp3|ogg|wav|m4a|opus)(\?|$)/i)) return 'audio';
    return 'document';
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
