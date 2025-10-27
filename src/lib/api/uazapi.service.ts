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
    this.baseURL = process.env.UAZAPI_URL || 'https://quayer.uazapi.com'
    this.token = process.env.UAZAPI_ADMIN_TOKEN || process.env.UAZAPI_TOKEN || ''
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
}

// Instância singleton do serviço
export const uazapiService = new UAZapiService()
