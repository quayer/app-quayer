/**
 * Testes Unitários - UAZapi Adapter
 *
 * Testa normalização de dados e transformações do adapter
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UAZapiAdapter } from '@/lib/providers/adapters/uazapi.adapter';
import {
  ProviderType,
  MessageType,
  MessageStatus,
  InstanceStatus,
  WebhookEvent,
} from '@/lib/providers/types/normalized.types';

describe('UAZapiAdapter Unit Tests', () => {
  let adapter: UAZapiAdapter;

  beforeEach(() => {
    adapter = new UAZapiAdapter();
  });

  describe('Provider Identity', () => {
    it('deve ter providerType UAZAPI', () => {
      expect(adapter.providerType).toBe(ProviderType.UAZAPI);
    });

    it('deve ter providerName UAZapi', () => {
      expect(adapter.providerName).toBe('UAZapi');
    });
  });

  describe('normalizeWebhook', () => {
    it('deve normalizar webhook de mensagem (messages)', async () => {
      const uazPayload = {
        event: 'messages',
        instance: { name: 'test-instance-123' },
        date_time: '2025-10-16T12:00:00Z',
        data: {
          key: {
            id: 'msg-abc-123',
            remoteJid: '5511999999999@s.whatsapp.net',
            fromMe: false,
          },
          messageType: 'conversation',
          message: {
            conversation: 'Olá, teste unitário!',
          },
          messageTimestamp: 1697456400,
        },
      };

      const normalized = await adapter.normalizeWebhook(uazPayload);

      expect(normalized.event).toBe(WebhookEvent.MESSAGE_RECEIVED);
      expect(normalized.instanceId).toBe('test-instance-123');
      expect(normalized.message).toBeDefined();
      expect(normalized.message?.id).toBe('msg-abc-123');
      expect(normalized.message?.from).toBe('5511999999999');
      expect(normalized.message?.content.text).toBe('Olá, teste unitário!');
      expect(normalized.raw).toEqual(uazPayload);
    });

    it('deve normalizar webhook de atualização de mensagem (messages_update)', async () => {
      const uazPayload = {
        event: 'messages_update',
        instance: { name: 'test-instance' },
        date_time: '2025-10-16T12:00:00Z',
        data: {
          key: { id: 'msg-123' },
          update: { status: 3 },
        },
      };

      const normalized = await adapter.normalizeWebhook(uazPayload);

      expect(normalized.event).toBe(WebhookEvent.MESSAGE_STATUS_UPDATE);
      expect(normalized.instanceId).toBe('test-instance');
    });

    it('deve normalizar webhook de conexão (connection)', async () => {
      const uazPayload = {
        event: 'connection',
        instance: { name: 'test-instance' },
        date_time: '2025-10-16T12:00:00Z',
        data: {
          state: 'open',
          qrCode: 'base64-qr-code',
        },
      };

      const normalized = await adapter.normalizeWebhook(uazPayload);

      expect(normalized.event).toBe(WebhookEvent.CONNECTION_UPDATE);
      expect(normalized.instanceUpdate?.status).toBe(InstanceStatus.CONNECTED);
      expect(normalized.instanceUpdate?.qrCode).toBe('base64-qr-code');
    });

    it('deve normalizar webhook de chamada (call)', async () => {
      const uazPayload = {
        event: 'call',
        instance: { name: 'test-instance' },
        date_time: '2025-10-16T12:00:00Z',
        data: {
          id: 'call-xyz-789',
          from: '5511999999999@s.whatsapp.net',
          timestamp: 1697456400000,
        },
      };

      const normalized = await adapter.normalizeWebhook(uazPayload);

      expect(normalized.event).toBe(WebhookEvent.CALL_RECEIVED);
      expect(normalized.callUpdate?.callId).toBe('call-xyz-789');
      expect(normalized.callUpdate?.from).toBe('5511999999999@s.whatsapp.net');
      expect(normalized.callUpdate?.status).toBe('ringing');
    });

    it('deve normalizar webhook de presença (presence)', async () => {
      const uazPayload = {
        event: 'presence',
        instance: { name: 'test-instance' },
        date_time: '2025-10-16T12:00:00Z',
        data: {
          id: '5511999999999@s.whatsapp.net',
          presences: {
            '5511999999999@s.whatsapp.net': {
              lastKnownPresence: 'composing',
            },
          },
        },
      };

      const normalized = await adapter.normalizeWebhook(uazPayload);

      expect(normalized.event).toBe(WebhookEvent.PRESENCE_UPDATE);
      expect(normalized.presenceUpdate?.phoneNumber).toBe('5511999999999');
      expect(normalized.presenceUpdate?.presence).toBe('composing');
    });

    it('deve normalizar webhook de grupo (groups)', async () => {
      const uazPayload = {
        event: 'groups',
        instance: { name: 'test-instance' },
        date_time: '2025-10-16T12:00:00Z',
        data: {
          id: '123456789@g.us',
          action: 'add',
          participants: ['5511999999999@s.whatsapp.net', '5511888888888@s.whatsapp.net'],
        },
      };

      const normalized = await adapter.normalizeWebhook(uazPayload);

      expect(normalized.event).toBe(WebhookEvent.GROUP_UPDATE);
      expect(normalized.groupUpdate?.groupId).toBe('123456789@g.us');
      expect(normalized.groupUpdate?.action).toBe('participant_add');
      expect(normalized.groupUpdate?.participants).toHaveLength(2);
    });

    it('deve lidar com eventos não mapeados graciosamente', async () => {
      const uazPayload = {
        event: 'contacts',
        instance: { name: 'test-instance' },
        data: { contact: 'data' },
      };

      const normalized = await adapter.normalizeWebhook(uazPayload);

      expect(normalized).toBeDefined();
      expect(normalized.instanceId).toBe('test-instance');
      expect(normalized.raw).toEqual(uazPayload);
    });

    it('deve logar warning para evento desconhecido', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const uazPayload = {
        event: 'unknown_event_type',
        instance: { name: 'test' },
      };

      await adapter.normalizeWebhook(uazPayload);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Evento de webhook desconhecido')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('normalizeMessage (private method testing via webhook)', () => {
    it('deve normalizar mensagem de texto', async () => {
      const payload = {
        event: 'messages',
        instance: { name: 'test' },
        data: {
          key: {
            id: 'msg-123',
            remoteJid: '5511999999999@s.whatsapp.net',
            fromMe: true,
          },
          messageType: 'conversation',
          message: { conversation: 'Hello World' },
          messageTimestamp: 1697456400,
        },
      };

      const normalized = await adapter.normalizeWebhook(payload);

      expect(normalized.message?.type).toBe(MessageType.TEXT);
      expect(normalized.message?.content.text).toBe('Hello World');
      expect(normalized.message?.isFromMe).toBe(true);
    });

    it('deve normalizar mensagem de imagem com caption', async () => {
      const payload = {
        event: 'messages',
        instance: { name: 'test' },
        data: {
          key: { id: 'msg-123', remoteJid: '5511999999999@s.whatsapp.net' },
          messageType: 'imageMessage',
          message: {
            imageMessage: {
              url: 'https://example.com/image.jpg',
              mimetype: 'image/jpeg',
              caption: 'Beautiful sunset',
            },
          },
          messageTimestamp: 1697456400,
        },
      };

      const normalized = await adapter.normalizeWebhook(payload);

      expect(normalized.message?.type).toBe(MessageType.IMAGE);
      expect(normalized.message?.content.mediaUrl).toBe('https://example.com/image.jpg');
      expect(normalized.message?.content.caption).toBe('Beautiful sunset');
      expect(normalized.message?.content.mimeType).toBe('image/jpeg');
    });

    it('deve normalizar mensagem de vídeo', async () => {
      const payload = {
        event: 'messages',
        instance: { name: 'test' },
        data: {
          key: { id: 'msg-123', remoteJid: '5511999999999@s.whatsapp.net' },
          messageType: 'videoMessage',
          message: {
            videoMessage: {
              url: 'https://example.com/video.mp4',
              mimetype: 'video/mp4',
              caption: 'Check this out',
            },
          },
          messageTimestamp: 1697456400,
        },
      };

      const normalized = await adapter.normalizeWebhook(payload);

      expect(normalized.message?.type).toBe(MessageType.VIDEO);
      expect(normalized.message?.content.mediaUrl).toBe('https://example.com/video.mp4');
    });

    it('deve normalizar mensagem de áudio', async () => {
      const payload = {
        event: 'messages',
        instance: { name: 'test' },
        data: {
          key: { id: 'msg-123', remoteJid: '5511999999999@s.whatsapp.net' },
          messageType: 'audioMessage',
          message: {
            audioMessage: {
              url: 'https://example.com/audio.ogg',
              mimetype: 'audio/ogg',
            },
          },
          messageTimestamp: 1697456400,
        },
      };

      const normalized = await adapter.normalizeWebhook(payload);

      expect(normalized.message?.type).toBe(MessageType.AUDIO);
    });

    it('deve normalizar mensagem de documento', async () => {
      const payload = {
        event: 'messages',
        instance: { name: 'test' },
        data: {
          key: { id: 'msg-123', remoteJid: '5511999999999@s.whatsapp.net' },
          messageType: 'documentMessage',
          message: {
            documentMessage: {
              url: 'https://example.com/document.pdf',
              mimetype: 'application/pdf',
              fileName: 'report.pdf',
            },
          },
          messageTimestamp: 1697456400,
        },
      };

      const normalized = await adapter.normalizeWebhook(payload);

      expect(normalized.message?.type).toBe(MessageType.DOCUMENT);
      expect(normalized.message?.content.fileName).toBe('report.pdf');
    });

    it('deve identificar mensagem de grupo', async () => {
      const payload = {
        event: 'messages',
        instance: { name: 'test' },
        data: {
          key: {
            id: 'msg-123',
            remoteJid: '123456789@g.us', // Group JID
            fromMe: false,
          },
          messageType: 'conversation',
          message: { conversation: 'Group message' },
          messageTimestamp: 1697456400,
        },
      };

      const normalized = await adapter.normalizeWebhook(payload);

      expect(normalized.message?.isGroup).toBe(true);
    });

    it('deve extrair número de telefone corretamente', async () => {
      const payload = {
        event: 'messages',
        instance: { name: 'test' },
        data: {
          key: {
            id: 'msg-123',
            remoteJid: '5511987654321@s.whatsapp.net',
          },
          messageType: 'conversation',
          message: { conversation: 'Test' },
          messageTimestamp: 1697456400,
        },
      };

      const normalized = await adapter.normalizeWebhook(payload);

      expect(normalized.message?.from).toBe('5511987654321');
    });
  });

  describe('normalizeInstanceStatus', () => {
    it('deve mapear "open" para CONNECTED', async () => {
      const payload = {
        event: 'connection',
        instance: { name: 'test' },
        data: { state: 'open' },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.instanceUpdate?.status).toBe(InstanceStatus.CONNECTED);
    });

    it('deve mapear "connecting" para CONNECTING', async () => {
      const payload = {
        event: 'connection',
        instance: { name: 'test' },
        data: { state: 'connecting' },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.instanceUpdate?.status).toBe(InstanceStatus.CONNECTING);
    });

    it('deve mapear "close" para DISCONNECTED', async () => {
      const payload = {
        event: 'connection',
        instance: { name: 'test' },
        data: { state: 'close' },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.instanceUpdate?.status).toBe(InstanceStatus.DISCONNECTED);
    });

    it('deve mapear "qr" para QR_CODE', async () => {
      const payload = {
        event: 'connection',
        instance: { name: 'test' },
        data: { state: 'qr' },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.instanceUpdate?.status).toBe(InstanceStatus.QR_CODE);
    });

    it('deve usar DISCONNECTED para estado desconhecido', async () => {
      const payload = {
        event: 'connection',
        instance: { name: 'test' },
        data: { state: 'unknown_state' },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.instanceUpdate?.status).toBe(InstanceStatus.DISCONNECTED);
    });
  });

  describe('normalizeGroupAction', () => {
    it('deve mapear "create" corretamente', async () => {
      const payload = {
        event: 'groups',
        instance: { name: 'test' },
        data: { id: '123@g.us', action: 'create' },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.groupUpdate?.action).toBe('create');
    });

    it('deve mapear "add" para "participant_add"', async () => {
      const payload = {
        event: 'groups',
        instance: { name: 'test' },
        data: { id: '123@g.us', action: 'add' },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.groupUpdate?.action).toBe('participant_add');
    });

    it('deve mapear "remove" para "participant_remove"', async () => {
      const payload = {
        event: 'groups',
        instance: { name: 'test' },
        data: { id: '123@g.us', action: 'remove' },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.groupUpdate?.action).toBe('participant_remove');
    });

    it('deve mapear "promote" para "update"', async () => {
      const payload = {
        event: 'groups',
        instance: { name: 'test' },
        data: { id: '123@g.us', action: 'promote' },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.groupUpdate?.action).toBe('update');
    });

    it('deve usar "update" para ação desconhecida', async () => {
      const payload = {
        event: 'groups',
        instance: { name: 'test' },
        data: { id: '123@g.us', action: 'unknown_action' },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.groupUpdate?.action).toBe('update');
    });
  });

  describe('detectMessageType', () => {
    it('deve detectar IMAGE por mimetype image/jpeg', async () => {
      const payload = {
        event: 'messages',
        instance: { name: 'test' },
        data: {
          key: { id: 'msg-123', remoteJid: '5511999999999@s.whatsapp.net' },
          message: {
            imageMessage: {
              mimetype: 'image/jpeg',
            },
          },
          messageTimestamp: 1697456400,
        },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.message?.type).toBe(MessageType.IMAGE);
    });

    it('deve detectar VIDEO por mimetype video/mp4', async () => {
      const payload = {
        event: 'messages',
        instance: { name: 'test' },
        data: {
          key: { id: 'msg-123', remoteJid: '5511999999999@s.whatsapp.net' },
          message: {
            videoMessage: {
              mimetype: 'video/mp4',
            },
          },
          messageTimestamp: 1697456400,
        },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.message?.type).toBe(MessageType.VIDEO);
    });

    it('deve detectar AUDIO por mimetype audio/ogg', async () => {
      const payload = {
        event: 'messages',
        instance: { name: 'test' },
        data: {
          key: { id: 'msg-123', remoteJid: '5511999999999@s.whatsapp.net' },
          message: {
            audioMessage: {
              mimetype: 'audio/ogg',
            },
          },
          messageTimestamp: 1697456400,
        },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.message?.type).toBe(MessageType.AUDIO);
    });

    it('deve detectar DOCUMENT para outros mimetypes', async () => {
      const payload = {
        event: 'messages',
        instance: { name: 'test' },
        data: {
          key: { id: 'msg-123', remoteJid: '5511999999999@s.whatsapp.net' },
          message: {
            documentMessage: {
              mimetype: 'application/pdf',
            },
          },
          messageTimestamp: 1697456400,
        },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.message?.type).toBe(MessageType.DOCUMENT);
    });
  });

  describe('Preservação de Dados', () => {
    it('deve preservar payload original em raw', async () => {
      const originalPayload = {
        event: 'messages',
        instance: { name: 'test' },
        customField: 'custom value',
        data: { key: { id: 'msg-123', remoteJid: '5511999999999@s.whatsapp.net' } },
      };

      const normalized = await adapter.normalizeWebhook(originalPayload);
      expect(normalized.raw).toEqual(originalPayload);
    });

    it('deve incluir timestamp do webhook', async () => {
      const payload = {
        event: 'connection',
        instance: { name: 'test' },
        date_time: '2025-10-16T15:30:00Z',
        data: { state: 'open' },
      };

      const normalized = await adapter.normalizeWebhook(payload);
      expect(normalized.timestamp).toBeInstanceOf(Date);
    });
  });
});
