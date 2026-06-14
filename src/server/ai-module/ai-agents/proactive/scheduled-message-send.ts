/**
 * scheduled-message-send — F2b: WORKER de ENVIO PROATIVO real (épico
 * `specs/builder-proatividade`, fase F2 follow-up). Consome a fila
 * `quayer-scheduled-message` (producer = `scheduled-message.queue.ts`,
 * tool `create_followup`) e, no horário, entrega o follow-up agendado.
 *
 * A razão de ser (por que o gate forte vive AQUI, não no agendamento):
 *   Entre o `create_followup` e o disparo o estado muda — o cliente pode
 *   responder, optar por sair, a janela de 24h fecha, um humano pode assumir.
 *   A decisão compliance-crítica (`canSendProactive`) precisa ser reavaliada
 *   com dados FRESCOS no instante do envio. Agendar é barato/reversível;
 *   enviar é irreversível. Por isso este worker recarrega o ScheduledMessage,
 *   reavalia elegibilidade e SÓ ENTÃO envia.
 *
 * 🔒 INVARIANTES (NFR-PRO-2 / NFR-01 / LGPD):
 *   - FAIL-SAFE: em dúvida, NÃO envia. `canSendProactive` bloqueou → cancela.
 *   - NUNCA texto cru fora da janela 24h: `needsTemplate:true` ⇒ o handler tenta
 *     o caminho HSM (template aprovado, via Cloud API). Sem HSM possível (provider
 *     ≠ Cloud API, sem `deps.sendTemplate`, ou sem `templateName`) → cancela
 *     'outside_window_no_template'. `resolveText` (texto livre) NUNCA é chamado
 *     neste ramo — a invariante fica preservada por construção.
 *   - org-scoped: TODA query filtra por `organizationId`.
 *   - Idempotência em 2 camadas: (1) skip se o ScheduledMessage já não é
 *     'pending'; (2) o `dispatchKey` do `sendAgentResponse` (FSM durável)
 *     re-claim → 'sent' = skip, anti-duplicação ponta-a-ponta. A 2ª camada é
 *     ligada EXPLICITAMENTE em `buildRealDeps` (passa o delegate
 *     `outboundDispatch` nomeado, não por acidente do cast).
 *   - O WORKER NUNCA derruba o processo: erro num job vira status='failed' +
 *     log; o handler captura tudo no topo e NUNCA relança de forma a travar
 *     a fila.
 *
 * ⚠️ QUALIDADE DO TEXTO É VALIDADA NO TESTE LOCAL/LLM:
 *   `resolveText` (deps reais, em `scheduled-message-send.deps.ts`) tenta
 *   resolver o agente da sessão/conexão e gerar uma mensagem de follow-up
 *   contextual via `processAgentMessage`. Se NÃO conseguir resolver o agente
 *   com segurança, retorna `null` (skip seguro → markFailed 'no_text_resolved'),
 *   NUNCA envia lixo. A qualidade do texto e a resolução do agente são exercidas
 *   no harness local com LLM real — os testes unitários cobrem o controle de
 *   fluxo (gates, idempotência, fail-safe) com `resolveText` mockado.
 *
 * Camadas (espelha outbound-resume.queue):
 *   - runScheduledMessageSend(deps, payload, opts) → HANDLER PURO testável.
 *     Recebe `now` por opção (determinismo) e injeta TODO o IO via deps.
 *   - buildRealDeps() (sibling `scheduled-message-send.deps.ts`) → monta as deps
 *     reais via lazy import (não arrasta o caminho de envio pro bundle Next).
 *   - registerScheduledMessageWorker(redisUrl) → Worker BullMQ que no boot
 *     monta buildRealDeps() e roda o handler.
 */

import { Worker } from 'bullmq'
import { parseRedisUrl } from '@/lib/redis/parse-redis-url'
import { getTraceId } from '@/server/ai-module/ai-agents/infra/trace-context.service'
import { canSendProactive } from './proactive-eligibility.pure'
import {
  SCHEDULED_MESSAGE_QUEUE,
  type ScheduledMessageJobPayload,
} from '@/server/services/jobs/scheduled-message.queue'
import { deriveDispatchKey } from '@/server/communication/services/outbound-dispatch.pure'
import { buildRealDeps } from './scheduled-message-send.deps'

// ---------------------------------------------------------------------------
// Contratos (deps injetadas — IO 100% fora do handler puro)
// ---------------------------------------------------------------------------

