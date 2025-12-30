import type {
  QRCodeResponse,
  InstanceStatusResponse
} from '@/features/instances/instances.interfaces'

// UAZapi-specific response types
interface UAZapiResponse<T = any> {
  success: boolean
  message?: string
  data?: T
  error?: string
}

interface ConnectionResponse {
  connected: boolean
  phoneNumber?: string
}

/**
 * @class UAZapiService
 * @description Serviço para integração com UAZapi para gerenciamento de instâncias WhatsApp
 */
export class UAZapiService {
  private readonly baseURL: string
  private readonly token: string

  constructor() {
    // Suporta ambas variações do nome da variável para compatibilidade
    this.baseURL = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com'
    this.token = process.env.UAZAPI_ADMIN_TOKEN || process.env.UAZAPI_TOKEN || ''

    if (!this.token) {
      console.warn('[UAZapiService] UAZAPI_ADMIN_TOKEN não configurado - listagem de todas instâncias não funcionará')
    }
  }

  private getHeaders(useAdminToken: boolean = false): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      [useAdminToken ? 'admintoken' : 'token']: this.token
    }
  }

  private async handleResponse<T>(response: Response): Promise<UAZapiResponse<T>> {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        message: 'Erro na requisição para UAZapi'
      }
    }

    try {
      const data = await response.json()
      return {
        success: true,
        data,
        message: 'Requisição realizada com sucesso'
      }
    } catch (error) {
      return {
        success: false,
        error: 'Erro ao processar resposta da API',
        message: 'Resposta inválida recebida'
      }
    }
  }

  /**
   * 🚀 Retry com backoff exponencial
   * Tenta a operação até 3 vezes com delays crescentes (1s, 2s, 4s)
   */
  private async withRetry<T>(
    operation: () => Promise<UAZapiResponse<T>>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<UAZapiResponse<T>> {
    let lastError: UAZapiResponse<T> | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await operation();

      // Se sucesso ou erro de validação (4xx), não retry
      if (result.success) {
        return result;
      }

      // Não fazer retry para erros de cliente (400-499)
      const errorMsg = result.error || '';
      if (errorMsg.includes('HTTP 4')) {
        return result;
      }

      lastError = result;

      // Se não é a última tentativa, aguardar antes de retry
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt); // 1s, 2s, 4s
        console.warn(`[UAZapi] Tentativa ${attempt + 1} falhou, retry em ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.error(`[UAZapi] Todas as ${maxRetries} tentativas falharam`);
    return lastError || {
      success: false,
      error: 'Todas as tentativas falharam',
      message: 'Erro após múltiplas tentativas'
    };
  }

  /**
   * @method createInstance
   * @description Cria uma nova instância no UAZapi (requer admintoken)
   * @param {string} name - Nome da instância
   * @param {string} webhookUrl - URL do webhook (opcional)
   * @returns {Promise<UAZapiResponse>} Resposta da criação da instância
   */
  async createInstance(name: string, webhookUrl?: string): Promise<UAZapiResponse> {
    try {
      const response = await fetch(`${this.baseURL}/instance/init`, {
        method: 'POST',
        headers: this.getHeaders(true), // usa admintoken
        body: JSON.stringify({
          name,
          systemName: 'app-quayer'
        })
      })

      return await this.handleResponse(response)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: 'Falha ao criar instância'
      }
    }
  }

  /**
   * @method connectInstance
   * @description Conecta uma instância e gera QR Code ou código de pareamento
   * @param {string} instanceToken - Token da instância (não o nome)
   * @param {string} phone - Número de telefone (opcional, para gerar código de pareamento)
   * @returns {Promise<UAZapiResponse<QRCodeResponse>>} Resposta com QR Code ou código
   */
  async connectInstance(instanceToken: string, phone?: string): Promise<UAZapiResponse<QRCodeResponse>> {
    try {
      const response = await fetch(`${this.baseURL}/instance/connect`, {
        method: 'POST',
        headers: { ...this.getHeaders(), 'token': instanceToken },
        body: JSON.stringify(phone ? { phone } : {})
      })

      const result = await this.handleResponse<any>(response)

      if (result.success && result.data) {
        const instanceData = result.data.instance || result.data
        return {
          success: true,
          data: {
            qrcode: instanceData.qrcode || '',
            pairingCode: instanceData.paircode || '',
            expires: 120000 // 2 minutos em milissegundos (120 * 1000)
          },
          message: phone ? 'Código de pareamento gerado' : 'QR Code gerado com sucesso'
        }
      }

      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: 'Falha ao conectar instância'
      }
    }
  }

  /**
   * @method disconnectInstance
   * @description Desconecta uma instância
   * @param {string} instanceToken - Token da instância
   * @returns {Promise<UAZapiResponse>} Resposta da desconexão
   */
  async disconnectInstance(instanceToken: string): Promise<UAZapiResponse> {
    try {
      const response = await fetch(`${this.baseURL}/instance/disconnect`, {
        method: 'POST',
        headers: { ...this.getHeaders(), 'token': instanceToken }
      })

      return await this.handleResponse(response)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: 'Falha ao desconectar instância'
      }
    }
  }

  /**
   * @method getInstanceStatus
   * @description Verifica o status de uma instância
   * @param {string} instanceToken - Token da instância
   * @returns {Promise<UAZapiResponse<InstanceStatusResponse>>} Status da instância
   */
  async getInstanceStatus(instanceToken: string): Promise<UAZapiResponse<InstanceStatusResponse>> {
    try {
      const response = await fetch(`${this.baseURL}/instance/status`, {
        method: 'GET',
        headers: { ...this.getHeaders(), 'token': instanceToken }
      })

      const result = await this.handleResponse<any>(response)

      if (result.success && result.data) {
        const instanceData = result.data.instance || result.data
        return {
          success: true,
          data: {
            status: instanceData.status || 'disconnected',
            phoneNumber: instanceData.phoneNumber,
            name: instanceData.name || instanceData.profileName,
            lastSeen: instanceData.lastDisconnect ? new Date(instanceData.lastDisconnect) : undefined
          },
          message: 'Status obtido com sucesso'
        }
      }

      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: 'Falha ao obter status da instância'
      }
    }
  }

  /**
   * @method deleteInstance
   * @description Remove uma instância do UAZapi (requer admintoken)
   * @param {string} instanceToken - Token da instância
   * @returns {Promise<UAZapiResponse>} Resposta da remoção
   */
  async deleteInstance(instanceToken: string): Promise<UAZapiResponse> {
    try {
      const response = await fetch(`${this.baseURL}/instance`, {
        method: 'DELETE',
        headers: { ...this.getHeaders(true), 'token': instanceToken }
      })

      return await this.handleResponse(response)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: 'Falha ao deletar instância'
      }
    }
  }

  /**
   * @method listAllInstances
   * @description Lista todas as instâncias (requer admintoken)
   * @returns {Promise<UAZapiResponse>} Lista de instâncias
   */
  async listAllInstances(): Promise<UAZapiResponse> {
    try {
      const response = await fetch(`${this.baseURL}/instance/all`, {
        method: 'GET',
        headers: this.getHeaders(true) // usa admintoken
      })

      return await this.handleResponse(response)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: 'Falha ao listar instâncias'
      }
    }
  }

  /**
   * @method generateQR
   * @description Gera um novo QR Code para uma instância
   * @param {string} instanceToken - Token da instância
   * @returns {Promise<UAZapiResponse<QRCodeResponse>>} Novo QR Code
   */
  async generateQR(instanceToken: string): Promise<UAZapiResponse<QRCodeResponse>> {
    return this.connectInstance(instanceToken)
  }

  /**
   * @method getProfilePicture
   * @description Obtém a foto de perfil do WhatsApp conectado
   * @param {string} instanceToken - Token da instância
   * @returns {Promise<UAZapiResponse<{ profilePictureUrl: string }>>} URL da foto de perfil
   */
  async getProfilePicture(instanceToken: string): Promise<UAZapiResponse<{ profilePictureUrl: string }>> {
    try {
      const response = await fetch(`${this.baseURL}/instance/profilePicture`, {
        method: 'GET',
        headers: { ...this.getHeaders(), 'token': instanceToken }
      })

      const result = await this.handleResponse<any>(response)

      if (result.success && result.data) {
        return {
          success: true,
          data: {
            profilePictureUrl: result.data.profilePictureUrl || result.data.url || ''
          },
          message: 'Foto de perfil obtida com sucesso'
        }
      }

      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: 'Falha ao obter foto de perfil'
      }
    }
  }

  /**
   * @method setWebhook
   * @description Configura webhook para eventos da instância
   * @param {string} instanceToken - Token da instância
   * @param {string} webhookUrl - URL do webhook
   * @param {string[]} events - Lista de eventos para notificar
   * @returns {Promise<UAZapiResponse>} Resposta da configuração do webhook
   */
  async setWebhook(
    instanceToken: string,
    webhookUrl: string,
    events: string[] = ['message.received', 'message.sent', 'instance.status']
  ): Promise<UAZapiResponse> {
    try {
      const response = await fetch(`${this.baseURL}/instance/webhook`, {
        method: 'POST',
        headers: { ...this.getHeaders(), 'token': instanceToken },
        body: JSON.stringify({
          url: webhookUrl,
          events
        })
      })

      return await this.handleResponse(response)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: 'Falha ao configurar webhook'
      }
    }
  }

  /**
   * @method getWebhook
   * @description Obtém a configuração atual do webhook
   * @param {string} instanceToken - Token da instância
   * @returns {Promise<UAZapiResponse<{ webhookUrl: string, events: string[] }>>} Configuração do webhook
   */
  async getWebhook(instanceToken: string): Promise<UAZapiResponse<{ webhookUrl: string, events: string[] }>> {
    try {
      const response = await fetch(`${this.baseURL}/instance/webhook`, {
        method: 'GET',
        headers: { ...this.getHeaders(), 'token': instanceToken }
      })

      const result = await this.handleResponse<any>(response)

      if (result.success && result.data) {
        return {
          success: true,
          data: {
            webhookUrl: result.data.url || result.data.webhookUrl || '',
            events: result.data.events || []
          },
          message: 'Configuração do webhook obtida com sucesso'
        }
      }

      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: 'Falha ao obter configuração do webhook'
      }
    }
  }
  /**
   * @method findChats
   * @description Busca chats da instância
   * Tenta múltiplos endpoints para compatibilidade com diferentes versões da API
   * IMPORTANTE: Inclui timeout de 15s para evitar loading infinito
   * @param {string} instanceToken - Token da instância
   * @param {number} timeoutMs - Timeout em ms (default: 15000)
   * @returns {Promise<UAZapiResponse<any[]>>} Lista de chats
   */
  async findChats(instanceToken: string, timeoutMs: number = 15000): Promise<UAZapiResponse<any[]>> {
    // Lista de endpoints para tentar (ordem de prioridade)
    // IMPORTANT: POST /chat/find with empty body {} returns chats correctly
    // Using count/limit/page parameters returns empty chats array
    const endpoints = [
      { method: 'POST', path: '/chat/find', body: {} }, // This works! Empty body returns all chats
      { method: 'POST', path: '/chat/findChats', body: {} },
      { method: 'GET', path: '/chat/findChats', body: null },
      { method: 'GET', path: '/chat/find', body: null },
    ];

    let lastError: string = '';

    for (const endpoint of endpoints) {
      try {
        console.log(`[UAZapi.findChats] Trying ${endpoint.method} ${endpoint.path}...`);

        // 🚀 TIMEOUT: Usar AbortController para evitar loading infinito
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(`${this.baseURL}${endpoint.path}`, {
            method: endpoint.method,
            headers: {
              'Content-Type': 'application/json',
              'token': instanceToken,
              'apikey': this.token, // Admin token também necessário para algumas APIs
            },
            signal: controller.signal,
            ...(endpoint.body && { body: JSON.stringify(endpoint.body) })
          });

          clearTimeout(timeoutId);

          console.log(`[UAZapi.findChats] ${endpoint.path} status: ${response.status}`);

          if (response.ok) {
            const result = await this.handleResponse<any[]>(response);
            if (result.success) {
              // Normalizar resposta - pode vir como array ou como { chats: [] }
              let chats = result.data;
              if (!Array.isArray(chats) && chats && Array.isArray((chats as any).chats)) {
                chats = (chats as any).chats;
              }
              if (!Array.isArray(chats)) {
                chats = [];
              }
              console.log(`[UAZapi.findChats] Success! Found ${chats.length} chats via ${endpoint.path}`);
              return {
                success: true,
                data: chats,
                message: `Chats obtidos via ${endpoint.path}`
              };
            }
          }

          // Se 404 ou 405, tentar próximo endpoint
          if (response.status === 404 || response.status === 405) {
            console.log(`[UAZapi.findChats] ${endpoint.path} returned ${response.status}, trying next...`);
            continue;
          }

          // Outros erros - registrar mas continuar tentando
          const errorData = await response.json().catch(() => ({}));
          lastError = errorData.message || `HTTP ${response.status}`;
          console.warn(`[UAZapi.findChats] ${endpoint.path} error: ${lastError}`);

        } catch (fetchError: any) {
          clearTimeout(timeoutId);

          // Verificar se foi timeout (abort)
          if (fetchError.name === 'AbortError') {
            lastError = `Timeout após ${timeoutMs}ms`;
            console.warn(`[UAZapi.findChats] ${endpoint.path} timeout after ${timeoutMs}ms`);
            continue; // Tentar próximo endpoint
          }
          throw fetchError;
        }

      } catch (error: any) {
        lastError = error.message || 'Erro desconhecido';
        console.warn(`[UAZapi.findChats] ${endpoint.path} exception: ${lastError}`);
      }
    }

    console.error(`[UAZapi.findChats] All endpoints failed. Last error: ${lastError}`);
    return {
      success: false,
      error: lastError || 'Todos os endpoints falharam',
      message: 'Falha ao buscar chats - nenhum endpoint funcionou'
    };
  }

  /**
   * @method findMessages
   * @description Busca mensagens de um chat
   * Tenta múltiplos endpoints para compatibilidade com diferentes versões da API
   * IMPORTANTE: Inclui timeout de 15s para evitar loading infinito
   * @param {string} instanceToken - Token da instância
   * @param {string} chatId - ID do chat (ex: 5511999999999@s.whatsapp.net)
   * @param {number} limit - Limite de mensagens
   * @param {number} timeoutMs - Timeout em ms (default: 15000)
   * @returns {Promise<UAZapiResponse<any[]>>} Lista de mensagens
   */
  async findMessages(instanceToken: string, chatId: string, limit: number = 50, timeoutMs: number = 15000): Promise<UAZapiResponse<any[]>> {
    // Lista de endpoints para tentar
    const endpoints = [
      { method: 'POST', path: '/message/find', body: { chatId, limit } },
      { method: 'POST', path: '/chat/findMessages', body: { chatId, count: limit } },
      { method: 'GET', path: `/chat/findMessages/${encodeURIComponent(chatId)}`, body: null },
    ];

    let lastError: string = '';

    for (const endpoint of endpoints) {
      try {
        console.log(`[UAZapi.findMessages] Trying ${endpoint.method} ${endpoint.path}...`);

        // 🚀 TIMEOUT: Usar AbortController para evitar loading infinito
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(`${this.baseURL}${endpoint.path}`, {
            method: endpoint.method,
            headers: {
              'Content-Type': 'application/json',
              'token': instanceToken,
              'apikey': this.token,
            },
            signal: controller.signal,
            ...(endpoint.body && { body: JSON.stringify(endpoint.body) })
          });

          clearTimeout(timeoutId);

          console.log(`[UAZapi.findMessages] ${endpoint.path} status: ${response.status}`);

          if (response.ok) {
            const result = await this.handleResponse<any>(response);
            if (result.success) {
              // Normalizar resposta - pode vir como { messages: [] } ou array direto
              let messages = result.data;
              if (!Array.isArray(messages) && messages?.messages) {
                messages = messages.messages;
              }
              if (!Array.isArray(messages)) {
                messages = [];
              }
              console.log(`[UAZapi.findMessages] Success! Found ${messages.length} messages via ${endpoint.path}`);
              return {
                success: true,
                data: messages,
                message: `Mensagens obtidas via ${endpoint.path}`
              };
            }
          }

          // Se 404 ou 405, tentar próximo endpoint
          if (response.status === 404 || response.status === 405) {
            console.log(`[UAZapi.findMessages] ${endpoint.path} returned ${response.status}, trying next...`);
            continue;
          }

          const errorData = await response.json().catch(() => ({}));
          lastError = errorData.message || `HTTP ${response.status}`;
          console.warn(`[UAZapi.findMessages] ${endpoint.path} error: ${lastError}`);

        } catch (fetchError: any) {
          clearTimeout(timeoutId);

          // Verificar se foi timeout (abort)
          if (fetchError.name === 'AbortError') {
            lastError = `Timeout após ${timeoutMs}ms`;
            console.warn(`[UAZapi.findMessages] ${endpoint.path} timeout after ${timeoutMs}ms`);
            continue; // Tentar próximo endpoint
          }
          throw fetchError;
        }

      } catch (error: any) {
        lastError = error.message || 'Erro desconhecido';
        console.warn(`[UAZapi.findMessages] ${endpoint.path} exception: ${lastError}`);
      }
    }

    console.error(`[UAZapi.findMessages] All endpoints failed. Last error: ${lastError}`);
    return {
      success: false,
      error: lastError || 'Todos os endpoints falharam',
      message: 'Falha ao buscar mensagens - nenhum endpoint funcionou'
    };
  }

  // ==================== CHAT OPERATIONS ====================

  /**
   * @method markAsRead
   * @description Marca um chat como lido
   * @param {string} instanceToken - Token da instância
   * @param {string} chatId - ID do chat (ex: 5511999999999@s.whatsapp.net)
   * @returns {Promise<UAZapiResponse>} Resposta da operação
   */
  async markAsRead(instanceToken: string, chatId: string): Promise<UAZapiResponse> {
    try {
      const response = await fetch(`${this.baseURL}/chat/mark-read`, {
        method: 'POST',
        headers: { ...this.getHeaders(), 'token': instanceToken },
        body: JSON.stringify({ chatId })
      })

      return await this.handleResponse(response)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: 'Falha ao marcar chat como lido'
      }
    }
  }

  /**
   * @method archiveChat
   * @description Arquiva ou desarquiva um chat
   * @param {string} instanceToken - Token da instância
   * @param {string} chatId - ID do chat
   * @param {boolean} archive - true para arquivar, false para desarquivar
   * @returns {Promise<UAZapiResponse>} Resposta da operação
   */
  async archiveChat(instanceToken: string, chatId: string, archive: boolean = true): Promise<UAZapiResponse> {
    try {
      const response = await fetch(`${this.baseURL}/chat/archive`, {
        method: 'POST',
        headers: { ...this.getHeaders(), 'token': instanceToken },
        body: JSON.stringify({ chatId, archive })
      })

      return await this.handleResponse(response)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: `Falha ao ${archive ? 'arquivar' : 'desarquivar'} chat`
      }
    }
  }

  /**
   * @method deleteChat
   * @description Deleta um chat
   * @param {string} instanceToken - Token da instância
   * @param {string} chatId - ID do chat
   * @returns {Promise<UAZapiResponse>} Resposta da operação
   */
  async deleteChat(instanceToken: string, chatId: string): Promise<UAZapiResponse> {
    try {
      const response = await fetch(`${this.baseURL}/chat/delete`, {
        method: 'DELETE',
        headers: { ...this.getHeaders(), 'token': instanceToken },
        body: JSON.stringify({ chatId })
      })

      return await this.handleResponse(response)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: 'Falha ao deletar chat'
      }
    }
  }

  /**
   * @method blockContact
   * @description Bloqueia ou desbloqueia um contato
   * @param {string} instanceToken - Token da instância
   * @param {string} number - Número do contato (ex: 5511999999999@s.whatsapp.net)
   * @param {boolean} block - true para bloquear, false para desbloquear
   * @returns {Promise<UAZapiResponse>} Resposta da operação
   */
  async blockContact(instanceToken: string, number: string, block: boolean = true): Promise<UAZapiResponse> {
    try {
      const endpoint = block ? 'block' : 'unblock'
      const response = await fetch(`${this.baseURL}/contact/${endpoint}`, {
        method: 'POST',
        headers: { ...this.getHeaders(), 'token': instanceToken },
        body: JSON.stringify({ number })
      })

      return await this.handleResponse(response)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: `Falha ao ${block ? 'bloquear' : 'desbloquear'} contato`
      }
    }
  }

  /**
   * @method fetchContactProfilePicture
   * @description Obtém a foto de perfil de um contato específico
   * @param {string} instanceToken - Token da instância
   * @param {string} number - Número do contato (ex: 5511999999999 ou 5511999999999@s.whatsapp.net)
   * @returns {Promise<UAZapiResponse<{ profilePictureUrl: string | null }>>} URL da foto de perfil
   */
  async fetchContactProfilePicture(instanceToken: string, number: string): Promise<UAZapiResponse<{ profilePictureUrl: string | null }>> {
    try {
      // Garantir formato correto do número
      const formattedNumber = number.includes('@') ? number : `${number}@s.whatsapp.net`

      const response = await fetch(`${this.baseURL}/chat/fetchProfilePictureUrl`, {
        method: 'POST',
        headers: { ...this.getHeaders(), 'token': instanceToken },
        body: JSON.stringify({ number: formattedNumber })
      })

      const result = await this.handleResponse<any>(response)

      if (result.success && result.data) {
        return {
          success: true,
          data: {
            profilePictureUrl: result.data.profilePictureUrl || result.data.url || result.data.picture || null
          },
          message: 'Foto de perfil obtida com sucesso'
        }
      }

      // Se não encontrou foto, retorna null (não é erro)
      return {
        success: true,
        data: { profilePictureUrl: null },
        message: 'Contato não possui foto de perfil'
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message: 'Falha ao obter foto de perfil do contato'
      }
    }
  }

  /**
   * @method fetchContactsProfilePictures
   * @description Obtém fotos de perfil de múltiplos contatos (batch)
   * @param {string} instanceToken - Token da instância
   * @param {string[]} numbers - Array de números (ex: ['5511999999999', '5511888888888'])
   * @returns {Promise<Map<string, string | null>>} Mapa de número -> URL da foto
   */
  async fetchContactsProfilePictures(instanceToken: string, numbers: string[]): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>()

    // Processar em batches de 5 para não sobrecarregar a API
    const batchSize = 5
    for (let i = 0; i < numbers.length; i += batchSize) {
      const batch = numbers.slice(i, i + batchSize)

      const promises = batch.map(async (number) => {
        const result = await this.fetchContactProfilePicture(instanceToken, number)
        return { number, url: result.data?.profilePictureUrl || null }
      })

      const batchResults = await Promise.all(promises)
      for (const { number, url } of batchResults) {
        results.set(number.replace(/@.*$/, ''), url)
      }

      // Pequeno delay entre batches para evitar rate limiting
      if (i + batchSize < numbers.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    return results
  }
}

// Instância singleton do serviço
export const uazapiService = new UAZapiService()
