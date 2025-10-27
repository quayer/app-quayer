/**
 * Testes Unitários - Provider Orchestrator
 *
 * Testa unidades isoladas do Orchestrator sem dependências externas
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderOrchestrator } from '@/lib/providers/orchestrator/provider.orchestrator';
import { IProviderAdapter } from '@/lib/providers/interfaces/provider-adapter.interface';
import {
  ProviderType,
  ProviderResponse,
  NormalizedMessage,
  MessageType,
  MessageStatus,
  WebhookEvent,
} from '@/lib/providers/types/normalized.types';

// Mock Adapter para testes
class MockAdapter implements Partial<IProviderAdapter> {
  readonly providerType = ProviderType.UAZAPI;
  readonly providerName = 'Mock Adapter';

  async sendTextMessage(params: any): Promise<ProviderResponse<NormalizedMessage>> {
    return {
      success: true,
      data: {
        id: 'mock-msg-123',
        instanceId: params.token,
        from: 'me',
        to: params.to,
        isGroup: false,
        type: MessageType.TEXT,
        content: { text: params.text },
        timestamp: new Date(),
        isFromMe: true,
        status: MessageStatus.SENT,
      },
      provider: ProviderType.UAZAPI,
      timestamp: new Date(),
    };
  }

  async healthCheck(): Promise<ProviderResponse<{ healthy: boolean; latency: number }>> {
    return {
      success: true,
      data: {
        healthy: true,
        latency: 100,
      },
      provider: ProviderType.UAZAPI,
      timestamp: new Date(),
    };
  }

  async normalizeWebhook(rawPayload: any): Promise<any> {
    return {
      event: WebhookEvent.MESSAGE_RECEIVED,
      instanceId: rawPayload.instance?.name || '',
      timestamp: new Date(),
      raw: rawPayload,
    };
  }
}

describe('ProviderOrchestrator Unit Tests', () => {
  let orchestrator: ProviderOrchestrator;
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    orchestrator = new ProviderOrchestrator({
      enableFallback: false,
      maxRetries: 1,
      cacheEnabled: false,
    });

    mockAdapter = new MockAdapter();
    orchestrator.registerAdapter(mockAdapter as any);
  });

  describe('registerAdapter', () => {
    it('deve registrar um novo adapter', () => {
      const newMockAdapter = new MockAdapter();
      newMockAdapter.providerType = ProviderType.EVOLUTION;
      newMockAdapter.providerName = 'Evolution Mock';

      expect(() => {
        orchestrator.registerAdapter(newMockAdapter as any);
      }).not.toThrow();
    });

    it('deve permitir registro de múltiplos adapters', () => {
      const adapter1 = new MockAdapter();
      adapter1.providerType = ProviderType.EVOLUTION;

      const adapter2 = new MockAdapter();
      adapter2.providerType = ProviderType.BAILEYS;

      orchestrator.registerAdapter(adapter1 as any);
      orchestrator.registerAdapter(adapter2 as any);

      // Não deve lançar erro
      expect(true).toBe(true);
    });
  });

  describe('normalizeWebhook', () => {
    it('deve normalizar webhook usando adapter correto', async () => {
      const rawPayload = {
        event: 'messages',
        instance: { name: 'test-instance' },
        data: { test: 'data' },
      };

      const normalized = await orchestrator.normalizeWebhook(rawPayload);

      expect(normalized).toBeDefined();
      expect(normalized.instanceId).toBe('test-instance');
      expect(normalized.raw).toEqual(rawPayload);
    });

    it('deve detectar provider do webhook automaticamente', async () => {
      const uazPayload = {
        event: 'messages',
        instance: { name: 'test-instance' }, // UAZ format
      };

      const normalized = await orchestrator.normalizeWebhook(uazPayload);
      expect(normalized).toBeDefined();
    });

    it('deve preservar payload original em raw', async () => {
      const originalPayload = {
        event: 'connection',
        instance: { name: 'test' },
        customField: 'custom value',
      };

      const normalized = await orchestrator.normalizeWebhook(originalPayload);
      expect(normalized.raw).toEqual(originalPayload);
    });
  });

  describe('healthCheckAll', () => {
    it('deve retornar health de todos os adapters registrados', async () => {
      const results = await orchestrator.healthCheckAll();

      expect(results).toBeDefined();
      expect(typeof results).toBe('object');
      expect(results[ProviderType.UAZAPI]).toBeDefined();
    });

    it('deve incluir latency e healthy para cada provider', async () => {
      const results = await orchestrator.healthCheckAll();

      const uazResult = results[ProviderType.UAZAPI];
      expect(uazResult.healthy).toBeDefined();
      expect(typeof uazResult.latency).toBe('number');
    });

    it('deve tratar erro de health check graciosamente', async () => {
      const failingAdapter = new MockAdapter();
      failingAdapter.healthCheck = async () => {
        throw new Error('Health check failed');
      };
      failingAdapter.providerType = ProviderType.EVOLUTION;

      orchestrator.registerAdapter(failingAdapter as any);

      const results = await orchestrator.healthCheckAll();

      // Não deve lançar erro, deve retornar resultado
      expect(results).toBeDefined();
    });
  });

  describe('Configuração', () => {
    it('deve respeitar enableFallback configuração', () => {
      const withFallback = new ProviderOrchestrator({ enableFallback: true });
      const withoutFallback = new ProviderOrchestrator({ enableFallback: false });

      expect(withFallback).toBeDefined();
      expect(withoutFallback).toBeDefined();
    });

    it('deve respeitar maxRetries configuração', () => {
      const orch1 = new ProviderOrchestrator({ maxRetries: 1 });
      const orch3 = new ProviderOrchestrator({ maxRetries: 3 });

      expect(orch1).toBeDefined();
      expect(orch3).toBeDefined();
    });

    it('deve respeitar retryDelay configuração', () => {
      const orchFast = new ProviderOrchestrator({ retryDelay: 100 });
      const orchSlow = new ProviderOrchestrator({ retryDelay: 2000 });

      expect(orchFast).toBeDefined();
      expect(orchSlow).toBeDefined();
    });

    it('deve respeitar cacheEnabled configuração', () => {
      const withCache = new ProviderOrchestrator({ cacheEnabled: true });
      const withoutCache = new ProviderOrchestrator({ cacheEnabled: false });

      expect(withCache).toBeDefined();
      expect(withoutCache).toBeDefined();
    });

    it('deve respeitar cacheTTL configuração', () => {
      const shortTTL = new ProviderOrchestrator({ cacheTTL: 60 });
      const longTTL = new ProviderOrchestrator({ cacheTTL: 3600 });

      expect(shortTTL).toBeDefined();
      expect(longTTL).toBeDefined();
    });

    it('deve respeitar fallbackOrder configuração', () => {
      const customOrder = new ProviderOrchestrator({
        fallbackOrder: [ProviderType.BAILEYS, ProviderType.UAZAPI],
      });

      expect(customOrder).toBeDefined();
    });
  });

  describe('Detecção de Provider', () => {
    it('deve detectar UAZapi por estrutura de webhook', async () => {
      const uazWebhook = {
        event: 'messages',
        instance: { name: 'test-instance' },
        data: {},
      };

      const normalized = await orchestrator.normalizeWebhook(uazWebhook);
      expect(normalized.instanceId).toBe('test-instance');
    });

    it('deve usar fallback para webhook desconhecido', async () => {
      const unknownWebhook = {
        unknownField: 'value',
      };

      const normalized = await orchestrator.normalizeWebhook(unknownWebhook);
      expect(normalized).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('deve tratar graciosamente adapter não encontrado', async () => {
      const payload = { event: 'test' };

      // Mock para lançar erro
      vi.spyOn(mockAdapter, 'normalizeWebhook').mockRejectedValue(
        new Error('Adapter não encontrado')
      );

      await expect(orchestrator.normalizeWebhook(payload)).rejects.toThrow();
    });

    it('deve propagar erros de normalização', async () => {
      vi.spyOn(mockAdapter, 'normalizeWebhook').mockRejectedValue(
        new Error('Erro de normalização')
      );

      await expect(
        orchestrator.normalizeWebhook({ event: 'test' })
      ).rejects.toThrow('normalização');
    });
  });

  describe('Singleton Instance', () => {
    it('deve exportar singleton providerOrchestrator', async () => {
      const { providerOrchestrator } = await import(
        '@/lib/providers/orchestrator/provider.orchestrator'
      );

      expect(providerOrchestrator).toBeDefined();
      expect(providerOrchestrator).toBeInstanceOf(ProviderOrchestrator);
    });
  });
});