/**
 * Registro mínimo do ScheduledMessage que o handler precisa para decidir e
 * enviar. Recarregado FRESCO do DB pelo `loadPending` (org-scoped).
 */
export interface ProactiveScheduledRow {
  readonly id: string
  readonly status: string
  readonly contactPhone: string
  readonly connectionId: string
  readonly sessionId: string | null
  readonly reason: string
  readonly messageGoal: string | null
  readonly maxAttempts: number
}

/**
 * Snapshot de elegibilidade carregado FRESCO no instante do envio. Alimenta
 * `canSendProactive`. `optOut` null = contato não optou por sair. Os campos da
 * sessão são o subset estrutural que os gates de supressão/janela usam.
 *
 * HSM (FR-PRO-06 / TPRO-50/51): `hasApprovedTemplate` decide o ramo "fora da
 * janela" — true ⇒ `canSendProactive` libera com `needsTemplate:true`. Quando há
 * template, `templateName` (e `languageCode`, default `pt_BR`) identificam o HSM
 * aprovado a usar. A presença real de um HSM aprovado e a credencial Cloud API
 * são responsabilidade do `loadEligibility` real (env + provider da Connection);
 * o erro do Graph no envio é o gate de realidade final (markFailed, fail-safe).
 */
export interface ProactiveEligibilitySnapshot {
  readonly optOut: { phone: string } | null
  readonly session: {
    whatsappWindowExpiresAt?: Date | null
    aiEnabled?: boolean
    aiBlockedUntil?: Date | null
    status?: string
  }
  readonly consecutiveProactiveWithoutReply: number
  readonly hasApprovedTemplate?: boolean
  /** Nome do HSM aprovado a usar fora da janela. Ausente ⇒ não há HSM → cancela. */
  readonly templateName?: string | null
  /** Idioma do HSM (BCP-47/Meta, ex.: `pt_BR`). Default `pt_BR` quando ausente. */
  readonly languageCode?: string | null
}

/**
 * Deps de IO do worker. TODO IO vive aqui (DB, runtime do agente, envio) para
 * manter `runScheduledMessageSend` puro/testável com `vi.fn()`.
 */
export interface ProactiveSendDeps {
  /** Recarrega o ScheduledMessage FRESCO (org-scoped). null = não existe. */
  loadPending: (
    id: string,
    organizationId: string,
  ) => Promise<ProactiveScheduledRow | null>
  /** Carrega o snapshot de elegibilidade FRESCO (opt-out + sessão + anti-spam). */
  loadEligibility: (p: {
    organizationId: string
    contactPhone: string
    sessionId: string | null
    connectionId: string
    maxAttempts: number
  }) => Promise<ProactiveEligibilitySnapshot>
  /**
   * Resolve o texto a enviar (gerado pelo agente da sessão/conexão). `null` =
   * não há texto seguro → skip seguro (markFailed 'no_text_resolved'). NUNCA
   * envia lixo: em dúvida, retorna null.
   */
  resolveText: (p: {
    reason: string
    messageGoal: string | null
    sessionId: string | null
    organizationId: string
    connectionId: string
    contactPhone: string
  }) => Promise<string | null>
  /** Envia via sendAgentResponse (FSM durável via dispatchKey). */
  send: (req: {
    connectionId: string
    sessionId: string
    organizationId: string
    contactPhone: string
    agentText: string
    dispatchKey: string
  }) => Promise<{ blocksSent: number; errors: string[] }>
  /**
   * Envia um HSM (template aprovado) FORA da janela de 24h — exclusivo da
   * WhatsApp Cloud API (Meta). OPCIONAL: ausente ⇒ não há caminho HSM (ex.:
   * provider WhatsApp Web/UAZ) → o handler cancela 'outside_window_no_template'
   * (fail-safe). Resolve `{ messageId }` no sucesso; lança/retorna `null` em
   * falha (template não aprovado, credencial inválida, provider errado) →
   * markFailed. NUNCA envia texto cru: este caminho só carrega o HSM aprovado.
   */
  sendTemplate?: (req: {
    connectionId: string
    organizationId: string
    contactPhone: string
    templateName: string
    languageCode: string
  }) => Promise<{ messageId: string } | null>
  /** status='sent' + sentAt (org-scoped). */
  markSent: (id: string, organizationId: string) => Promise<void>
  /** status='cancelled' + cancelledReason (org-scoped). */
  markCancelled: (
    id: string,
    organizationId: string,
    reason: string,
  ) => Promise<void>
  /** status='failed' + cancelledReason(error) (org-scoped). */
  markFailed: (
    id: string,
    organizationId: string,
    error: string,
  ) => Promise<void>
}

