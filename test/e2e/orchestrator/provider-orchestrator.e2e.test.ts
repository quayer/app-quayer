/**
 * Testes E2E - Provider Orchestrator
 *
 * Testa o fluxo completo do sistema de orquestração:
 * - Envio de mensagens
 * - Recebimento de webhooks
 * - Normalização de dados
 * - Fallback automático
 * - Retry logic
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { providerOrchestrator } from '@/lib/providers/orchestrator/provider.orchestrator';
import { database } from '@/services/database';
import { WebhookEvent, ProviderType, MessageType } from '@/lib/providers/types/normalized.types';

describe('Provider Orchestrator E2E', () => {
  let testInstance: any;
  let testOrganization: any;

  beforeAll(async () => {
    // Criar organização de teste
    testOrganization = await database.organization.create({
      data: {
        name: 'Test Organization',
        slug: 'test-org-orchestrator',
        document: '12345678900001',
        type: 'pj',
      },
    });

    // Criar instância de teste
    testInstance = await database.instance.create({
      data: {
        name: 'Test Instance',
        brokerType: 'UAZAPI',
        token: 'test-token-123',
        status: 'connected',
        organizationId: testOrganization.id,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await database.instance.deleteMany({
      where: { organizationId: testOrganization.id },
    });
    await database.organization.delete({
      where: { id: testOrganization.id },
    });
  });

  describe('Envio de Mensagens', () => {
    it('deve enviar mensagem de texto via orchestrator', async () => {
      const result = await providerOrchestrator.sendTextMessage({
        instanceId: testInstance.id,
        to: '5511999999999',
        text: 'Teste E2E Orchestrator',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe(ProviderType.UAZAPI);
      expect(result.data).toBeDefined();
      expect(result.data?.type).toBe(MessageType.TEXT);
      expect(result.data?.content.text).toBe('Teste E2E Orchestrator');
    });

    it('deve enviar mensagem de mídia via orchestrator', async () => {
      const result = await providerOrchestrator.sendMediaMessage({
        instanceId: testInstance.id,
        to: '5511999999999',
        mediaUrl: 'https://example.com/image.jpg',
        caption: 'Teste de imagem',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe(ProviderType.UAZAPI);
      expect(result.data?.type).toBe(MessageType.IMAGE);
      expect(result.data?.content.caption).toBe('Teste de imagem');
    });

    it('deve enviar mensagem com botões via orchestrator', async () => {
      const result = await providerOrchestrator.sendButtonsMessage({
        instanceId: testInstance.id,
        to: '5511999999999',
        text: 'Escolha uma opção:',
        buttons: [
          { id: '1', text: 'Opção 1' },
          { id: '2', text: 'Opção 2' },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe(MessageType.BUTTONS);
      expect(result.data?.content.buttons).toHaveLength(2);
    });

    it('deve enviar mensagem com lista via orchestrator', async () => {
      const result = await providerOrchestrator.sendListMessage({
        instanceId: testInstance.id,
        to: '5511999999999',
        text: 'Escolha um item:',
        buttonText: 'Ver opções',
        sections: [
          {
            title: 'Seção 1',
            rows: [
              { id: '1', title: 'Item 1', description: 'Descrição 1' },
              { id: '2', title: 'Item 2', description: 'Descrição 2' },
            ],
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe(MessageType.LIST);
    });
  });

  describe('Normalização de Webhooks', () => {
    it('deve normalizar webhook de mensagem (messages)', async () => {
      const uazWebhook = {
        event: 'messages',
        instance: { name: testInstance.id },
        date_time: new Date().toISOString(),
        data: {
          key: {
            id: 'msg-123',
            remoteJid: '5511999999999@s.whatsapp.net',
            fromMe: false,
          },
          messageType: 'conversation',
          message: {
            conversation: 'Olá, teste!',
          },
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      };

      const normalized = await providerOrchestrator.normalizeWebhook(uazWebhook);

      expect(normalized.event).toBe(WebhookEvent.MESSAGE_RECEIVED);
      expect(normalized.instanceId).toBe(testInstance.id);
      expect(normalized.message).toBeDefined();
      expect(normalized.message?.id).toBe('msg-123');
      expect(normalized.message?.type).toBe(MessageType.TEXT);
      expect(normalized.message?.content.text).toBe('Olá, teste!');
      expect(normalized.message?.from).toBe('5511999999999');
    });

    it('deve normalizar webhook de atualização de mensagem (messages_update)', async () => {
      const uazWebhook = {
        event: 'messages_update',
        instance: { name: testInstance.id },
        date_time: new Date().toISOString(),
        data: {
          key: { id: 'msg-123' },
          update: { status: 3 }, // 3 = READ
        },
      };

      const normalized = await providerOrchestrator.normalizeWebhook(uazWebhook);

      expect(normalized.event).toBe(WebhookEvent.MESSAGE_STATUS_UPDATE);
      expect(normalized.instanceId).toBe(testInstance.id);
    });

    it('deve normalizar webhook de conexão (connection)', async () => {
      const uazWebhook = {
        event: 'connection',
        instance: { name: testInstance.id },
        date_time: new Date().toISOString(),
        data: {
          state: 'open',
        },
      };

      const normalized = await providerOrchestrator.normalizeWebhook(uazWebhook);

      expect(normalized.event).toBe(WebhookEvent.CONNECTION_UPDATE);
      expect(normalized.instanceUpdate?.status).toBe('CONNECTED');
    });

    it('deve normalizar webhook de chamada (call)', async () => {
      const uazWebhook = {
        event: 'call',
        instance: { name: testInstance.id },
        date_time: new Date().toISOString(),
        data: {
          id: 'call-123',
          from: '5511999999999@s.whatsapp.net',
          timestamp: Date.now(),
        },
      };

      const normalized = await providerOrchestrator.normalizeWebhook(uazWebhook);

      expect(normalized.event).toBe(WebhookEvent.CALL_RECEIVED);
      expect(normalized.callUpdate?.callId).toBe('call-123');
      expect(normalized.callUpdate?.from).toBe('5511999999999@s.whatsapp.net');
    });

    it('deve normalizar webhook de presença (presence)', async () => {
      const uazWebhook = {
        event: 'presence',
        instance: { name: testInstance.id },
        date_time: new Date().toISOString(),
        data: {
          id: '5511999999999@s.whatsapp.net',
          presences: {
            '5511999999999@s.whatsapp.net': {
              lastKnownPresence: 'composing',
            },
          },
        },
      };

      const normalized = await providerOrchestrator.normalizeWebhook(uazWebhook);

      expect(normalized.event).toBe(WebhookEvent.PRESENCE_UPDATE);
      expect(normalized.presenceUpdate?.phoneNumber).toBe('5511999999999');
      expect(normalized.presenceUpdate?.presence).toBe('composing');
    });

    it('deve normalizar webhook de grupo (groups)', async () => {
      const uazWebhook = {
        event: 'groups',
        instance: { name: testInstance.id },
        date_time: new Date().toISOString(),
        data: {
          id: '123456789@g.us',
          action: 'add',
          participants: ['5511999999999@s.whatsapp.net'],
        },
      };

      const normalized = await providerOrchestrator.normalizeWebhook(uazWebhook);

      expect(normalized.event).toBe(WebhookEvent.GROUP_UPDATE);
      expect(normalized.groupUpdate?.groupId).toBe('123456789@g.us');
      expect(normalized.groupUpdate?.action).toBe('participant_add');
      expect(normalized.groupUpdate?.participants).toContain('5511999999999@s.whatsapp.net');
    });

    it('deve preservar payload original em raw', async () => {
      const uazWebhook = {
        event: 'messages',
        instance: { name: testInstance.id },
        data: { test: 'data' },
      };

      const normalized = await providerOrchestrator.normalizeWebhook(uazWebhook);

      expect(normalized.raw).toEqual(uazWebhook);
    });
  });

  describe('Seleção de Provider', () => {
    it('deve selecionar UAZapiAdapter para instância com brokerType UAZAPI', async () => {
      const result = await providerOrchestrator.sendTextMessage({
        instanceId: testInstance.id,
        to: '5511999999999',
        text: 'Test',
      });

      expect(result.provider).toBe(ProviderType.UAZAPI);
    });

    it('deve lançar erro se instância não existe', async () => {
      await expect(
        providerOrchestrator.sendTextMessage({
          instanceId: 'non-existent-id',
          to: '5511999999999',
          text: 'Test',
        })
      ).rejects.toThrow('Instância');
    });
  });

  describe('Status da Instância', () => {
    it('deve obter status da instância via orchestrator', async () => {
      const result = await providerOrchestrator.getInstanceStatus(testInstance.id);

      expect(result.success).toBe(true);
      expect(result.data?.id).toBeDefined();
      expect(result.data?.provider).toBe(ProviderType.UAZAPI);
    });
  });

  describe('Health Check', () => {
    it('deve fazer health check de todos os providers', async () => {
      const results = await providerOrchestrator.healthCheckAll();

      expect(results).toBeDefined();
      expect(results.UAZAPI).toBeDefined();
      expect(results.UAZAPI.healthy).toBeDefined();
      expect(results.UAZAPI.latency).toBeDefined();
    });
  });

  describe('Detecção de Provider por Webhook', () => {
    it('deve detectar UAZapi por payload com event e instance.name', async () => {
      const uazWebhook = {
        event: 'messages',
        instance: { name: testInstance.id },
        data: {},
      };

      const normalized = await providerOrchestrator.normalizeWebhook(uazWebhook);
      expect(normalized.instanceId).toBe(testInstance.id);
    });
  });
});
