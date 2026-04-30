/**
 * UAZapi Adapter
 *
 * Implementação do IWhatsAppProvider para a API UAZapi
 * Traduz operações normalizadas para chamadas específicas da UAZapi
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
  NormalizedWebhook,
  Chat,
  Contact,
  ChatFilters,
  PresenceType,
  MediaDownloadResult,
  CheckNumberInput,
  CheckNumberResult,
  ChatDetails,
  AddContactInput,
  ContactListInput,
  FindChatsInput,
  FindMessagesInput,
  PinChatInput,
  MuteChatInput,
  ArchiveChatInput,
  BlockContactInput,
  Label,
  SetChatLabelsInput,
  EditLabelInput,
  BusinessProfile,
  UpdateBusinessProfileInput,
  CatalogProduct,
  CommerceSettings,
  SendProductMessageInput,
  SendProductListMessageInput,
  SendCatalogMessageInput,
  BulkSimpleInput,
  BulkAdvancedInput,
  CampaignFolder,
  CampaignMessage,
  MakeCallInput,
  CreateGroupInput,
  GroupInfo,
  UpdateGroupParticipantsInput,
  SendPixButtonInput,
  SendPaymentRequestInput,
  SendLocationButtonInput,
  SendStatusInput,
  EditMessageInput,
} from '../../core/provider.types';
import type {
  IMessagingCapability,
  IInteractiveCapability,
  IInstanceCapability,
  IWebhookCapability,
  IProfileCapability,
  IContactCapability,
  IChatActionsCapability,
  ILabelCapability,
  IBusinessCapability,
  ICatalogCapability,
  ICampaignCapability,
  ICallCapability,
  IGroupCapability,
  IPaymentCapability,
} from '../../core/capabilities';
import { UAZClient } from './uazapi.client';
import { uazService } from '@/lib/uaz/uaz.service';
import { database } from '@/server/services/database';

export class UAZapiAdapter implements IWhatsAppProvider, IMessagingCapability, IInteractiveCapability, IInstanceCapability, IWebhookCapability, IProfileCapability, IContactCapability, IChatActionsCapability, ILabelCapability, IBusinessCapability, ICatalogCapability, ICampaignCapability, ICallCapability, IGroupCapability, IPaymentCapability {
  readonly name = 'UAZapi';
  readonly version = '2.0';

  readonly capabilities: ProviderCapability[] = [
    ProviderCapability.MESSAGING,
    ProviderCapability.INTERACTIVE,
    ProviderCapability.INSTANCE_MANAGEMENT,
    ProviderCapability.WEBHOOKS,
    ProviderCapability.PROFILE,
    ProviderCapability.CONTACTS,
    ProviderCapability.CHAT_ACTIONS,
    ProviderCapability.GROUPS,
    ProviderCapability.BUSINESS_PROFILE,
    ProviderCapability.CATALOG,
    ProviderCapability.CAMPAIGNS,
    ProviderCapability.CALLS,
    ProviderCapability.LABELS,
    ProviderCapability.PAYMENTS,
  ];

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
      latitude: data.latitude,
      longitude: data.longitude,
      name: data.name,
      address: data.address,
    });

    return {
      messageId: (response as any).messageId || (response as any).id || `loc_${Date.now()}`,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  async sendContact(instanceId: string, data: SendContactInput): Promise<MessageResult> {
    const token = await this.getInstanceToken(instanceId);
    // Build vCard format for contact
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${data.contact.name}\nTEL;type=CELL;type=VOICE;waid=${data.contact.phone}:+${data.contact.phone}\nEND:VCARD`;
    const response = await uazService.sendContact(token, {
      number: data.to,
      contact: {
        displayName: data.contact.name,
        vcard: vcard,
      },
    });

    return {
      messageId: (response as any).messageId || (response as any).id || `contact_${Date.now()}`,
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
      footerText: data.footer,
    });

    return {
      messageId: (response as any).messageId || (response as any).id || `list_${Date.now()}`,
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
      footerText: data.footer,
    });

    return {
      messageId: (response as any).messageId || (response as any).id || `btn_${Date.now()}`,
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

  async editMessage(instanceId: string, data: EditMessageInput): Promise<MessageResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.editMessage(token, {
      id: data.messageId,
      text: data.text,
    });
    return {
      messageId: response.data?.messageId || response.data?.id || data.messageId,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  // ===== STATUS/STORIES =====
  async sendStatus(instanceId: string, data: SendStatusInput): Promise<MessageResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.sendStatus(token, {
      type: data.type,
      text: data.text,
      background_color: data.backgroundColor,
      font: data.font,
      file: data.file,
    });
    return {
      messageId: response.data?.messageId || response.data?.id || `status_${Date.now()}`,
      status: 'sent',
      timestamp: new Date(),
    };
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
    let event = this.mapEvent(eventType);

    // ⭐ IMPORTANTE: Verificar se é mensagem enviada pelo próprio telefone (fromMe=true)
    // UAZapi envia "messages" tanto para recebidas quanto enviadas
    // Precisamos verificar fromMe para determinar a direção correta
    const rawMessage = rawWebhook.message || rawWebhook.data?.message;
    const messageContent = rawMessage?.content || rawMessage;
    const isFromMe = messageContent?.key?.fromMe || rawMessage?.fromMe || rawWebhook.fromMe;

    if (isFromMe && event === 'message.received') {
      event = 'message.sent';
      console.log('[UAZapiAdapter] Message fromMe=true, changing event to message.sent');
    }

    // Instance ID will be resolved by token in the webhook handler
    // We pass the token here for lookup
    const instanceId = rawWebhook.instanceId || rawWebhook.instance_id || rawWebhook.token || '';

    // Extract chat info - UAZapi uses "chat" object
    const chat = rawWebhook.chat || {};
    const chatId = chat.wa_chatid || rawWebhook.chatId || rawWebhook.message?.chatid || '';

    // Extract contact/group name from chat object
    // UAZapi sends wa_name which contains the WhatsApp display name or group subject
    const contactName = chat.wa_name || chat.wa_contactName || chat.name || rawWebhook.chat?.wa_name || '';

    // Extract pushName (nome do contato no WhatsApp)
    const pushName = rawWebhook.pushName || rawWebhook.message?.pushName ||
                     rawWebhook.data?.pushName || rawWebhook.message?.content?.pushName || '';

    // Extract "from" - for incoming messages, it's the chat ID (phone@s.whatsapp.net or group@g.us)
    const from = chatId || rawWebhook.from || rawWebhook.data?.from || '';

    // rawMessage e messageContent já extraídos acima para verificar fromMe
    let message: NormalizedWebhook['data']['message'] = undefined;

    if (rawMessage && messageContent) {
      const messageId = messageContent.key?.ID || messageContent.key?.id ||
                        rawMessage.id || rawMessage.messageid || '';

      // UAZapi uses 'messageType' field (not 'type') per OpenAPI spec
      // Also check for specific message type keys like 'audioMessage', 'imageMessage', etc.
      const messageType = rawMessage.messageType || rawMessage.type ||
                          messageContent.messageType || messageContent.type ||
                          // Check for WhatsApp message type fields
                          (messageContent.audioMessage ? 'audio' :
                           messageContent.pttMessage ? 'ptt' :
                           messageContent.imageMessage ? 'image' :
                           messageContent.videoMessage ? 'video' :
                           messageContent.documentMessage ? 'document' :
                           messageContent.stickerMessage ? 'sticker' :
                           messageContent.locationMessage ? 'location' : 'text');

      const textContent = messageContent.text || messageContent.body ||
                          messageContent.caption || rawMessage.text || '';

      // Check for media URL in various possible locations
      // UAZapi uses 'fileURL' field (not 'mediaUrl') per OpenAPI spec
      const mediaUrl = messageContent.fileURL || rawMessage.fileURL ||
                       messageContent.mediaUrl || rawMessage.mediaUrl ||
                       messageContent.url || rawMessage.url ||
                       // Check for base64 data
                       messageContent.base64 || rawMessage.base64 ||
                       messageContent.base64Data || rawMessage.base64Data ||
                       // Or as file path
                       messageContent.filePath || rawMessage.filePath ||
                       // For specific message types, extract media URL
                       messageContent.audioMessage?.url ||
                       messageContent.imageMessage?.url ||
                       messageContent.videoMessage?.url ||
                       messageContent.documentMessage?.url ||
                       messageContent.stickerMessage?.url;

      // Determine if this is a media message even without URL
      // (audio/video/image/document types should have media object)
      const mappedType = this.mapMessageType(messageType);
      const isMediaType = ['audio', 'voice', 'video', 'image', 'document', 'sticker'].includes(mappedType);

      // Create media object for media types
      let mediaObj = undefined;
      if (mediaUrl || isMediaType) {
        mediaObj = {
          id: messageId,
          type: mappedType,
          mediaUrl: mediaUrl || '',  // May be empty if needs to be downloaded
          caption: messageContent.caption || '',
          fileName: messageContent.filename || messageContent.fileName || '',
          mimeType: messageContent.mimetype || messageContent.mimeType ||
                    (mappedType === 'audio' || mappedType === 'voice' ? 'audio/ogg' : ''),
          size: messageContent.fileSize || messageContent.size,
          duration: messageContent.seconds || messageContent.duration || messageContent.pttSeconds,
          // Flag to indicate if media needs to be downloaded via API
          needsDownload: !mediaUrl && isMediaType,
        };
      }

      message = {
        id: messageId,
        type: mappedType,
        content: textContent,
        media: mediaObj,
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
        // Para mensagens enviadas (fromMe=true), o "to" é o chatId (destinatário)
        // Para mensagens recebidas, o "to" geralmente não existe
        to: rawWebhook.to || rawWebhook.data?.to ||
            (messageContent?.key?.fromMe || rawMessage?.fromMe ? chatId : undefined),
        contactName,  // Nome do contato ou grupo
        pushName,     // Nome do contato no WhatsApp
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
      // Usar /chat/details que retorna image e imagePreview (mais confiável)
      // /profile/image/:number retorna 404 em alguns casos
      const response = await this.client.getChatDetails(instanceId, token, number);
      // Response pode ter image/imagePreview no nível raiz ou dentro de data
      const data = response.data || response as any;
      const url = data?.image || data?.imagePreview || null;
      if (!url) {
        console.log(`[UAZapiAdapter] No profile picture in /chat/details for ${number}`);
      } else {
        console.log(`[UAZapiAdapter] Profile picture found for ${number}: ${url.substring(0, 60)}...`);
      }
      return url;
    } catch (error: any) {
      console.error(`[UAZapiAdapter] Failed to get profile picture for ${number}:`, error.message || error);
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
    // Normalizar para lowercase para comparação (UZAPI pode enviar AudioMessage, audioMessage, etc.)
    const normalizedType = (uazType || '').toLowerCase();

    const mapping: Record<string, string> = {
      // Text messages
      'conversation': 'text',
      'extendedtextmessage': 'text',
      'text': 'text',
      // Image messages
      'imagemessage': 'image',
      'image': 'image',
      // Video messages
      'videomessage': 'video',
      'video': 'video',
      // Audio messages (various formats UAZapi might send)
      'audiomessage': 'audio',
      'audio': 'audio',
      'myaudio': 'voice',       // Alternative voice message format (per OpenAPI spec)
      'ptt': 'voice',           // Push-to-talk voice messages
      'pttmessage': 'voice',
      'voice': 'voice',
      'voicemessage': 'voice',
      // Document messages
      'documentmessage': 'document',
      'document': 'document',
      // Location messages
      'locationmessage': 'location',
      'location': 'location',
      // Contact messages
      'contactmessage': 'contact',
      'contact': 'contact',
      // Sticker messages
      'stickermessage': 'sticker',
      'sticker': 'sticker',
    };
    // Return mapped type, or keep original if it's a valid media type
    const result = mapping[normalizedType];
    if (result) return result;

    // If not in mapping, check if it's already a valid type
    const validTypes = ['text', 'image', 'video', 'audio', 'voice', 'document', 'location', 'contact', 'sticker'];
    if (validTypes.includes(uazType?.toLowerCase())) {
      return uazType.toLowerCase();
    }

    console.warn(`[UAZapi] Unknown message type: ${uazType}, defaulting to text`);
    return 'text';
  }

  // ===== INTERACTIVE (IInteractiveCapability) =====
  async sendCarousel(instanceId: string, data: SendCarouselInput): Promise<MessageResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.sendCarousel(instanceId, token, {
      number: data.to,
      text: data.text,
      carousel: data.carousel.map(card => ({
        text: card.title + (card.description ? '\n' + card.description : ''),
        image: card.imageUrl,
        buttons: card.buttons.map(b => ({ id: b.id, text: b.text, type: 'REPLY' as const })),
      })),
    });
    return { messageId: response.data?.messageId || `carousel_${Date.now()}`, status: 'sent', timestamp: new Date() };
  }

  async sendMenu(instanceId: string, data: SendMenuInput): Promise<MessageResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.sendMenu(instanceId, token, {
      number: data.to,
      type: data.type === 'button' ? 'button' : data.type === 'poll' ? 'poll' : 'list',
      text: data.text,
      choices: data.choices.map(c => c.text),
      footerText: data.footer,
    });
    return { messageId: response.data?.messageId || `menu_${Date.now()}`, status: 'sent', timestamp: new Date() };
  }

  async sendLocationButton(instanceId: string, data: SendLocationButtonInput): Promise<MessageResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.sendLocationButton(token, { number: data.to, text: data.text, footer: data.footer });
    return { messageId: response.data?.messageId || `locbtn_${Date.now()}`, status: 'sent', timestamp: new Date() };
  }

  // ===== CONTACTS (IContactCapability) =====
  async checkNumber(instanceId: string, input: CheckNumberInput): Promise<CheckNumberResult[]> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.checkNumber(token, { numbers: input.numbers });
    return (response.data || []).map((r: any) => ({
      number: r.number || r.jid?.split('@')[0] || '',
      exists: r.exists ?? r.status === 'valid',
      jid: r.jid,
    }));
  }

  async getChatDetails(instanceId: string, chatId: string): Promise<ChatDetails> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.getChatDetails(instanceId, token, chatId);
    const data = response.data || response as any;
    return {
      id: data.id || chatId,
      name: data.name || data.pushname || data.wa_name,
      image: data.image,
      imagePreview: data.imagePreview,
      phone: data.phone || chatId.split('@')[0],
      isBusiness: data.isBusiness,
      description: data.description,
    };
  }

  async addContact(instanceId: string, input: AddContactInput): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.addContact(token, { phone: input.phone, name: input.name });
  }

  async removeContact(instanceId: string, phone: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.removeContact(token, { phone });
  }

  async listContactsPaginated(instanceId: string, input: ContactListInput): Promise<Contact[]> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.listContactsPaginated(token, { page: input.page, pageSize: input.pageSize });
    return (response.data || []).map((c: any) => ({
      id: c.id,
      name: c.name || c.pushname,
      phone: c.id?.split('@')[0] || c.phone,
      profilePicUrl: c.profilePicUrl,
      isBusiness: c.isBusiness,
    }));
  }

  // ===== CHAT ACTIONS (IChatActionsCapability) =====
  async findChats(instanceId: string, input: FindChatsInput): Promise<Chat[]> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.findChats(token, {
      ...(input.filter as any),
      sort: input.sort,
      limit: input.limit,
      offset: input.offset,
    });
    return (response.data || []).map((c: any) => ({
      id: c.id || c.wa_chatid,
      name: c.name || c.wa_name || '',
      isGroup: c.wa_isGroup || false,
      unreadCount: c.wa_unreadCount || 0,
      lastMessage: c.wa_lastMessage ? { content: c.wa_lastMessage.body || '', timestamp: new Date(c.wa_lastMessage.timestamp * 1000) } : undefined,
    }));
  }

  async findMessages(instanceId: string, input: FindMessagesInput): Promise<any[]> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.findMessages(token, {
      chatid: input.chatId,
      ...(input.filter as any),
      limit: input.limit,
      offset: input.offset,
    });
    return response.data?.messages || response.data || [];
  }

  async pinChat(instanceId: string, input: PinChatInput): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.pinChat(token, { number: input.chatId, pin: input.pin });
  }

  async muteChat(instanceId: string, input: MuteChatInput): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.muteChat(token, { number: input.chatId, muteEndTime: input.muteEndTime });
  }

  async archiveChat(instanceId: string, input: ArchiveChatInput): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.archiveChat(token, { number: input.chatId, archive: input.archive });
  }

  async markChatRead(instanceId: string, chatId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.markChatRead(token, { number: chatId, read: true });
  }

  async deleteChat(instanceId: string, chatId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.deleteChat(token, { number: chatId, deleteChatDB: true, deleteMessagesDB: true });
  }

  async blockContact(instanceId: string, input: BlockContactInput): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.blockContact(token, { number: input.chatId, block: true });
  }

  async unblockContact(instanceId: string, chatId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.blockContact(token, { number: chatId, block: false });
  }

  async getBlockList(instanceId: string): Promise<string[]> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.getBlockList(token);
    return response.data || [];
  }

  // ===== LABELS (ILabelCapability) =====
  async getLabels(instanceId: string): Promise<Label[]> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.getLabels(token);
    return (response.data || []).map((l: any) => ({
      id: l.id || l.labelId,
      name: l.name,
      color: l.color || 0,
      count: l.count,
    }));
  }

  async setChatLabels(instanceId: string, input: SetChatLabelsInput): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.setChatLabels(token, { number: input.chatId, labelids: input.labelIds });
  }

  async editLabel(instanceId: string, input: EditLabelInput): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.editLabel(token, { labelid: input.labelId, name: input.name, color: input.color });
  }

  async deleteLabel(instanceId: string, labelId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.editLabel(token, { labelid: labelId, delete: true });
  }

  // ===== BUSINESS (IBusinessCapability) =====
  async getBusinessProfile(instanceId: string): Promise<BusinessProfile> {
    const token = await this.getInstanceToken(instanceId);
    // Use the instance's own JID
    const status = await this.client.getInstanceStatus(token);
    const jid = (status.data as any)?.jid || (status.data as any)?.wid || '';
    const response = await this.client.getBusinessProfile(token, jid);
    const data = response.data || {};
    return {
      description: data.description,
      address: data.address,
      email: data.email,
      website: data.website ? [data.website] : undefined,
      profilePictureUrl: data.profilePictureUrl,
      about: data.about,
    };
  }

  async updateBusinessProfile(instanceId: string, input: UpdateBusinessProfileInput): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.updateBusinessProfile(token, {
      description: input.description,
      address: input.address,
      email: input.email,
      website: input.websites?.[0],
      profilePictureUrl: input.profilePictureUrl,
    });
  }

  async getBusinessCategories(instanceId: string): Promise<string[]> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.getBusinessCategories(token);
    return response.data || [];
  }

  // ===== CATALOG (ICatalogCapability) =====
  async listProducts(instanceId: string): Promise<CatalogProduct[]> {
    const token = await this.getInstanceToken(instanceId);
    const status = await this.client.getInstanceStatus(token);
    const jid = (status.data as any)?.jid || '';
    const response = await this.client.listCatalogProducts(token, jid);
    return (response.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: p.currency,
      imageUrl: p.imageUrl || p.image,
      url: p.url,
      retailerId: p.retailerId,
    }));
  }

  async getProductInfo(instanceId: string, productId: string): Promise<CatalogProduct> {
    const token = await this.getInstanceToken(instanceId);
    const status = await this.client.getInstanceStatus(token);
    const jid = (status.data as any)?.jid || '';
    const response = await this.client.getCatalogProductInfo(token, jid, productId);
    const p = response.data || {};
    return { id: p.id || productId, name: p.name, description: p.description, price: p.price, currency: p.currency, imageUrl: p.imageUrl, retailerId: p.retailerId };
  }

  async showProduct(instanceId: string, productId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.showCatalogProduct(token, productId);
  }

  async hideProduct(instanceId: string, productId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.hideCatalogProduct(token, productId);
  }

  async deleteProduct(instanceId: string, productId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.deleteCatalogProduct(token, productId);
  }

  // ===== CAMPAIGNS (ICampaignCapability) =====
  async sendBulkSimple(instanceId: string, input: BulkSimpleInput): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.sendBulkSimple(token, {
      numbers: input.numbers,
      type: input.type,
      folder: input.folder,
      delayMin: input.delayMin,
      delayMax: input.delayMax,
      text: input.text,
      file: input.mediaUrl,
    });
  }

  async sendBulkAdvanced(instanceId: string, input: BulkAdvancedInput): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.sendBulkAdvanced(token, {
      delayMin: input.delayMin,
      delayMax: input.delayMax,
      folder: input.folder,
      messages: input.messages.map(m => ({
        number: m.number,
        type: m.type,
        text: m.text,
        file: m.mediaUrl,
        docName: m.fileName,
      })),
    });
  }

  async listCampaignFolders(instanceId: string): Promise<CampaignFolder[]> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.listCampaignFolders(token);
    return (response.data || []).map((f: any) => ({
      name: f.name || f.folder,
      info: f.info,
      status: f.status || 'active',
      totalMessages: f.totalMessages || f.total || 0,
      sentMessages: f.sentMessages || f.sent || 0,
      failedMessages: f.failedMessages || f.failed || 0,
    }));
  }

  async listCampaignMessages(instanceId: string, folder: string): Promise<CampaignMessage[]> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.listCampaignMessages(token, { folder_id: folder });
    return (response.data || []).map((m: any) => ({
      number: m.number,
      status: (m.status || 'queued').toLowerCase(),
      type: m.type || 'text',
      text: m.text,
      error: m.error,
    }));
  }

  async editCampaignFolder(instanceId: string, folder: string, action: 'stop' | 'continue' | 'delete'): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.editCampaignFolder(token, { folder_id: folder, action });
  }

  async clearCompletedCampaigns(instanceId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.clearCompletedCampaigns(token);
  }

  async clearAllCampaigns(instanceId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.clearAllCampaigns(token);
  }

  // ===== CALLS (ICallCapability) =====
  async makeCall(instanceId: string, input: MakeCallInput): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.makeCall(token, { number: input.to, isVideo: input.isVideo });
  }

  async rejectCall(instanceId: string, callId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.rejectCall(token, { id: callId });
  }

  // ===== GROUPS (IGroupCapability) =====
  async createGroup(instanceId: string, input: CreateGroupInput): Promise<GroupInfo> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.createGroup(token, { name: input.name, participants: input.participants, description: input.description });
    const data = response.data || {};
    return {
      id: data.id || data.gid || '',
      name: input.name,
      description: input.description,
      participants: (input.participants || []).map(p => ({ id: p, admin: false })),
      size: input.participants?.length || 0,
      creation: Date.now(),
    };
  }

  async listGroups(instanceId: string): Promise<GroupInfo[]> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.listGroups(token);
    return (response.data || []).map((g: any) => ({
      id: g.id || g.jid,
      name: g.name || g.subject || '',
      description: g.description || g.desc || '',
      participants: (g.participants || []).map((p: any) => ({ id: p.id || p, admin: p.admin || p.isAdmin || false })),
      size: g.size || g.participants?.length || 0,
      creation: g.creation || 0,
      owner: g.owner,
    }));
  }

  async getGroupInfo(instanceId: string, groupId: string): Promise<GroupInfo> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.getGroupInfo(token, { GroupJID: groupId, getInviteLink: true });
    const g = response.data || {};
    return {
      id: g.id || groupId,
      name: g.name || g.subject || '',
      description: g.description || g.desc,
      participants: (g.participants || []).map((p: any) => ({ id: p.id || p, admin: p.admin || p.isAdmin || false })),
      size: g.size || g.participants?.length || 0,
      creation: g.creation || 0,
      owner: g.owner,
      inviteCode: g.inviteCode || g.invite,
    };
  }

  async updateGroupName(instanceId: string, groupId: string, name: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.updateGroupName(token, { GroupJID: groupId, name });
  }

  async updateGroupDescription(instanceId: string, groupId: string, description: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.updateGroupDescription(token, { GroupJID: groupId, description });
  }

  async updateGroupImage(instanceId: string, groupId: string, imageUrl: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.updateGroupImage(token, { GroupJID: groupId, image: imageUrl });
  }

  async updateGroupParticipants(instanceId: string, input: UpdateGroupParticipantsInput): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.updateGroupParticipants(token, { GroupJID: input.groupId, participants: input.participants, action: input.action });
  }

  async getGroupInviteLink(instanceId: string, groupId: string): Promise<string> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.getGroupInviteLink(token, { GroupJID: groupId });
    return response.data?.inviteLink || response.data?.link || response.data || '';
  }

  async joinGroup(instanceId: string, inviteCode: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.joinGroup(token, { inviteCode });
  }

  async leaveGroup(instanceId: string, groupId: string): Promise<void> {
    const token = await this.getInstanceToken(instanceId);
    await this.client.leaveGroup(token, { GroupJID: groupId });
  }

  // ===== PAYMENTS (IPaymentCapability) =====
  async sendPixButton(instanceId: string, input: SendPixButtonInput): Promise<MessageResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.sendPixButton(token, {
      number: input.to,
      pixType: input.pixType,
      pixKey: input.pixKey,
      pixName: input.pixName,
      text: input.text,
    });
    return { messageId: response.data?.messageId || `pix_${Date.now()}`, status: 'sent', timestamp: new Date() };
  }

  async sendPaymentRequest(instanceId: string, input: SendPaymentRequestInput): Promise<MessageResult> {
    const token = await this.getInstanceToken(instanceId);
    const response = await this.client.sendPaymentRequest(token, {
      number: input.to,
      title: input.title,
      text: input.text,
      itemName: input.itemName,
      invoiceNumber: input.invoiceNumber,
      amount: input.amount,
      pixKey: input.pixKey,
      pixType: input.pixType,
      pixName: input.pixName,
    });
    return { messageId: response.data?.messageId || `payment_${Date.now()}`, status: 'sent', timestamp: new Date() };
  }
}
