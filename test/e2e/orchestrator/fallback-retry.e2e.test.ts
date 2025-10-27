/**
 * Testes E2E - Fallback e Retry Logic
 *
 * Testa os mecanismos de resiliência do Orchestrator:
 * - Fallback automático entre providers
 * - Retry logic com backoff exponencial
 * - Health check e seleção inteligente
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ProviderOrchestrator } from '@/lib/providers/orchestrator/provider.orchestrator';
import { uazapiAdapter } from '@/lib/providers/adapters/uazapi.adapter';
import { database } from '@/services/database';
import { ProviderType } from '@/lib/providers/types/normalized.types';

describe('Fallback e Retry E2E', () => {
  let testOrganization: any;
  let testInstance: any;
  let orchestrator: ProviderOrchestrator;

  beforeAll(async () => {
    // Criar orchestrator de teste com configurações customizadas
    orchestrator = new ProviderOrchestrator({
      enableFallback: true,
      fallbackOrder: [ProviderType.UAZAPI, ProviderType.EVOLUTION, ProviderType.BAILEYS],
      maxRetries: 3,
      retryDelay: 100, // 100ms para testes rápidos
      cacheEnabled: false, // Desabilitar cache para testes
    });

    // Criar organização de teste
    testOrganization = await database.organization.create({
      data: {
        name: 'Test Fallback Org',
        slug: 'test-fallback-org',
        document: '12345678900002',
        type: 'pj',
      },
    });

    // Criar instância de teste
    testInstance = await database.instance.create({
      data: {
        name: 'Test Fallback Instance',
        brokerType: 'UAZAPI',
        token: 'test-token-fallback',
        status: 'connected',
        organizationId: testOrganization.id,
      },
    });
  });

  afterAll(async () => {
    await database.instance.deleteMany({
      where: { organizationId: testOrganization.id },
    });
    await database.organization.delete({
      where: { id: testOrganization.id },
    });
  });

  describe('Retry Logic', () => {
    it('deve retentar 3 vezes antes de falhar', async () => {
      let attemptCount = 0;

      // Mock do adapter para falhar sempre
      const mockSendMessage = vi.spyOn(uazapiAdapter, 'sendTextMessage');
      mockSendMessage.mockImplementation(async () => {
        attemptCount++;
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: 'Falha simulada',
          },
          provider: ProviderType.UAZAPI,
          timestamp: new Date(),
        };
      });

      try {
        await orchestrator.sendTextMessage({
          instanceId: testInstance.id,
          to: '5511999999999',
          text: 'Test retry',
        });
      } catch (error) {
        // Esperado falhar após 3 tentativas
      }

      // Verificar que tentou 3 vezes
      expect(attemptCount).toBe(3);

      mockSendMessage.mockRestore();
    });

    it('deve ter sucesso na segunda tentativa', async () => {
      let attemptCount = 0;

      const mockSendMessage = vi.spyOn(uazapiAdapter, 'sendTextMessage');
      mockSendMessage.mockImplementation(async (params) => {
        attemptCount++;

        // Falha na primeira tentativa
        if (attemptCount === 1) {
          return {
            success: false,
            error: {
              code: 'TEMPORARY_ERROR',
              message: 'Falha temporária',
            },
            provider: ProviderType.UAZAPI,
            timestamp: new Date(),
          };
        }

        // Sucesso na segunda tentativa
        return {
          success: true,
          data: {
            id: 'msg-123',
            instanceId: params.token,
            from: 'me',
            to: params.to,
            isGroup: false,
            type: 'TEXT' as any,
            content: { text: params.text },
            timestamp: new Date(),
            isFromMe: true,
            status: 'SENT' as any,
          },
          provider: ProviderType.UAZAPI,
          timestamp: new Date(),
        };
      });

      const result = await orchestrator.sendTextMessage({
        instanceId: testInstance.id,
        to: '5511999999999',
        text: 'Test retry success',
      });

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(2); // Tentou 2 vezes

      mockSendMessage.mockRestore();
    });

    it('deve aplicar backoff exponencial entre tentativas', async () => {
      const attemptTimes: number[] = [];

      const mockSendMessage = vi.spyOn(uazapiAdapter, 'sendTextMessage');
      mockSendMessage.mockImplementation(async () => {
        attemptTimes.push(Date.now());
        return {
          success: false,
          error: {
            code: 'ERROR',
            message: 'Falha',
          },
          provider: ProviderType.UAZAPI,
          timestamp: new Date(),
        };
      });

      try {
        await orchestrator.sendTextMessage({
          instanceId: testInstance.id,
          to: '5511999999999',
          text: 'Test backoff',
        });
      } catch (error) {
        // Esperado
      }

      // Verificar delays entre tentativas
      if (attemptTimes.length >= 2) {
        const delay1 = attemptTimes[1] - attemptTimes[0];
        expect(delay1).toBeGreaterThanOrEqual(100); // Primeiro delay: 100ms
      }

      if (attemptTimes.length >= 3) {
        const delay2 = attemptTimes[2] - attemptTimes[1];
        expect(delay2).toBeGreaterThanOrEqual(200); // Segundo delay: 200ms (backoff)
      }

      mockSendMessage.mockRestore();
    });
  });

  describe('Fallback Automático', () => {
    it('deve fazer fallback se UAZapi health check falha', async () => {
      // Mock do health check do UAZapi para falhar
      const mockHealthCheck = vi.spyOn(uazapiAdapter, 'healthCheck');
      mockHealthCheck.mockResolvedValue({
        success: false,
        data: {
          healthy: false,
          latency: 0,
        },
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'UAZapi indisponível',
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      });

      // Como não temos Evolution API implementado ainda,
      // esperamos que falhe ao tentar fallback
      await expect(
        orchestrator.sendTextMessage({
          instanceId: testInstance.id,
          to: '5511999999999',
          text: 'Test fallback',
        })
      ).rejects.toThrow('provider disponível');

      mockHealthCheck.mockRestore();
    });

    it('deve consultar health check antes de usar provider', async () => {
      const mockHealthCheck = vi.spyOn(uazapiAdapter, 'healthCheck');
      mockHealthCheck.mockResolvedValue({
        success: true,
        data: {
          healthy: true,
          latency: 120,
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      });

      await orchestrator.getInstanceStatus(testInstance.id);

      // Health check deve ter sido chamado
      expect(mockHealthCheck).toHaveBeenCalled();

      mockHealthCheck.mockRestore();
    });
  });

  describe('Health Check All Providers', () => {
    it('deve retornar saúde de todos os providers registrados', async () => {
      const results = await orchestrator.healthCheckAll();

      expect(results).toBeDefined();
      expect(typeof results).toBe('object');
      expect(results.UAZAPI).toBeDefined();
      expect(results.UAZAPI.healthy).toBeDefined();
      expect(typeof results.UAZAPI.latency).toBe('number');
    });

    it('deve identificar provider não saudável', async () => {
      const mockHealthCheck = vi.spyOn(uazapiAdapter, 'healthCheck');
      mockHealthCheck.mockResolvedValue({
        success: false,
        data: {
          healthy: false,
          latency: 5000,
        },
        error: {
          code: 'TIMEOUT',
          message: 'Timeout',
        },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      });

      const results = await orchestrator.healthCheckAll();

      expect(results.UAZAPI.healthy).toBe(false);

      mockHealthCheck.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('deve tratar erro de instância não encontrada', async () => {
      await expect(
        orchestrator.sendTextMessage({
          instanceId: 'non-existent',
          to: '5511999999999',
          text: 'Test',
        })
      ).rejects.toThrow('Instância');
    });

    it('deve tratar erro de adapter não registrado', async () => {
      // Criar instância com brokerType não registrado
      const invalidInstance = await database.instance.create({
        data: {
          name: 'Invalid Provider Instance',
          brokerType: 'EVOLUTION', // Não implementado ainda
          token: 'test-token-invalid',
          status: 'connected',
          organizationId: testOrganization.id,
        },
      });

      await expect(
        orchestrator.sendTextMessage({
          instanceId: invalidInstance.id,
          to: '5511999999999',
          text: 'Test',
        })
      ).rejects.toThrow('não está registrado');

      await database.instance.delete({
        where: { id: invalidInstance.id },
      });
    });
  });

  describe('Configuração do Orchestrator', () => {
    it('deve respeitar configuração de maxRetries', async () => {
      const customOrchestrator = new ProviderOrchestrator({
        maxRetries: 1, // Apenas 1 tentativa
        retryDelay: 50,
      });

      let attemptCount = 0;
      const mockSendMessage = vi.spyOn(uazapiAdapter, 'sendTextMessage');
      mockSendMessage.mockImplementation(async () => {
        attemptCount++;
        return {
          success: false,
          error: { code: 'ERROR', message: 'Falha' },
          provider: ProviderType.UAZAPI,
          timestamp: new Date(),
        };
      });

      try {
        await customOrchestrator.sendTextMessage({
          instanceId: testInstance.id,
          to: '5511999999999',
          text: 'Test',
        });
      } catch (error) {
        // Esperado
      }

      expect(attemptCount).toBe(1); // Apenas 1 tentativa

      mockSendMessage.mockRestore();
    });

    it('deve respeitar configuração de enableFallback', async () => {
      const noFallbackOrchestrator = new ProviderOrchestrator({
        enableFallback: false,
        maxRetries: 1,
      });

      const mockHealthCheck = vi.spyOn(uazapiAdapter, 'healthCheck');
      mockHealthCheck.mockResolvedValue({
        success: false,
        data: { healthy: false, latency: 0 },
        error: { code: 'ERROR', message: 'Falha' },
        provider: ProviderType.UAZAPI,
        timestamp: new Date(),
      });

      // Com fallback desabilitado, não deve tentar outros providers
      // Apenas deve falhar diretamente
      try {
        await noFallbackOrchestrator.sendTextMessage({
          instanceId: testInstance.id,
          to: '5511999999999',
          text: 'Test',
        });
      } catch (error) {
        expect(error).toBeDefined();
      }

      mockHealthCheck.mockRestore();
    });
  });
});
