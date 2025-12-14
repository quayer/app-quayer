/**
 * Provider Orchestrator
 *
 * Camada de orquestração que:
 * 1. Seleciona o adapter correto com base no brokerType da instância
 * 2. Implementa fallback automático entre providers
 * 3. Gerencia retry logic
 * 4. Integra com Transcription Engine e Message Concatenator
 * 5. Normaliza todos os webhooks independente do provider
 */

import { IProviderAdapter } from '../interfaces/provider-adapter.interface';
import { ProviderType, ProviderResponse, NormalizedWebhookPayload } from '../types/normalized.types';
import { uazapiAdapter } from '../adapters/uazapi.adapter';
import { database } from '@/services/database';
import { logger } from '@/services/logger';
import { redis } from '@/services/redis';

interface OrchestratorConfig {
  enableFallback: boolean;
  fallbackOrder: ProviderType[];
  maxRetries: number;
  retryDelay: number; // milliseconds
  cacheEnabled: boolean;
  cacheTTL: number; // seconds
  statusCacheTTL: number; // seconds - TTL específico para status (mais curto)
}

export class ProviderOrchestrator {
  private adapters: Map<ProviderType, IProviderAdapter> = new Map();
  private config: OrchestratorConfig;

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = {
      enableFallback: config?.enableFallback ?? true,
      fallbackOrder: config?.fallbackOrder ?? [
        ProviderType.UAZAPI,
        ProviderType.EVOLUTION,
        ProviderType.BAILEYS,
      ],
      maxRetries: config?.maxRetries ?? 3,
      retryDelay: config?.retryDelay ?? 1000,
      cacheEnabled: config?.cacheEnabled ?? true,
      cacheTTL: config?.cacheTTL ?? 300, // 5 minutos para dados gerais
      statusCacheTTL: config?.statusCacheTTL ?? 5, // 5 segundos para status (polling rápido)
    };

