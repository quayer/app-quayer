/**
 * Provider Types - Normalized Data Structures
 *
 * Tipos normalizados que TODOS os providers devem retornar
 */

// ===== BROKER TYPE =====
export type BrokerType = 'uazapi' | 'evolution' | 'baileys';

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
