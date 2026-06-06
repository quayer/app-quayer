import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedWebhook } from '@/lib/providers/core/provider.types';

const database = vi.hoisted(() => ({
  message: {
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  chatSession: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  agentDeployment: {
    findFirst: vi.fn(),
  },
}));

const getCachedConnection = vi.hoisted(() => vi.fn());
const processAgentMessage = vi.hoisted(() => vi.fn());
const sendText = vi.hoisted(() => vi.fn());
const markBotMessage = vi.hoisted(() => vi.fn());
const isBotEchoAny = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/server/services/database', () => ({ database }));

vi.mock('@/server/services/logger', () => ({ logger }));

vi.mock('@/lib/webhook', () => ({
  getCachedConnection,
  sanitizeContent: (content: string) => content,
}));

vi.mock('@/server/ai-module/ai-agents/agent-runtime.service', () => ({
  processAgentMessage,
}));

vi.mock('@/lib/providers', () => ({
  orchestrator: { sendText },
}));

vi.mock('@/server/communication/services/bot-echo-guard.service', () => ({
  isBotEchoAny,
  markBotMessage,
}));

function makeWebhook(): NormalizedWebhook {
  return {
    event: 'message.received',
    instanceId: 'conn_1',
    timestamp: new Date('2026-05-15T12:00:00.000Z'),
    data: {
      from: '5511999999999',
      contactName: 'Customer',
      message: {
        id: 'wamid.inbound_1',
        type: 'text',
        content: 'hello',
        timestamp: new Date('2026-05-15T12:00:00.000Z'),
      },
    },
  };
}

describe('webhook processor CloudAPI agent dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getCachedConnection.mockResolvedValue({
      id: 'conn_1',
      organizationId: 'org_1',
      status: 'CONNECTED',
    });

    database.chatSession.findFirst.mockResolvedValue({
      id: 'session_1',
      aiEnabled: true,
      aiBlockedUntil: null,
      aiAgentConfigId: null,
    });

    database.agentDeployment.findFirst.mockResolvedValue({
      agentConfigId: 'agent_config_1',
    });

    database.message.upsert.mockResolvedValue({ id: 'message_1' });
    database.chatSession.update.mockResolvedValue({ id: 'session_1' });

    processAgentMessage.mockResolvedValue({
      text: 'AI reply',
      model: 'gpt-4o-mini',
      provider: 'openai',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
      cost: {
        inputCost: 0.1,
        outputCost: 0.2,
        totalCost: 0.3,
      },
      latencyMs: 123,
      toolCalls: [],
    });

    sendText.mockResolvedValue({
      messageId: 'wamid.outbound_1',
      status: 'sent',
      timestamp: new Date('2026-05-15T12:00:01.000Z'),
    });

    markBotMessage.mockResolvedValue(true);
    isBotEchoAny.mockResolvedValue(false);
  });

  it('saves inbound, dispatches the attached agent, sends CloudAPI text, and persists bot echo', async () => {
    const { processWebhookEvent } = await import('@/lib/webhook/processor');

    await processWebhookEvent(makeWebhook(), 'cloudapi');

    expect(isBotEchoAny).toHaveBeenCalledWith('org_1', ['wamid.inbound_1']);

    expect(database.message.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { waMessageId: 'wamid.inbound_1' },
        create: expect.objectContaining({
          direction: 'INBOUND',
          content: 'hello',
          sessionId: 'session_1',
        }),
      })
    );

    expect(processAgentMessage).toHaveBeenCalledWith({
      agentConfigId: 'agent_config_1',
      sessionId: 'session_1',
      contactId: '5511999999999',
      connectionId: 'conn_1',
      organizationId: 'org_1',
      messageContent: 'hello',
      inboundMessageId: 'wamid.inbound_1',
    });

    expect(sendText).toHaveBeenCalledWith('conn_1', 'cloudapi', {
      to: '5511999999999',
      text: expect.stringContaining('AI reply'),
    });

    expect(database.message.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { waMessageId: 'wamid.outbound_1' },
        create: expect.objectContaining({
          direction: 'OUTBOUND',
          author: 'AI',
          content: 'AI reply',
          status: 'sent',
          aiAgentId: 'agent_config_1',
        }),
      })
    );
    expect(markBotMessage).toHaveBeenCalledWith('org_1', 'wamid.outbound_1');
  });

  it('keeps webhook processing non-fatal when agent dispatch fails', async () => {
    const { processWebhookEvent } = await import('@/lib/webhook/processor');
    processAgentMessage.mockRejectedValueOnce(new Error('runtime unavailable'));

    await expect(processWebhookEvent(makeWebhook(), 'cloudapi')).resolves.toBeUndefined();

    expect(sendText).not.toHaveBeenCalled();
    expect(markBotMessage).not.toHaveBeenCalled();
  });
});

function makeStatusWebhook(
  status: 'sent' | 'delivered' | 'read' | 'failed'
): NormalizedWebhook {
  return {
    event: 'message.updated',
    instanceId: 'phone_number_1',
    timestamp: new Date('2026-05-15T12:00:05.000Z'),
    data: {
      message: {
        id: 'wamid.outbound_1',
        type: 'text',
        content: '',
        timestamp: new Date('2026-05-15T12:00:05.000Z'),
      },
      messageStatus: status,
    },
  };
}

describe('webhook processor CloudAPI delivery status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.message.updateMany.mockResolvedValue({ count: 1 });
  });

  it('marks delivered with deliveredAt, advancing only from pending/sent', async () => {
    const { processWebhookEvent } = await import('@/lib/webhook/processor');

    await processWebhookEvent(makeStatusWebhook('delivered'), 'cloudapi');

    expect(database.message.updateMany).toHaveBeenCalledWith({
      where: {
        waMessageId: 'wamid.outbound_1',
        status: { in: ['pending', 'sent'] },
      },
      data: {
        status: 'delivered',
        deliveredAt: new Date('2026-05-15T12:00:05.000Z'),
      },
    });
  });

  it('marks read with readAt, allowed to advance from delivered', async () => {
    const { processWebhookEvent } = await import('@/lib/webhook/processor');

    await processWebhookEvent(makeStatusWebhook('read'), 'cloudapi');

    expect(database.message.updateMany).toHaveBeenCalledWith({
      where: {
        waMessageId: 'wamid.outbound_1',
        status: { in: ['pending', 'sent', 'delivered'] },
      },
      data: {
        status: 'read',
        readAt: new Date('2026-05-15T12:00:05.000Z'),
      },
    });
  });

  it('never downgrades: a late delivered cannot overwrite a read row (guard excludes read/delivered)', async () => {
    const { processWebhookEvent } = await import('@/lib/webhook/processor');

    await processWebhookEvent(makeStatusWebhook('delivered'), 'cloudapi');

    const where = database.message.updateMany.mock.calls[0][0].where;
    expect(where.status.in).not.toContain('read');
    expect(where.status.in).not.toContain('delivered');
  });

  it('is fail-open: a DB error during status update does not throw', async () => {
    const { processWebhookEvent } = await import('@/lib/webhook/processor');
    database.message.updateMany.mockRejectedValueOnce(new Error('db down'));

    await expect(
      processWebhookEvent(makeStatusWebhook('delivered'), 'cloudapi')
    ).resolves.toBeUndefined();
  });
});
