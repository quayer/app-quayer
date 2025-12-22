/**
 * Tipos Normalizados da Plataforma
 *
 * Estes tipos são independentes de qualquer provider específico.
 * Todos os adapters devem converter seus formatos para estes tipos.
 */

// ============================================
// ENUMS
// ============================================

export enum ProviderType {
  UAZAPI = 'UAZAPI',
  EVOLUTION = 'EVOLUTION',
  BAILEYS = 'BAILEYS',
  OFFICIAL = 'OFFICIAL', // API Oficial do WhatsApp Business
  WPPCONNECT = 'WPPCONNECT',
}

export enum InstanceStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  QR_CODE = 'QR_CODE',
  ERROR = 'ERROR',
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
  STICKER = 'STICKER',
  LOCATION = 'LOCATION',
  CONTACT = 'CONTACT',
  BUTTONS = 'BUTTONS',
  LIST = 'LIST',
  TEMPLATE = 'TEMPLATE',
  UNKNOWN = 'UNKNOWN',
}

export enum MessageStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

export enum WebhookEvent {
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  MESSAGE_SENT = 'MESSAGE_SENT',
  MESSAGE_STATUS_UPDATE = 'MESSAGE_STATUS_UPDATE',
  CONNECTION_UPDATE = 'CONNECTION_UPDATE',
  QR_CODE = 'QR_CODE',
  PRESENCE_UPDATE = 'PRESENCE_UPDATE',
  CALL_RECEIVED = 'CALL_RECEIVED',
  GROUP_UPDATE = 'GROUP_UPDATE',
  CONTACT_UPDATE = 'CONTACT_UPDATE',
  CHAT_UPDATE = 'CHAT_UPDATE',
  UNKNOWN = 'UNKNOWN',
}

// ============================================
// NORMALIZED MESSAGE
// ============================================

export interface NormalizedMessage {
  id: string;
  instanceId: string;

  // Sender/Receiver
  from: string; // Format: 5511999999999
  to?: string;
  isGroup: boolean;
  groupId?: string;

  // Message content
  type: MessageType;
  content: {
    text?: string;
    caption?: string;
    mediaUrl?: string;
    mimeType?: string;
    fileName?: string;
    latitude?: number;
    longitude?: number;
    contacts?: Array<{ name: string; phone: string }>;
    buttons?: Array<{ id: string; text: string }>;
    listItems?: Array<{ id: string; title: string; description?: string }>;
  };

  // Metadata
  timestamp: Date;
  isFromMe: boolean;
  status: MessageStatus;

  // Context
  quotedMessage?: {
    id: string;
    from: string;
    content: string;
  };

  // Transcription (for audio messages)
  transcription?: string;

  // Original payload from provider (for debugging)
  raw?: any;
}

// ============================================
// NORMALIZED CONTACT
// ============================================

export interface NormalizedContact {
  phoneNumber: string; // Format: 5511999999999
  name?: string;
  profilePicture?: string;
  isBlocked: boolean;
  isBusiness: boolean;
  status?: string;
}

// ============================================
// NORMALIZED INSTANCE
// ============================================

export interface NormalizedInstance {
  id: string;
  name: string;
  status: InstanceStatus;
  phoneNumber?: string;
  profileName?: string;
  profilePicture?: string;
  qrCode?: string;
  provider: ProviderType;
  createdAt: Date;
  connectedAt?: Date;
}

// ============================================
// NORMALIZED WEBHOOK PAYLOAD
// ============================================

export interface NormalizedWebhookPayload {
  event: WebhookEvent;
  instanceId: string;
  timestamp: Date;

  // Event-specific data
  message?: NormalizedMessage;
  instanceUpdate?: {
    status: InstanceStatus;
    qrCode?: string;
  };
  presenceUpdate?: {
    phoneNumber: string;
    presence: 'available' | 'unavailable' | 'composing' | 'recording';
  };
  callUpdate?: {
    callId: string;
    from: string;
    timestamp: Date;
    status: 'ringing' | 'accepted' | 'rejected';
  };
  groupUpdate?: {
    groupId: string;
    action: 'create' | 'update' | 'delete' | 'participant_add' | 'participant_remove';
    participants?: string[];
  };

  // Original payload (for debugging)
  raw?: any;
}

// ============================================
// SEND MESSAGE REQUEST
// ============================================

export interface SendMessageRequest {
  instanceId: string;
  to: string; // Phone number or group ID
  type: MessageType;
  content: {
    text?: string;
    caption?: string;
    mediaUrl?: string;
    fileName?: string;
    latitude?: number;
    longitude?: number;
    contacts?: Array<{ name: string; phone: string }>;
    buttons?: Array<{ id: string; text: string }>;
    listItems?: Array<{
      id: string;
      title: string;
      description?: string;
      section?: string;
    }>;
  };
  quotedMessageId?: string;
}

// ============================================
// PROVIDER RESPONSE
// ============================================

export interface ProviderResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  provider: ProviderType;
  timestamp: Date;
}
