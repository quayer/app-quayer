/**
 * IWhatsAppProvider - Interface Base
 *
 * TODOS os providers (UAZapi, Evolution, Baileys, etc) devem implementar esta interface
 */

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
  MessageFilters,
} from './provider.types';

export interface IWhatsAppProvider {
  // ===== IDENTIFICAÇÃO =====
  readonly name: string;
  readonly version: string;

  // ===== GERENCIAMENTO DE INSTÂNCIA =====
  createInstance(data: CreateInstanceInput): Promise<InstanceResult>;
  deleteInstance(instanceId: string): Promise<void>;
  getInstanceStatus(instanceId: string): Promise<InstanceStatus>;

  // ===== QR CODE E CONEXÃO =====
  generateQRCode(instanceId: string): Promise<QRCodeResult>;
  getPairingCode(instanceId: string): Promise<PairingCodeResult>;
  disconnect(instanceId: string): Promise<void>;
  restart(instanceId: string): Promise<void>;

  // ===== MENSAGENS =====
  sendText(instanceId: string, data: SendTextInput): Promise<MessageResult>;
  sendMedia(instanceId: string, data: SendMediaInput): Promise<MessageResult>;
  sendImage(instanceId: string, data: SendImageInput): Promise<MessageResult>;
  sendVideo(instanceId: string, data: SendVideoInput): Promise<MessageResult>;
  sendAudio(instanceId: string, data: SendAudioInput): Promise<MessageResult>;
  sendDocument(instanceId: string, data: SendDocumentInput): Promise<MessageResult>;
  sendLocation(instanceId: string, data: SendLocationInput): Promise<MessageResult>;
  sendContact(instanceId: string, data: SendContactInput): Promise<MessageResult>;

  // ===== CHATS E CONTATOS =====
  getChats(instanceId: string, filters?: ChatFilters): Promise<Chat[]>;
  getContacts(instanceId: string): Promise<Contact[]>;

  // ===== WEBHOOKS =====
  configureWebhook(instanceId: string, config: WebhookConfig): Promise<void>;
  normalizeWebhook(rawWebhook: any): NormalizedWebhook;

  // ===== PROFILE =====
  getProfilePicture(instanceId: string, number: string): Promise<string | null>;
  updateProfilePicture(instanceId: string, imageUrl: string): Promise<void>;

  // ===== HEALTH =====
  healthCheck(): Promise<boolean>;
}
