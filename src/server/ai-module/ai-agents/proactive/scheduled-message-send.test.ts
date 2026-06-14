/**
 * scheduled-message-send.test — cobre o CONTROLE DE FLUXO do handler puro
 * `runScheduledMessageSend` (F2b): gates de elegibilidade, compliance da janela
 * 24h, idempotência e fail-safe. As deps de IO são mockadas com `vi.fn()` — a
 * qualidade do texto gerado e a resolução real do agente são validadas no
 * harness local/LLM, não aqui.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  runScheduledMessageSend,
  type ProactiveSendDeps,
  type ProactiveScheduledRow,
  type ProactiveEligibilitySnapshot,
} from './scheduled-message-send'
import type { ScheduledMessageJobPayload } from '@/server/services/jobs/scheduled-message.queue'
import { deriveDispatchKey } from '@/server/communication/services/outbound-dispatch.pure'

// ── Fixtures ────────────────────────────────────────────────────────────────

const ORG = 'org-1'
const SCHEDULED_ID = 'sched-1'
const NOW = new Date('2026-06-13T12:00:00.000Z')

const PAYLOAD: ScheduledMessageJobPayload = {
  scheduledMessageId: SCHEDULED_ID,
  organizationId: ORG,
  connectionId: 'conn-1',
  contactPhone: '5511999999999',
  sessionId: 'sess-1',
  scheduledAt: NOW.toISOString(),
  reason: 'lead_idle',
}

function makeRow(overrides: Partial<ProactiveScheduledRow> = {}): ProactiveScheduledRow {
  return {
    id: SCHEDULED_ID,
    status: 'pending',
    contactPhone: '5511999999999',
    connectionId: 'conn-1',
    sessionId: 'sess-1',
    reason: 'lead_idle',
    messageGoal: 'retomar contato',
    maxAttempts: 1,
    ...overrides,
  }
}

/** Janela 24h ABERTA (expira no futuro) + IA ligada → canSendProactive libera. */
function eligibleSnapshot(
  overrides: Partial<ProactiveEligibilitySnapshot> = {},
): ProactiveEligibilitySnapshot {
  return {
    optOut: null,
    session: {
      whatsappWindowExpiresAt: new Date(NOW.getTime() + 60 * 60 * 1000), // +1h
      aiEnabled: true,
      aiBlockedUntil: null,
      status: 'OPEN',
    },
    consecutiveProactiveWithoutReply: 0,
    hasApprovedTemplate: false,
    ...overrides,
  }
}

/** Deps com todas as funções como spies; comportamentos default = happy path. */
function makeDeps(overrides: Partial<ProactiveSendDeps> = {}): ProactiveSendDeps {
  return {
    loadPending: vi.fn(async () => makeRow()),
    loadEligibility: vi.fn(async () => eligibleSnapshot()),
    resolveText: vi.fn(async () => 'Oi! Passando para retomar nosso contato.'),
    send: vi.fn(async () => ({ blocksSent: 1, errors: [] })),
    sendTemplate: vi.fn(async () => ({ messageId: 'wamid.HSM123' })),
    markSent: vi.fn(async () => {}),
    markCancelled: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    ...overrides,
  }
}

/** Snapshot fora da janela 24h COM HSM aprovado configurado (templateName resolvido). */
function outsideWindowWithTemplate(
  overrides: Partial<ProactiveEligibilitySnapshot> = {},
): ProactiveEligibilitySnapshot {
  return eligibleSnapshot({
    session: {
      whatsappWindowExpiresAt: new Date(NOW.getTime() - 3600_000), // expirou
      aiEnabled: true,
      aiBlockedUntil: null,
      status: 'OPEN',
    },
    hasApprovedTemplate: true,
    templateName: 'followup_proativo',
    languageCode: 'pt_BR',
    ...overrides,
  })
}

// ── Testes ──────────────────────────────────────────────────────────────────