    // Registrar adapters disponíveis
    this.registerAdapter(uazapiAdapter);
    // Futuramente: this.registerAdapter(evolutionAdapter);
    // Futuramente: this.registerAdapter(baileysAdapter);
  }

  /**
   * Registrar novo adapter
   */
  registerAdapter(adapter: IProviderAdapter): void {
    this.adapters.set(adapter.providerType, adapter);
    logger.info(`[Orchestrator] Adapter registrado: ${adapter.providerName}`, {
      provider: adapter.providerType,
    });
  }

  /**
   * Obter adapter adequado para uma instância
   */
  private async getAdapterForInstance(instanceId: string): Promise<IProviderAdapter> {
    // 1. Buscar instância no banco
    const instance = await database.instance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new Error(`Instância ${instanceId} não encontrada`);
    }

    // 2. Obter provider da instância com mapeamento de compatibilidade
    let providerType: ProviderType;

    // Mapeamento de providers legados para novos
    const providerMapping: Record<string, ProviderType> = {
      'WHATSAPP_WEB': ProviderType.UAZAPI,  // Legacy WhatsApp Web → UAZapi
      'WHATSAPP': ProviderType.UAZAPI,      // Legacy WhatsApp → UAZapi
      'WEB': ProviderType.UAZAPI,           // Legacy Web → UAZapi
    };

    const rawProvider = instance.provider as string;
    providerType = providerMapping[rawProvider] || (rawProvider as ProviderType) || ProviderType.UAZAPI;

    // 3. Buscar adapter correspondente
    const adapter = this.adapters.get(providerType);

    if (!adapter) {
      throw new Error(`Adapter ${providerType} não está registrado (provider original: ${rawProvider})`);
    }

    // 4. Verificar saúde do provider
    if (this.config.enableFallback) {
      const health = await adapter.healthCheck();

      if (!health.success || !health.data?.healthy) {
        logger.warn(`[Orchestrator] Provider ${providerType} não está saudável, iniciando fallback`, {
          instanceId,
          provider: providerType,
        });

        // Tentar fallback
        return await this.getFallbackAdapter(providerType);
      }
    }

    return adapter;
  }

  /**
   * Obter adapter de fallback
   */
  private async getFallbackAdapter(failedProvider: ProviderType): Promise<IProviderAdapter> {
    // Filtrar providers disponíveis (excluindo o que falhou)
    const availableProviders = this.config.fallbackOrder.filter(
      (p) => p !== failedProvider && this.adapters.has(p)
    );

    for (const providerType of availableProviders) {
      const adapter = this.adapters.get(providerType);
      if (!adapter) continue;

      const health = await adapter.healthCheck();

      if (health.success && health.data?.healthy) {
        logger.info(`[Orchestrator] Fallback ativo: ${providerType}`, {
          failedProvider,
          newProvider: providerType,
        });

        return adapter;
      }
    }

    throw new Error('Nenhum provider disponível para fallback');
  }

  /**
   * Executar operação com retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<ProviderResponse<T>>,
    operationName: string
  ): Promise<ProviderResponse<T>> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await operation();

        if (result.success) {
          return result;
        }

        lastError = result.error;

        if (attempt < this.config.maxRetries) {
          logger.warn(`[Orchestrator] Tentativa ${attempt} falhou, retentando ${operationName}`, {
            attempt,
            maxRetries: this.config.maxRetries,
            error: lastError,
          });

          await this.delay(this.config.retryDelay * attempt);
        }
      } catch (error) {
        lastError = error;

        if (attempt < this.config.maxRetries) {
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }

    throw new Error(
      `Operação ${operationName} falhou após ${this.config.maxRetries} tentativas: ${lastError}`
    );
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================
  // PUBLIC API - OPERAÇÕES ORQUESTRADAS
  // ==========================================

  /**
   * Enviar mensagem de texto (com retry e fallback)
   */
  async sendTextMessage(params: {
    instanceId: string;
    to: string;
    text: string;
    quotedMessageId?: string;
  }) {
    const adapter = await this.getAdapterForInstance(params.instanceId);

    // Obter token da instância
    const instance = await database.instance.findUnique({
      where: { id: params.instanceId },
    });

    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    return this.executeWithRetry(
      () => adapter.sendTextMessage({ ...params, token: instance.uazapiToken || '' }),
      'sendTextMessage'
    );
  }

  /**
   * Enviar mídia (com retry e fallback)
   */
  async sendMediaMessage(params: {
    instanceId: string;
    to: string;
    mediaUrl: string;
    caption?: string;
    fileName?: string;
  }) {
    const adapter = await this.getAdapterForInstance(params.instanceId);

    const instance = await database.instance.findUnique({
      where: { id: params.instanceId },
    });

    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    return this.executeWithRetry(
      () => adapter.sendMediaMessage({ ...params, token: instance.uazapiToken || '' }),
      'sendMediaMessage'
    );
  }

  /**
   * Enviar mensagem com botões
   */
  async sendButtonsMessage(params: {
    instanceId: string;
    to: string;
    text: string;
    buttons: Array<{ id: string; text: string }>;
  }) {
    const adapter = await this.getAdapterForInstance(params.instanceId);

    const instance = await database.instance.findUnique({
      where: { id: params.instanceId },
    });

    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    return this.executeWithRetry(
      () => adapter.sendButtonsMessage({ ...params, token: instance.uazapiToken || '' }),
      'sendButtonsMessage'
    );
  }

  /**
   * Enviar mensagem com lista
   */
  async sendListMessage(params: {
    instanceId: string;
    to: string;
    text: string;
    buttonText: string;
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  }) {
    const adapter = await this.getAdapterForInstance(params.instanceId);

    const instance = await database.instance.findUnique({
      where: { id: params.instanceId },
    });

    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    return this.executeWithRetry(
      () => adapter.sendListMessage({ ...params, token: instance.uazapiToken || '' }),
      'sendListMessage'
    );
  }

  /**
   * Criar nova instância
   */
  async createInstance(params: {
    instanceId: string;
    name: string;
    webhookUrl?: string;
    providerType?: ProviderType;
  }) {
    const adapter = this.adapters.get(params.providerType || ProviderType.UAZAPI);

    if (!adapter) {
      throw new Error(`Adapter ${params.providerType || ProviderType.UAZAPI} não encontrado`);
    }

    return this.executeWithRetry(
      () => adapter.createInstance({
        instanceId: params.instanceId,
        name: params.name,
        webhookUrl: params.webhookUrl,
      }),
      'createInstance'
    );
  }

  /**
   * Conectar instância
   */
  async connectInstance(instanceId: string) {
    const adapter = await this.getAdapterForInstance(instanceId);

    const instance = await database.instance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    // Invalidar cache de status para garantir polling fresco
    if (this.config.cacheEnabled) {
      const cacheKey = `instance:status:${instanceId}`;
      await redis.del(cacheKey);
      logger.debug('[Orchestrator] Cache de status invalidado ao conectar', { instanceId });
    }

    return this.executeWithRetry(
      () => adapter.connectInstance({ token: instance.uazapiToken || '', instanceId }),
      'connectInstance'
    );
  }

  /**
   * Desconectar instância
   */
  async disconnectInstance(instanceId: string) {
    const adapter = await this.getAdapterForInstance(instanceId);

    const instance = await database.instance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    // Invalidar cache de status
    if (this.config.cacheEnabled) {
      const cacheKey = `instance:status:${instanceId}`;
      await redis.del(cacheKey);
    }

    return this.executeWithRetry(
      () => adapter.disconnectInstance({ token: instance.uazapiToken || '', instanceId }),
      'disconnectInstance'
    );
  }

  /**
   * Deletar instância do provider
   */
  async deleteInstance(instanceId: string) {
    const adapter = await this.getAdapterForInstance(instanceId);

    const instance = await database.instance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    // Invalidar cache de status
    if (this.config.cacheEnabled) {
      const cacheKey = `instance:status:${instanceId}`;
      await redis.del(cacheKey);
    }

    return this.executeWithRetry(
      () => adapter.deleteInstance({ token: instance.uazapiToken || '', instanceId }),
      'deleteInstance'
    );
  }

  /**
   * Obter foto de perfil
   */
  async getProfilePicture(instanceId: string, phoneNumber?: string) {
    const adapter = await this.getAdapterForInstance(instanceId);

    const instance = await database.instance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    // Usa o phoneNumber fornecido ou o da própria instância
    const targetPhone = phoneNumber || instance.phoneNumber || '';

    return this.executeWithRetry(
      () => adapter.getProfilePicture({ token: instance.uazapiToken || '', phoneNumber: targetPhone }),
      'getProfilePicture'
    );
  }

  /**
   * Buscar foto de perfil de um contato
   * Retorna a URL da foto ou null se não encontrar
   */
  async getContactProfilePicture(provider: string, instanceId: string, phoneNumber: string): Promise<string | null> {
    try {
      const result = await this.getProfilePicture(instanceId, phoneNumber);

      if (result.success && result.data) {
        // O adapter retorna { url: string } ou { profilePicUrl: string }
        const data = result.data as { url?: string; profilePicUrl?: string };
        return data.url || data.profilePicUrl || null;
      }

      return null;
    } catch (error) {
      logger.error('[Orchestrator] Failed to get contact profile picture', {
        instanceId,
        phoneNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Obter status da instância
   * Usa TTL curto (5s) para permitir polling frequente durante conexão
   */
  async getInstanceStatus(instanceId: string) {
    const adapter = await this.getAdapterForInstance(instanceId);

    const instance = await database.instance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    // Tentar cache primeiro - usa TTL curto para status
    if (this.config.cacheEnabled) {
      const cacheKey = `instance:status:${instanceId}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        logger.debug('[Orchestrator] Status retornado do cache', { instanceId });
        return JSON.parse(cached);
      }

      // Se não tem cache, buscar e cachear com TTL curto
      const result = await adapter.getInstanceStatus({ token: instance.uazapiToken || '' });

      if (result.success) {
        // Usar statusCacheTTL (5s) ao invés de cacheTTL (300s) para polling rápido
        await redis.setex(cacheKey, this.config.statusCacheTTL, JSON.stringify(result));
      }

      return result;
    }

    return adapter.getInstanceStatus({ token: instance.uazapiToken || '' });
  }

  /**
   * Normalizar webhook de qualquer provider
   */
  async normalizeWebhook(rawPayload: any, providerType?: ProviderType): Promise<NormalizedWebhookPayload> {
    // Se providerType não foi especificado, tentar detectar
    const detectedProvider = providerType || this.detectProviderFromWebhook(rawPayload);

    const adapter = this.adapters.get(detectedProvider);

    if (!adapter) {
      throw new Error(`Adapter ${detectedProvider} não encontrado para normalizar webhook`);
    }

    const normalized = await adapter.normalizeWebhook(rawPayload);

    logger.info('[Orchestrator] Webhook normalizado', {
      provider: detectedProvider,
      event: normalized.event,
      instanceId: normalized.instanceId,
    });

    return normalized;
  }

  /**
   * Detectar provider a partir do payload do webhook
   */
  private detectProviderFromWebhook(rawPayload: any): ProviderType {
    // UAZapi: tem campo 'event' e 'instance.name'
    if (rawPayload.event && rawPayload.instance?.name) {
      return ProviderType.UAZAPI;
    }

    // Evolution API: tem campo 'event' e 'instance.instanceName'
    if (rawPayload.event && rawPayload.instance?.instanceName) {
      return ProviderType.EVOLUTION;
    }

    // Fallback para UAZapi
    return ProviderType.UAZAPI;
  }

  /**
   * Health check de todos os providers
   */
  async healthCheckAll(): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    for (const [providerType, adapter] of this.adapters) {
      try {
        const health = await adapter.healthCheck();
        results[providerType] = {
          healthy: health.data?.healthy || false,
          latency: health.data?.latency || 0,
          error: health.error,
        };
      } catch (error) {
        // Se health check falhar, retornar status unhealthy
        results[providerType] = {
          healthy: false,
          latency: -1,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    return results;
  }

  /**
   * Listar TODAS as instâncias de todos os providers (Admin only)
   * Combina dados do banco local com dados dos providers
   */
  async listAllInstances(): Promise<{
    success: boolean;
    data: any[];
    meta: {
      totalUAZapi: number;
      totalLocal: number;
      combined: number;
      uazApiError: string | null;
    };
    error?: string;
  }> {
    try {
      // 1. Buscar instâncias do banco local
      const localInstances = await database.connection.findMany({
        orderBy: { createdAt: 'desc' },
        include: { organization: true },
      });

      // 2. Buscar instâncias de cada provider registrado
      let uazInstances: any[] = [];
      let uazApiError: string | null = null;

      // UAZapi
      const uazAdapter = this.adapters.get(ProviderType.UAZAPI);
      if (uazAdapter) {
        try {
          const adminToken = process.env.UAZAPI_ADMIN_TOKEN || '';
          const baseUrl = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';

          if (!adminToken) {
            uazApiError = 'Token admin não configurado';
            logger.warn('[Orchestrator] UAZAPI_ADMIN_TOKEN não configurado');
          } else {
            // Import dinâmico para evitar dependência circular
            const { UAZClient } = await import('../adapters/uazapi/uazapi.client');
            const uazClient = new UAZClient({ baseUrl, adminToken });

            logger.debug('[Orchestrator] Fetching all instances from UAZapi', { baseUrl });
            const response = await uazClient.listAllInstances();

            // UAZapi retorna direto um array, não { success, data }
            if (Array.isArray(response)) {
              uazInstances = response;
              logger.info('[Orchestrator] UAZapi instances fetched (array response)', { count: uazInstances.length });
            } else if (response && response.success && Array.isArray(response.data)) {
              uazInstances = response.data;
              logger.info('[Orchestrator] UAZapi instances fetched (wrapped response)', { count: uazInstances.length });
            } else {
              logger.warn('[Orchestrator] UAZapi returned unexpected format', { response: typeof response });
            }
          }
        } catch (error: any) {
          uazApiError = error.message || 'Erro ao conectar com UAZapi';
          logger.error('[Orchestrator] Error fetching from UAZapi', { error: uazApiError });
        }
      }

      // Futuramente: adicionar Evolution, Baileys, etc.
      // const evolutionAdapter = this.adapters.get(ProviderType.EVOLUTION);
      // if (evolutionAdapter) { ... }

      // 3. Criar mapa de instâncias locais por uazapiInstanceId
      const localMap = new Map(
        localInstances
          .filter(inst => inst.uazapiInstanceId)
          .map(inst => [inst.uazapiInstanceId!, inst] as [string, typeof inst])
      );

      // 4. Combinar: instances do provider com dados locais quando disponível
      const uazInstanceIds = new Set<string>();
      const combined: any[] = [];

      // Primeiro, adicionar instâncias do UAZapi (com dados locais se existirem)
      // Formato real do UAZapi: { id, name, status, owner (telefone), token, profileName, ... }
      for (const uazInst of uazInstances) {
        // UAZapi usa 'id' diretamente, não instanceId
        const uazId = uazInst.id || uazInst.instance?.instanceId || uazInst.instanceId;
        uazInstanceIds.add(uazId);
        const local = localMap.get(uazId);

        combined.push({
          // Dados do UAZapi (formato real da API)
          uazInstanceId: uazId,
          uazInstanceName: uazInst.name || uazInst.instance?.instanceName || uazInst.instanceName,
          uazStatus: uazInst.status || uazInst.instance?.status,
          uazPhoneNumber: uazInst.owner || uazInst.instance?.phoneNumber || uazInst.phoneNumber,
          uazToken: uazInst.token,
          uazProfileName: uazInst.profileName,
          uazProfilePicUrl: uazInst.profilePicUrl,
          uazIsBusiness: uazInst.isBusiness,
          uazPlatform: uazInst.plataform,
          uazCreated: uazInst.created,
          uazUpdated: uazInst.updated,

          // Dados locais (se existir no banco Quayer)
          ...(local ? {
            id: local.id,
            name: local.name,
            organizationId: local.organizationId,
            organization: local.organization,
            createdAt: local.createdAt,
            updatedAt: local.updatedAt,
            inQuayerDB: true,
          } : {
            inQuayerDB: false,
          }),
        });
      }

      // Adicionar instâncias locais que NÃO estão no UAZapi (orphans)
      for (const local of localInstances) {
        if (local.uazapiInstanceId && uazInstanceIds.has(local.uazapiInstanceId)) {
          continue; // Já foi adicionada acima
        }

        combined.push({
          // Dados locais
          id: local.id,
          name: local.name,
          organizationId: local.organizationId,
          organization: local.organization,
          createdAt: local.createdAt,
          updatedAt: local.updatedAt,
          inQuayerDB: true,

          // Dados do UAZapi (parciais, do banco local)
          uazInstanceId: local.uazapiInstanceId,
          uazInstanceName: local.name,
          uazStatus: local.status || 'UNKNOWN',
          uazPhoneNumber: local.phoneNumber,
          uazToken: local.uazapiToken,

          // Flag indicando que não foi encontrada no UAZapi
          uazApiOrphan: true,
        });
      }

      return {
        success: true,
        data: combined,
        meta: {
          totalUAZapi: uazInstances.length,
          totalLocal: localInstances.length,
          combined: combined.length,
          uazApiError,
        },
      };
    } catch (error: any) {
      logger.error('[Orchestrator] Error listing all instances', { error: error.message });
      return {
        success: false,
        data: [],
        meta: {
          totalUAZapi: 0,
          totalLocal: 0,
          combined: 0,
          uazApiError: error.message,
        },
        error: error.message,
      };
    }
  }

  /**
   * Atualizar campos administrativos de uma instância (Admin only)
   * Usa POST /instance/updateAdminFields
   */
  async updateAdminFields(instanceId: string, data: {
    adminField01?: string;
    adminField02?: string;
  }): Promise<ProviderResponse<any>> {
    try {
      const adminToken = process.env.UAZAPI_ADMIN_TOKEN || '';
      const baseUrl = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';

      if (!adminToken) {
        return { success: false, error: 'Token admin não configurado' } as any;
      }

      const { UAZClient } = await import('../adapters/uazapi/uazapi.client');
      const uazClient = new UAZClient({ baseUrl, adminToken });

      const result = await uazClient.updateAdminFields({
        id: instanceId,
        ...data,
      });

      return { success: true, data: result } as any;
    } catch (error: any) {
      logger.error('[Orchestrator] Error updating admin fields', { error: error.message });
      return { success: false, error: error.message } as any;
    }
  }

  /**
   * Obter configuração do Webhook Global (Admin only)
   * Usa GET /globalwebhook
   */
  async getGlobalWebhook(): Promise<ProviderResponse<any>> {
    try {
      const adminToken = process.env.UAZAPI_ADMIN_TOKEN || '';
      const baseUrl = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';

      if (!adminToken) {
        return { success: false, error: 'Token admin não configurado' } as any;
      }

      const { UAZClient } = await import('../adapters/uazapi/uazapi.client');
      const uazClient = new UAZClient({ baseUrl, adminToken });

      const result = await uazClient.getGlobalWebhook();
      return { success: true, data: result } as any;
    } catch (error: any) {
      logger.error('[Orchestrator] Error getting global webhook', { error: error.message });
      return { success: false, error: error.message } as any;
    }
  }

  /**
   * Configurar Webhook Global (Admin only)
   * Usa POST /globalwebhook
   *
   * Eventos disponíveis:
   * - connection, messages, messages_update, call, contacts, presence, groups, labels, chats, history
   *
   * Filtros excludeMessages (IMPORTANTE: sempre use 'wasSentByApi' para evitar loops):
   * - wasSentByApi, wasNotSentByApi, fromMeYes, fromMeNo, isGroupYes, isGroupNo
   */
  async setGlobalWebhook(data: {
    url: string;
    events: string[];
    excludeMessages?: string[];
    addUrlEvents?: boolean;
    addUrlTypesMessages?: boolean;
  }): Promise<ProviderResponse<any>> {
    try {
      const adminToken = process.env.UAZAPI_ADMIN_TOKEN || '';
      const baseUrl = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';

      if (!adminToken) {
        return { success: false, error: 'Token admin não configurado' } as any;
      }

      const { UAZClient } = await import('../adapters/uazapi/uazapi.client');
      const uazClient = new UAZClient({ baseUrl, adminToken });

      const result = await uazClient.setGlobalWebhook(data);
      return { success: true, data: result } as any;
    } catch (error: any) {
      logger.error('[Orchestrator] Error setting global webhook', { error: error.message });
      return { success: false, error: error.message } as any;
    }
  }
}

// Singleton instance
export const providerOrchestrator = new ProviderOrchestrator({
  enableFallback: process.env.ENABLE_PROVIDER_FALLBACK === 'true',
  maxRetries: parseInt(process.env.PROVIDER_MAX_RETRIES || '3', 10),
  cacheEnabled: process.env.ENABLE_PROVIDER_CACHE !== 'false',
  statusCacheTTL: parseInt(process.env.PROVIDER_STATUS_CACHE_TTL || '5', 10), // 5 segundos para status
});
