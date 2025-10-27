/**
 * UAZ API Service
 *
 * Orquestra todas as chamadas para a API UAZ (broker WhatsApp)
 * Documentação: https://docs.uazapi.com
 */

const UAZ_BASE_URL = process.env.UAZ_API_URL || 'https://free.uazapi.com';

export interface SendTextDto {
  number: string; // Ex: "5511999999999@s.whatsapp.net"
  text: string;
}

export interface SendMediaDto {
  number: string;
  mediatype: 'image' | 'video' | 'audio' | 'document';
  mimetype: string;
  caption?: string;
  media: string; // Base64 ou URL
  fileName?: string;
}

export interface SendContactDto {
  number: string;
  contact: {
    displayName: string;
    vcard: string;
  };
}

export interface SendLocationDto {
  number: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface SendListDto {
  number: string;
  title: string;
  description?: string;
  buttonText: string;
  footerText?: string;
  sections: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
}

export interface SendButtonsDto {
  number: string;
  text: string;
  buttons: Array<{
    id: string;
    text: string;
  }>;
  footerText?: string;
}

export interface InstanceStatusResponse {
  state: 'disconnected' | 'connecting' | 'connected';
  qrcode?: string;
  paircode?: string;
  profileName?: string;
  profilePicUrl?: string;
  isBusiness?: boolean;
}

export interface MessageDownloadResponse {
  mimetype: string;
  fileName: string;
  size: number;
  data: string; // Base64
}

export interface GroupCreateDto {
  subject: string; // Nome do grupo
  participants: string[]; // ["5511999999999@s.whatsapp.net"]
  description?: string;
}

export interface GroupInfoResponse {
  id: string;
  subject: string;
  subjectOwner: string;
  subjectTime: number;
  creation: number;
  owner: string;
  desc: string;
  descOwner: string;
  descTime: number;
  participants: Array<{
    id: string;
    admin: 'admin' | 'superadmin' | null;
  }>;
  announce: boolean;
  locked: boolean;
  size: number;
}

/**
 * UAZ Service
 *
 * Classe responsável por todas as interações com a API UAZ
 */
export class UAZService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || UAZ_BASE_URL;
  }

  /**
   * Fazer request para UAZ API
   */
  private async request<T>(
    endpoint: string,
    token: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'token': token,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`UAZ API Error [${response.status}]: ${error}`);
    }

    return response.json();
  }

  // ==========================================
  // MESSAGES - Envio de Mensagens
  // ==========================================

  /**
   * Enviar mensagem de texto
   */
  async sendText(token: string, data: SendTextDto) {
    return this.request('/send/text', token, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Enviar mídia (imagem, vídeo, áudio, documento)
   */
  async sendMedia(token: string, data: SendMediaDto) {
    return this.request('/send/media', token, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Enviar contato
   */
  async sendContact(token: string, data: SendContactDto) {
    return this.request('/send/contact', token, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Enviar localização
   */
  async sendLocation(token: string, data: SendLocationDto) {
    return this.request('/send/location', token, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Enviar mensagem de lista interativa
   */
  async sendList(token: string, data: SendListDto) {
    return this.request('/send/list', token, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Enviar mensagem com botões
   */
  async sendButtons(token: string, data: SendButtonsDto) {
    return this.request('/send/buttons', token, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Atualizar presença (status de digitação)
   * @param status - 'composing' para digitando, 'paused' para parado
   */
  async sendPresence(
    token: string,
    number: string,
    status: 'composing' | 'paused' | 'recording' | 'available' | 'unavailable'
  ) {
    return this.request('/chat/sendPresence', token, {
      method: 'POST',
      body: JSON.stringify({ number, status }),
    });
  }

  // ==========================================
  // MESSAGES - Download e Operações
  // ==========================================

  /**
   * Baixar mídia recebida
   */
  async downloadMedia(token: string, messageId: string): Promise<MessageDownloadResponse> {
    return this.request(`/message/download?id=${messageId}`, token, {
      method: 'GET',
    });
  }

  /**
   * Marcar mensagem como lida
   */
  async markAsRead(token: string, messageId: string) {
    return this.request('/message/markread', token, {
      method: 'PUT',
      body: JSON.stringify({ id: messageId }),
    });
  }

  /**
   * Reagir a mensagem (emoji)
   */
  async reactToMessage(token: string, messageId: string, emoji: string) {
    return this.request('/message/react', token, {
      method: 'POST',
      body: JSON.stringify({ id: messageId, emoji }),
    });
  }

  /**
   * Deletar mensagem
   */
  async deleteMessage(token: string, messageId: string) {
    return this.request('/message/delete', token, {
      method: 'DELETE',
      body: JSON.stringify({ id: messageId }),
    });
  }

  // ==========================================
  // INSTANCE - Gerenciamento de Instância
  // ==========================================

  /**
   * Inicializar instância
   */
  async initInstance(token: string, instanceName: string) {
    return this.request('/instance/init', token, {
      method: 'POST',
      body: JSON.stringify({ name: instanceName }),
    });
  }

  /**
   * Conectar instância (obter QR Code)
   */
  async connectInstance(token: string): Promise<InstanceStatusResponse> {
    return this.request('/instance/connect', token, {
      method: 'POST',
    });
  }

  /**
   * Desconectar instância
   */
  async disconnectInstance(token: string) {
    return this.request('/instance/disconnect', token, {
      method: 'POST',
    });
  }

  /**
   * Buscar status da instância
   */
  async getInstanceStatus(token: string): Promise<InstanceStatusResponse> {
    return this.request('/instance/status', token, {
      method: 'GET',
    });
  }

  /**
   * Deletar instância
   */
  async deleteInstance(token: string) {
    return this.request('/instance', token, {
      method: 'DELETE',
    });
  }

  /**
   * Atualizar nome da instância
   */
  async updateInstanceName(token: string, name: string) {
    return this.request('/instance/updateInstanceName', token, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  }

  // ==========================================
  // PROFILE - Perfil do WhatsApp
  // ==========================================

  /**
   * Atualizar nome do perfil
   */
  async updateProfileName(token: string, name: string) {
    return this.request('/profile/name', token, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  }

  /**
   * Atualizar foto do perfil
   */
  async updateProfileImage(token: string, imageBase64: string) {
    return this.request('/profile/image', token, {
      method: 'PUT',
      body: JSON.stringify({ image: imageBase64 }),
    });
  }

  // ==========================================
  // GROUPS - Gerenciamento de Grupos
  // ==========================================

  /**
   * Criar grupo
   */
  async createGroup(token: string, data: GroupCreateDto) {
    return this.request('/group/create', token, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Buscar informações do grupo
   */
  async getGroupInfo(token: string, groupJid: string): Promise<GroupInfoResponse> {
    return this.request('/group/info', token, {
      method: 'GET',
      body: JSON.stringify({ groupJid }),
    });
  }

  /**
   * Listar grupos
   */
  async listGroups(token: string) {
    return this.request('/group/list', token, {
      method: 'GET',
    });
  }

  /**
   * Sair do grupo
   */
  async leaveGroup(token: string, groupJid: string) {
    return this.request('/group/leave', token, {
      method: 'POST',
      body: JSON.stringify({ groupJid }),
    });
  }

  /**
   * Atualizar participantes (add/remove)
   */
  async updateGroupParticipants(
    token: string,
    groupJid: string,
    action: 'add' | 'remove' | 'promote' | 'demote',
    participants: string[]
  ) {
    return this.request('/group/updateParticipants', token, {
      method: 'PUT',
      body: JSON.stringify({ groupJid, action, participants }),
    });
  }

  /**
   * Atualizar nome do grupo
   */
  async updateGroupName(token: string, groupJid: string, subject: string) {
    return this.request('/group/updateName', token, {
      method: 'PUT',
      body: JSON.stringify({ groupJid, subject }),
    });
  }

  /**
   * Atualizar descrição do grupo
   */
  async updateGroupDescription(token: string, groupJid: string, description: string) {
    return this.request('/group/updateDescription', token, {
      method: 'PUT',
      body: JSON.stringify({ groupJid, description }),
    });
  }

  /**
   * Atualizar foto do grupo
   */
  async updateGroupImage(token: string, groupJid: string, imageBase64: string) {
    return this.request('/group/updateImage', token, {
      method: 'PUT',
      body: JSON.stringify({ groupJid, image: imageBase64 }),
    });
  }

  /**
   * Obter link de convite do grupo
   */
  async getGroupInviteLink(token: string, groupJid: string) {
    return this.request(`/group/invitelink/${groupJid}`, token, {
      method: 'GET',
    });
  }

  /**
   * Resetar código de convite do grupo
   */
  async resetGroupInviteCode(token: string, groupJid: string) {
    return this.request('/group/resetInviteCode', token, {
      method: 'POST',
      body: JSON.stringify({ groupJid }),
    });
  }

  // ==========================================
  // CALLS - Gerenciamento de Chamadas
  // ==========================================

  /**
   * Fazer chamada para um contato
   */
  async makeCall(token: string, number: string) {
    return this.request('/call/make', token, {
      method: 'POST',
      body: JSON.stringify({ number }),
    });
  }

  /**
   * Rejeitar chamada recebida
   */
  async rejectCall(token: string, callId: string) {
    return this.request('/call/reject', token, {
      method: 'POST',
      body: JSON.stringify({ id: callId }),
    });
  }
}

// Singleton instance
export const uazService = new UAZService();
