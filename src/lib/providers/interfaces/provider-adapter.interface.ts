/**
 * Interface IProviderAdapter
 *
 * Define o contrato que todos os adapters de providers devem seguir.
 * Garante que todos os providers exponham as mesmas operações,
 * independente de suas implementações internas.
 */

import {
  NormalizedMessage,
  NormalizedContact,
  NormalizedInstance,
  NormalizedWebhookPayload,
  SendMessageRequest,
  ProviderResponse,
  ProviderType,
} from '../types/normalized.types';

export interface IProviderAdapter {
  /**
   * Identificador único do provider
   */
  readonly providerType: ProviderType;

  /**
   * Nome amigável do provider
   */
  readonly providerName: string;

  // ==========================================
  // INSTANCE MANAGEMENT
  // ==========================================

  /**
   * Criar nova instância/sessão do WhatsApp
   */
  createInstance(params: {
    instanceId: string;
    name: string;
    webhookUrl?: string;
  }): Promise<ProviderResponse<NormalizedInstance>>;

  /**
   * Conectar instância (gerar QR Code)
   */
  connectInstance(params: {
    token: string;
    instanceId: string;
  }): Promise<ProviderResponse<{ qrCode?: string }>>;

  /**
   * Desconectar instância
   */
  disconnectInstance(params: {
    token: string;
    instanceId: string;
  }): Promise<ProviderResponse<void>>;

  /**
   * Obter status da instância
   */
  getInstanceStatus(params: {
    token: string;
  }): Promise<ProviderResponse<NormalizedInstance>>;

  /**
   * Deletar instância
   */
  deleteInstance(params: {
    token: string;
    instanceId: string;
  }): Promise<ProviderResponse<void>>;

  // ==========================================
  // MESSAGE OPERATIONS
  // ==========================================

  /**
   * Enviar mensagem de texto
   */
  sendTextMessage(params: {
    token: string;
    to: string;
    text: string;
    quotedMessageId?: string;
  }): Promise<ProviderResponse<NormalizedMessage>>;

  /**
   * Enviar mídia (imagem, vídeo, documento, áudio)
   */
  sendMediaMessage(params: {
    token: string;
    to: string;
    mediaUrl: string;
    caption?: string;
    fileName?: string;
  }): Promise<ProviderResponse<NormalizedMessage>>;

  /**
   * Enviar mensagem com botões
   */
  sendButtonsMessage(params: {
    token: string;
    to: string;
    text: string;
    buttons: Array<{ id: string; text: string }>;
  }): Promise<ProviderResponse<NormalizedMessage>>;

  /**
   * Enviar mensagem com lista
   */
  sendListMessage(params: {
    token: string;
    to: string;
    text: string;
    buttonText: string;
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  }): Promise<ProviderResponse<NormalizedMessage>>;

  /**
   * Enviar localização
   */
  sendLocationMessage(params: {
    token: string;
    to: string;
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  }): Promise<ProviderResponse<NormalizedMessage>>;

  /**
   * Enviar contato
   */
  sendContactMessage(params: {
    token: string;
    to: string;
    contacts: Array<{ name: string; phone: string }>;
  }): Promise<ProviderResponse<NormalizedMessage>>;

  // ==========================================
  // CHAT OPERATIONS
  // ==========================================

  /**
   * Buscar mensagens de um chat
   */
  getMessages(params: {
    token: string;
    chatId: string;
    limit?: number;
  }): Promise<ProviderResponse<NormalizedMessage[]>>;

  /**
   * Marcar mensagem como lida
   */
  markAsRead(params: {
    token: string;
    messageId: string;
  }): Promise<ProviderResponse<void>>;

  /**
   * Deletar mensagem
   */
  deleteMessage(params: {
    token: string;
    messageId: string;
  }): Promise<ProviderResponse<void>>;

  /**
   * Enviar presença (digitando, gravando áudio)
   */
  sendPresence(params: {
    token: string;
    to: string;
    presence: 'composing' | 'recording' | 'paused';
  }): Promise<ProviderResponse<void>>;

  // ==========================================
  // CONTACT OPERATIONS
  // ==========================================

  /**
   * Obter informações de contato
   */
  getContact(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<NormalizedContact>>;

  /**
   * Verificar se número está no WhatsApp
   */
  checkNumber(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<{ exists: boolean; jid?: string }>>;

  /**
   * Obter foto de perfil
   */
  getProfilePicture(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<{ url: string }>>;

  /**
   * Bloquear contato
   */
  blockContact(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<void>>;

  /**
   * Desbloquear contato
   */
  unblockContact(params: {
    token: string;
    phoneNumber: string;
  }): Promise<ProviderResponse<void>>;

  // ==========================================
  // GROUP OPERATIONS
  // ==========================================

  /**
   * Criar grupo
   */
  createGroup(params: {
    token: string;
    name: string;
    participants: string[];
  }): Promise<ProviderResponse<{ groupId: string }>>;

  /**
   * Adicionar participantes ao grupo
   */
  addGroupParticipants(params: {
    token: string;
    groupId: string;
    participants: string[];
  }): Promise<ProviderResponse<void>>;

  /**
   * Remover participantes do grupo
   */
  removeGroupParticipants(params: {
    token: string;
    groupId: string;
    participants: string[];
  }): Promise<ProviderResponse<void>>;

  /**
   * Sair do grupo
   */
  leaveGroup(params: {
    token: string;
    groupId: string;
  }): Promise<ProviderResponse<void>>;

  /**
   * Obter link de convite do grupo
   */
  getGroupInviteLink(params: {
    token: string;
    groupId: string;
  }): Promise<ProviderResponse<{ inviteLink: string }>>;

  // ==========================================
  // WEBHOOK NORMALIZATION
  // ==========================================

  /**
   * Normalizar payload de webhook do provider para formato padronizado
   */
  normalizeWebhook(rawPayload: any): Promise<NormalizedWebhookPayload>;

  // ==========================================
  // HEALTH CHECK
  // ==========================================

  /**
   * Verificar se o provider está saudável e acessível
   */
  healthCheck(): Promise<ProviderResponse<{ healthy: boolean; latency: number }>>;
}
