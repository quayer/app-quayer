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
      cacheTTL: config?.cacheTTL ?? 300, // 5 minutos
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

    // 2. Obter brokerType da instância
    const providerType = (instance.brokerType as ProviderType) || ProviderType.UAZAPI;

    // 3. Buscar adapter correspondente
    const adapter = this.adapters.get(providerType);

    if (!adapter) {
      throw new Error(`Adapter ${providerType} não está registrado`);
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
      () => adapter.sendTextMessage({ ...params, token: instance.token }),
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
      () => adapter.sendMediaMessage({ ...params, token: instance.token }),
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
      () => adapter.sendButtonsMessage({ ...params, token: instance.token }),
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
      () => adapter.sendListMessage({ ...params, token: instance.token }),
      'sendListMessage'
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

    return this.executeWithRetry(
      () => adapter.connectInstance({ token: instance.token, instanceId }),
      'connectInstance'
    );
  }

  /**
   * Obter status da instância
   */
  async getInstanceStatus(instanceId: string) {
    const adapter = await this.getAdapterForInstance(instanceId);

    const instance = await database.instance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    // Tentar cache primeiro
    if (this.config.cacheEnabled) {
      const cacheKey = `instance:status:${instanceId}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        logger.debug('[Orchestrator] Status retornado do cache', { instanceId });
        return JSON.parse(cached);
      }

      // Se não tem cache, buscar e cachear
      const result = await adapter.getInstanceStatus({ token: instance.token });

      if (result.success) {
        await redis.setex(cacheKey, this.config.cacheTTL, JSON.stringify(result));
      }

      return result;
    }

    return adapter.getInstanceStatus({ token: instance.token });
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
}

// Singleton instance
export const providerOrchestrator = new ProviderOrchestrator({
  enableFallback: process.env.ENABLE_PROVIDER_FALLBACK === 'true',
  maxRetries: parseInt(process.env.PROVIDER_MAX_RETRIES || '3', 10),
  cacheEnabled: process.env.ENABLE_PROVIDER_CACHE !== 'false',
});