export interface ProactiveSendResult {
  readonly outcome: 'sent' | 'cancelled' | 'failed' | 'skipped'
  readonly reason?: string
}

export interface RunScheduledMessageSendOptions {
  /** Relógio injetado (determinismo nos testes). Default `new Date()`. */
  readonly now?: Date
}

// ---------------------------------------------------------------------------
// Handler puro
// ---------------------------------------------------------------------------

/**
 * Processa UM envio proativo agendado, org-scoped e fail-safe.
 *
 * Fluxo (cada passo degrada para o resultado mais seguro contra envio indevido):
 *   a. Recarrega o ScheduledMessage. Inexistente OU status!=='pending' →
 *      'skipped' (idempotência: já foi processado/cancelado).
 *   b. Carrega elegibilidade FRESCA e roda `canSendProactive`.
 *   c. Bloqueado (!allowed) → cancela com o reason do gate → 'cancelled'.
 *   d. allowed + needsTemplate → FORA da janela 24h: tenta o caminho HSM
 *      (template aprovado via Cloud API). Há `deps.sendTemplate` + `templateName`
 *      → envia o HSM. Sucesso → markSent → 'sent'. Falha/null → markFailed →
 *      'failed'. Sem caminho HSM (provider ≠ Cloud API, sem dep ou sem
 *      templateName) → cancela 'outside_window_no_template' → 'cancelled'.
 *      `resolveText` (texto livre) NUNCA é chamado neste ramo.
 *   e. Resolve o texto. Vazio/null → markFailed 'no_text_resolved' → 'failed'.
 *   f. Sem sessão real → markFailed 'no_session' (Message.sessionId é FK). Senão
 *      envia com dispatchKey = sha256(sessionId:id). blocksSent>0 → markSent →
 *      'sent'. blocksSent===0 → markFailed(errors) → 'failed'.
 *   g. Qualquer throw → markFailed best-effort → 'failed'. NUNCA relança
 *      (o worker não pode cair por um job ruim).
 */
