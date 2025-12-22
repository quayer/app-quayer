/**
 * Provider Types - Normalized Data Structures
 *
 * Tipos normalizados que TODOS os providers devem retornar
 */

// ===== BOT SIGNATURE (Anti-Loop) =====
/**
 * Marcador invisível Unicode para detectar mensagens enviadas pelo bot
 * Evita loops infinitos quando o bot recebe suas próprias mensagens via webhook
 *
 * Caracteres: Zero-Width Space + Zero-Width Non-Joiner + Zero-Width Joiner
 * Invisível para usuários, mas detectável pelo sistema
 */
export const BOT_SIGNATURE = '\u200B\u200C\u200D';

/**
 * Verifica se uma mensagem foi enviada pelo bot (contém BOT_SIGNATURE)
 */
export function isBotEcho(content: string | null | undefined): boolean {
  if (!content) return false;
  return content.startsWith(BOT_SIGNATURE);
}

/**
 * Remove BOT_SIGNATURE do conteúdo (para exibição limpa)
 */
export function stripBotSignature(content: string): string {
  if (content.startsWith(BOT_SIGNATURE)) {
    return content.slice(BOT_SIGNATURE.length);
  }
  return content;
}

/**
 * Adiciona BOT_SIGNATURE ao conteúdo (antes de enviar)
 */
export function addBotSignature(content: string): string {
  return BOT_SIGNATURE + content;
}

// ===== BROKER TYPE =====
export type BrokerType = 'uazapi' | 'evolution' | 'baileys' | 'cloudapi';

// ===== CLOUD API CONFIG =====
/**
 * Configuration for WhatsApp Cloud API (Official Meta API)
 * Used when provider is 'WHATSAPP_CLOUD_API'
 */
export interface CloudAPIConfig {
  /** System User Access Token from Meta Business */
  accessToken: string;
  /** Phone Number ID from WhatsApp Business Manager */
  phoneNumberId: string;
  /** WhatsApp Business Account ID */
  wabaId: string;
  /** Display phone number (e.g., +55 11 99999-0000) */
  displayPhoneNumber?: string;
  /** Verified business name */
  verifiedName?: string;
}

/**
 * Input for creating a Cloud API instance (no QR Code needed)
 */
export interface CreateCloudAPIInstanceInput {
  name: string;
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  phoneNumber?: string;
  webhookUrl?: string;
}

// ===== INSTANCE =====
export interface CreateInstanceInput {
  name: string;
  phoneNumber?: string;
  webhookUrl?: string;
  webhookEvents?: string[];
}

export interface InstanceResult {
  instanceId: string;
  token: string;
  status: InstanceStatus;
  qrCode?: string;
  pairingCode?: string;
}

export type InstanceStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr'
  | 'pairing'
  | 'connected'
  | 'error';

export interface QRCodeResult {
  qrCode: string;
  pairingCode?: string;
  expiresAt?: Date;
}

export interface PairingCodeResult {
  pairingCode: string;
  expiresAt?: Date;
}

// ===== MESSAGES =====
export interface SendTextInput {
  to: string;              // Formato: 5511999887766
  text: string;
  quotedMessageId?: string;
  delay?: number;          // Delay em segundos
}

export interface SendMediaInput {
  to: string;
  mediaType: 'image' | 'video' | 'audio' | 'voice' | 'document';
  mediaUrl?: string;       // URL ou base64
  caption?: string;
  fileName?: string;
  mimeType?: string;
}

export interface SendImageInput {
  to: string;
  imageUrl: string;
  caption?: string;
  quotedMessageId?: string;
}

export interface SendVideoInput {
  to: string;
  videoUrl: string;
  caption?: string;
  quotedMessageId?: string;
}

export interface SendAudioInput {
  to: string;
  audioUrl: string;
  quotedMessageId?: string;
}

export interface SendDocumentInput {
  to: string;
  documentUrl: string;
  fileName: string;
  caption?: string;
  quotedMessageId?: string;
}

export interface SendLocationInput {
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface SendContactInput {
  to: string;
  contact: {
    name: string;
    phone: string;
  };
}

export interface MessageResult {
  messageId: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
}

// ===== MEDIA MESSAGE =====
export interface MediaMessage {
  id: string;
  type: 'image' | 'video' | 'audio' | 'voice' | 'document';
  mediaUrl: string;         // URL para download
  caption?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;            // Bytes
  duration?: number;        // Segundos (áudio/vídeo)

  // Transcrição (será preenchido pelo sistema)
  transcription?: {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    text?: string;
    language?: string;
    confidence?: number;
    processedAt?: Date;
  };
}

// ===== WEBHOOKS =====
export interface NormalizedWebhook {
  event: WebhookEvent;
  instanceId: string;
  timestamp: Date;
  data: WebhookData;
  rawPayload?: any;         // Debug
}

export type WebhookEvent =
  | 'message.received'
  | 'message.sent'
  | 'message.updated'
  | 'instance.connected'
  | 'instance.disconnected'
  | 'instance.qr'
  | 'chat.created'
  | 'contact.updated';

export interface WebhookData {
  chatId?: string;
  from?: string;
  to?: string;
  message?: {
    id: string;
    type: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'document' | 'location' | 'contact';
    content: string;
    media?: MediaMessage;
    timestamp: Date;
    // Location data (quando type = 'location')
    latitude?: number;
    longitude?: number;
    locationName?: string;
    locationAddress?: string;
  };
  status?: InstanceStatus;
  qrCode?: string;
}

// ===== WEBHOOK CONFIG =====
export interface WebhookConfig {
  url: string;
  events: string[];
  enabled?: boolean;
}

// ===== CHATS & CONTACTS =====
export interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage?: {
    content: string;
    timestamp: Date;
  };
}

export interface Contact {
  id: string;
  name?: string;
  phone: string;
  profilePicUrl?: string;
  isBusiness?: boolean;
}

export interface ChatFilters {
  unreadOnly?: boolean;
  limit?: number;
}

export interface MessageFilters {
  limit?: number;
  beforeTimestamp?: Date;
}

// ===== MENSAGENS INTERATIVAS =====
export interface SendInteractiveListInput {
  to: string;
  title: string;
  description: string;
  buttonText: string;
  sections: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
  footer?: string;
}

export interface SendInteractiveButtonsInput {
  to: string;
  text: string;
  buttons: Array<{
    id: string;
    text: string;
  }>;
  footer?: string;
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    text?: string;
    mediaUrl?: string;
  };
}

// ===== PRESENÇA =====
export type PresenceType = 'composing' | 'recording' | 'paused' | 'available' | 'unavailable';

// ===== MÍDIA =====
export interface MediaDownloadResult {
  data: string; // Base64
  mimeType: string;
  fileName?: string;
  size?: number;
}