describe('runScheduledMessageSend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('já-não-pending → skipped (nada chamado além do load)', async () => {
    const deps = makeDeps({
      loadPending: vi.fn(async () => makeRow({ status: 'sent' })),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'skipped' })
    expect(deps.loadEligibility).not.toHaveBeenCalled()
    expect(deps.resolveText).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.markSent).not.toHaveBeenCalled()
    expect(deps.markCancelled).not.toHaveBeenCalled()
    expect(deps.markFailed).not.toHaveBeenCalled()
  })

  it('row inexistente → skipped', async () => {
    const deps = makeDeps({ loadPending: vi.fn(async () => null) })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'skipped' })
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('opted_out → cancelled (sem enviar)', async () => {
    const deps = makeDeps({
      loadEligibility: vi.fn(async () =>
        eligibleSnapshot({ optOut: { phone: '5511999999999' } }),
      ),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'cancelled', reason: 'opted_out' })
    expect(deps.markCancelled).toHaveBeenCalledWith(SCHEDULED_ID, ORG, 'opted_out')
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.markSent).not.toHaveBeenCalled()
  })

  it('suppressed (IA desligada) → cancelled', async () => {
    const deps = makeDeps({
      loadEligibility: vi.fn(async () =>
        eligibleSnapshot({
          session: {
            whatsappWindowExpiresAt: new Date(NOW.getTime() + 3600_000),
            aiEnabled: false,
          },
        }),
      ),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'cancelled', reason: 'suppressed' })
    expect(deps.markCancelled).toHaveBeenCalledWith(SCHEDULED_ID, ORG, 'suppressed')
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('anti_spam (atingiu maxAttempts) → cancelled', async () => {
    const deps = makeDeps({
      loadPending: vi.fn(async () => makeRow({ maxAttempts: 1 })),
      loadEligibility: vi.fn(async () =>
        eligibleSnapshot({ consecutiveProactiveWithoutReply: 1 }),
      ),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'cancelled', reason: 'anti_spam' })
    expect(deps.markCancelled).toHaveBeenCalledWith(SCHEDULED_ID, ORG, 'anti_spam')
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('needsTemplate SEM templateName resolvido → cancelled outside_window_no_template SEM enviar', async () => {
    // Fora da janela (expira no passado) MAS hasApprovedTemplate:true e SEM
    // templateName (env não configurado / catálogo vazio) → canSendProactive
    // devolve allowed:true + needsTemplate:true, mas sem HSM resolvido o handler
    // cancela 'outside_window_no_template' (fail-safe). resolveText NUNCA é chamado.
    const deps = makeDeps({
      loadEligibility: vi.fn(async () =>
        eligibleSnapshot({
          session: {
            whatsappWindowExpiresAt: new Date(NOW.getTime() - 3600_000), // expirou
            aiEnabled: true,
          },
          hasApprovedTemplate: true,
          // templateName ausente
        }),
      ),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'cancelled', reason: 'needs_template' })
    expect(deps.markCancelled).toHaveBeenCalledWith(
      SCHEDULED_ID,
      ORG,
      'outside_window_no_template',
    )
    expect(deps.sendTemplate).not.toHaveBeenCalled()
    expect(deps.resolveText).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('needsTemplate SEM deps.sendTemplate (provider ≠ Cloud API) → cancelled (fail-safe)', async () => {
    // Mesmo com templateName resolvido, se a dep sendTemplate não existe (ex.:
    // WhatsApp Web/UAZ, que não envia HSM) → cancela, nunca tenta texto cru.
    const deps = makeDeps({
      sendTemplate: undefined,
      loadEligibility: vi.fn(async () => outsideWindowWithTemplate()),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'cancelled', reason: 'needs_template' })
    expect(deps.markCancelled).toHaveBeenCalledWith(
      SCHEDULED_ID,
      ORG,
      'outside_window_no_template',
    )
    expect(deps.resolveText).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('needsTemplate + HSM aprovado → sendTemplate enviado → markSent (sent/template)', async () => {
    const deps = makeDeps({
      loadEligibility: vi.fn(async () => outsideWindowWithTemplate()),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'sent', reason: 'template' })
    expect(deps.sendTemplate).toHaveBeenCalledTimes(1)
    expect(deps.sendTemplate).toHaveBeenCalledWith({
      connectionId: 'conn-1',
      organizationId: ORG,
      contactPhone: '5511999999999',
      templateName: 'followup_proativo',
      languageCode: 'pt_BR',
    })
    expect(deps.markSent).toHaveBeenCalledWith(SCHEDULED_ID, ORG)
    // NUNCA texto cru fora da janela: resolveText/send não são chamados.
    expect(deps.resolveText).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.markCancelled).not.toHaveBeenCalled()
    expect(deps.markFailed).not.toHaveBeenCalled()
  })

  it('needsTemplate + languageCode ausente → default pt_BR no sendTemplate', async () => {
    const deps = makeDeps({
      loadEligibility: vi.fn(async () =>
        outsideWindowWithTemplate({ languageCode: null }),
      ),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'sent', reason: 'template' })
    expect(deps.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ languageCode: 'pt_BR' }),
    )
  })

  it('needsTemplate + sendTemplate retorna null → markFailed template_send_failed', async () => {
    const deps = makeDeps({
      loadEligibility: vi.fn(async () => outsideWindowWithTemplate()),
      sendTemplate: vi.fn(async () => null),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'failed', reason: 'template_send_failed' })
    expect(deps.markFailed).toHaveBeenCalledWith(
      SCHEDULED_ID,
      ORG,
      'template_send_failed',
    )
    expect(deps.markSent).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('needsTemplate + sendTemplate lança (erro do Graph) → markFailed (fail-safe, não relança)', async () => {
    const deps = makeDeps({
      loadEligibility: vi.fn(async () => outsideWindowWithTemplate()),
      sendTemplate: vi.fn(async () => {
        throw new Error('(#132001) Template name does not exist')
      }),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result.outcome).toBe('failed')
    expect(result.reason).toContain('132001')
    expect(deps.markFailed).toHaveBeenCalled()
    expect(deps.markSent).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('fora da janela SEM template → cancelled outside_window_no_template (gate !allowed)', async () => {
    const deps = makeDeps({
      loadEligibility: vi.fn(async () =>
        eligibleSnapshot({
          session: {
            whatsappWindowExpiresAt: new Date(NOW.getTime() - 3600_000),
            aiEnabled: true,
          },
          hasApprovedTemplate: false,
        }),
      ),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({
      outcome: 'cancelled',
      reason: 'outside_window_no_template',
    })
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('happy path dentro da janela → send com dispatchKey correto + markSent', async () => {
    const deps = makeDeps()

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'sent' })
    expect(deps.send).toHaveBeenCalledTimes(1)

    const expectedDispatchKey = deriveDispatchKey('sess-1', SCHEDULED_ID)
    expect(deps.send).toHaveBeenCalledWith({
      connectionId: 'conn-1',
      sessionId: 'sess-1',
      organizationId: ORG,
      contactPhone: '5511999999999',
      agentText: 'Oi! Passando para retomar nosso contato.',
      dispatchKey: expectedDispatchKey,
    })
    expect(deps.markSent).toHaveBeenCalledWith(SCHEDULED_ID, ORG)
    expect(deps.markCancelled).not.toHaveBeenCalled()
    expect(deps.markFailed).not.toHaveBeenCalled()
  })

  it('sessionId ausente → markFailed no_session SEM enviar (Message.sessionId é FK)', async () => {
    // NIT-4: não dá para fabricar um id de sessão — Message.sessionId é FK
    // relacional p/ ChatSession. Sem sessão real → falha segura, nunca envia.
    const deps = makeDeps({
      loadPending: vi.fn(async () => makeRow({ sessionId: null })),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'failed', reason: 'no_session' })
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.markFailed).toHaveBeenCalledWith(SCHEDULED_ID, ORG, 'no_session')
  })

  it('send blocksSent=0 → markFailed com os errors', async () => {
    const deps = makeDeps({
      send: vi.fn(async () => ({ blocksSent: 0, errors: ['connection not found'] })),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'failed', reason: 'connection not found' })
    expect(deps.markFailed).toHaveBeenCalledWith(
      SCHEDULED_ID,
      ORG,
      'connection not found',
    )
    expect(deps.markSent).not.toHaveBeenCalled()
  })

  it('resolveText null → markFailed no_text_resolved SEM chamar send', async () => {
    const deps = makeDeps({ resolveText: vi.fn(async () => null) })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'failed', reason: 'no_text' })
    expect(deps.markFailed).toHaveBeenCalledWith(
      SCHEDULED_ID,
      ORG,
      'no_text_resolved',
    )
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.markSent).not.toHaveBeenCalled()
  })

  it('resolveText string vazia → markFailed no_text_resolved (sem enviar)', async () => {
    const deps = makeDeps({ resolveText: vi.fn(async () => '   ') })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'failed', reason: 'no_text' })
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('throw em loadEligibility → markFailed (fail-safe), não relança', async () => {
    const deps = makeDeps({
      loadEligibility: vi.fn(async () => {
        throw new Error('db down')
      }),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    expect(result).toEqual({ outcome: 'failed', reason: 'db down' })
    expect(deps.markFailed).toHaveBeenCalledWith(SCHEDULED_ID, ORG, 'db down')
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('throw em markFailed dentro do catch → ainda retorna failed (não relança)', async () => {
    const deps = makeDeps({
      loadEligibility: vi.fn(async () => {
        throw new Error('db down')
      }),
      markFailed: vi.fn(async () => {
        throw new Error('also down')
      }),
    })

    const result = await runScheduledMessageSend(deps, PAYLOAD, { now: NOW })

    // Fail-safe absoluto: nem o markFailed lançando derruba o handler.
    expect(result.outcome).toBe('failed')
  })
})