export async function runScheduledMessageSend(
  deps: ProactiveSendDeps,
  payload: ScheduledMessageJobPayload,
  opts: RunScheduledMessageSendOptions = {},
): Promise<ProactiveSendResult> {
  const now = opts.now ?? new Date()
  const org = payload.organizationId
  const id = payload.scheduledMessageId

  try {
    // a. Recarrega FRESCO. Idempotência camada 1: só processa 'pending'.
    const row = await deps.loadPending(id, org)
    if (!row || row.status !== 'pending') {
      return { outcome: 'skipped' }
    }

    // b. Elegibilidade FRESCA no instante do envio.
    const elig = await deps.loadEligibility({
      organizationId: org,
      contactPhone: row.contactPhone,
      sessionId: row.sessionId,
      connectionId: row.connectionId,
      maxAttempts: row.maxAttempts,
    })

    const decision = canSendProactive({
      optOut: elig.optOut,
      session: elig.session,
      now,
      consecutiveProactiveWithoutReply: elig.consecutiveProactiveWithoutReply,
      maxAttempts: row.maxAttempts,
      hasApprovedTemplate: elig.hasApprovedTemplate,
    })

    // c. Bloqueado pelo gate (opt-out / supressão / anti-spam / fora-janela sem
    //    template) → cancela. O reason do gate é auditável.
    if (!decision.allowed) {
      const reason = decision.reason ?? 'blocked'
      await deps.markCancelled(id, org, reason)
      return { outcome: 'cancelled', reason }
    }

    // d. Liberado MAS fora da janela 24h → EXIGE template HSM aprovado. HSM é
    //    exclusivo da WhatsApp Cloud API (Meta): o caminho real só existe quando
    //    a Connection é Cloud API (`deps.sendTemplate` presente) E há um HSM
    //    aprovado resolvido (`templateName`). NUNCA texto cru fora da janela:
    //    `resolveText` NÃO é chamado neste ramo, por construção.
    if (decision.needsTemplate === true) {
      const templateName = elig.templateName?.trim()
      if (!deps.sendTemplate || !templateName) {
        // Sem caminho HSM (provider ≠ Cloud API / sem template aprovado) →
        // cancela, exatamente como antes (fail-safe), agora justificado por
        // ausência de capacidade real, não por flag hardcoded.
        await deps.markCancelled(id, org, 'outside_window_no_template')
        return { outcome: 'cancelled', reason: 'needs_template' }
      }

      const languageCode =
        elig.languageCode && elig.languageCode.trim().length > 0
          ? elig.languageCode.trim()
          : 'pt_BR'

      const tpl = await deps.sendTemplate({
        connectionId: row.connectionId,
        organizationId: org,
        contactPhone: row.contactPhone,
        templateName,
        languageCode,
      })

      // null = transporte não conseguiu enviar com segurança (provider errado,
      // credencial ausente) → falha sem enviar. messageId = HSM entregue.
      if (tpl && tpl.messageId) {
        await deps.markSent(id, org)
        return { outcome: 'sent', reason: 'template' }
      }
      await deps.markFailed(id, org, 'template_send_failed')
      return { outcome: 'failed', reason: 'template_send_failed' }
    }

    // e. Resolve o texto. null/vazio = não há texto seguro → falha (não envia).
    const text = await deps.resolveText({
      reason: row.reason,
      messageGoal: row.messageGoal,
      sessionId: row.sessionId,
      organizationId: org,
      connectionId: row.connectionId,
      contactPhone: row.contactPhone,
    })
    if (!text || text.trim().length === 0) {
      await deps.markFailed(id, org, 'no_text_resolved')
      return { outcome: 'failed', reason: 'no_text' }
    }

    // f. Envia. `Message.sessionId` é FK relacional para ChatSession (onDelete
    //    Cascade) — NÃO dá para fabricar um id de sessão: violaria a FK e o
    //    cliente receberia a mensagem sem registro no histórico. Sem sessão real
    //    → falha segura (não envia). Na prática o `resolveText` real já bloqueia
    //    o caso sem sessão (retorna null); este guard mantém o handler
    //    auto-consistente independente do resolveText injetado.
    if (!row.sessionId) {
      await deps.markFailed(id, org, 'no_session')
      return { outcome: 'failed', reason: 'no_session' }
    }
    const sessionId = row.sessionId
    const dispatchKey = deriveDispatchKey(row.sessionId, row.id)

    const r = await deps.send({
      connectionId: row.connectionId,
      sessionId,
      organizationId: org,
      contactPhone: row.contactPhone,
      agentText: text,
      dispatchKey,
    })

    if (r.blocksSent > 0) {
      await deps.markSent(id, org)
      return { outcome: 'sent' }
    }

    const errMsg = r.errors.length > 0 ? r.errors.join('; ') : 'no_blocks_sent'
    await deps.markFailed(id, org, errMsg)
    return { outcome: 'failed', reason: errMsg }
  } catch (err) {
    // g. Fail-safe: qualquer throw vira 'failed' (best-effort) e NUNCA relança.
    const msg = err instanceof Error ? err.message : String(err)
    try {
      await deps.markFailed(id, org, msg)
    } catch (markErr) {
      console.error(
        '[scheduled-message-send] markFailed também falhou (não-fatal):',
        markErr instanceof Error ? markErr.message : String(markErr),
      )
    }
    return { outcome: 'failed', reason: msg }
  }
}

// ---------------------------------------------------------------------------
// Worker registrar
// ---------------------------------------------------------------------------

/**
 * Registra o Worker que consome a fila de envio proativo agendado. Deve ser
 * chamado pelo entrypoint dedicado de workers (ex: scripts/start-workers.ts),
 * NUNCA pelo runtime Next. No boot monta as deps reais (lazy) e roda o handler
 * com `now = new Date()`. O handler é fail-safe (nunca relança), então o worker
 * não cai por um job ruim.
 */
export function registerScheduledMessageWorker(
  redisUrl: string,
): Worker<ScheduledMessageJobPayload, ProactiveSendResult> {
  const connection = parseRedisUrl(redisUrl)

  return new Worker<ScheduledMessageJobPayload, ProactiveSendResult>(
    SCHEDULED_MESSAGE_QUEUE,
    async (job) => {
      // QH-13: extrai traceId do carrier _trace para correlação de logs.
      const traceId = getTraceId(job.data as unknown as Record<string, unknown>)
      console.info('[scheduled-message-send.worker] job iniciado', {
        jobId: job.id,
        traceId,
        scheduledMessageId: job.data.scheduledMessageId,
        organizationId: job.data.organizationId,
        reason: job.data.reason,
      })
      const deps = await buildRealDeps()
      const result = await runScheduledMessageSend(deps, job.data, { now: new Date() })
      console.info('[scheduled-message-send.worker] job concluído', {
        jobId: job.id,
        traceId,
        outcome: result.outcome,
        reason: result.reason,
      })
      return result
    },
    { connection },
  )
}
