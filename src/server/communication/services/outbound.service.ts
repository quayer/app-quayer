/**
 * outbound.service — orquestra o envio da resposta do agente IA de volta
 * para o WhatsApp do cliente.
 *
 * Fluxo:
 *   1. Busca Connection (token + baseUrl)
 *   2. Rate-limit (token bucket por contato + por org) — barra o turno se estourar
 *   3. Quebra agentText em blocos respeitando parágrafos (`\n\n`), até 800 chars
 *   4. Para cada bloco: envia via sender (UAZapi) com retry+backoff exponencial;
 *      ao esgotar tentativas, manda o payload para a dead-letter list. Marca
 *      bot-echo no Redis nos envios bem-sucedidos.
 *   5. Persiste 1 Message OUTBOUND no Postgres com waMessageId do primeiro
 *      envio bem-sucedido
 *
 * Dependências injetadas (deps pattern) para facilitar testes — sem vi.mock global.
 *
 * Resiliência (padrões Orayon — ver outbound-rate-limit.ts / outbound-deadletter.ts):
 *   - Rate-limit por contato + por org via Redis (INCR + EXPIRE, fail-open).
 *   - Retry com backoff exponencial (2^n*500ms, cap 30s, máx 3) por bloco.
 *   - Dead-letter (Redis list `outbound:deadletter`) ao esgotar retries.
 *
 * Importante:
 *   - Erros em blocos individuais não abortam os próximos (resiliência).
 *   - markBotMessage só é chamado em envios bem-sucedidos (evita echo zumbi).
 *   - Se 0 blocos forem enviados, NADA é persistido (não polui o histórico).
 *   - Rate-limit estourado → `rateLimited: true` e NADA é enviado.
 */

import { splitMessage } from './message-splitter.service'
import { buildOutboundBlocks, sendBlock } from './outbound-blocks.service'
import { checkOutboundRateLimit } from './outbound-rate-limit'
import { sendWithRetry, pushDeadLetter } from './outbound-deadletter'
import {
  initBlockPlan,
  resumeDecision,
  shouldSendBlock,
  applyBlockResult,
  summarizeStatus,
  type BlockCheckpoint,
} from './outbound-dispatch.pure'
import { checkRateLimit } from '@/server/ai-module/ai-agents/infra/rate-limit.service'
import type {
  OutboundRequest,
  OutboundResult,
  OutboundDeps,
} from './outbound.types'

// Re-exporta os tipos públicos para preservar a superfície de import deste módulo
// (callers e testes importam estes tipos de './outbound.service').
export type {
  OutboundRequest,
  OutboundResult,
  OutboundDatabase,
  OutboundSender,
  OutboundDeps,
} from './outbound.types'

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const MAX_BLOCK_CHARS = 800
/** Fallback de baseUrl quando a Connection não traz um. */
const FALLBACK_BASE_URL = process.env.UAZAPI_BASE_URL ?? 'https://api.uazapi.com'

/**
 * QH-02: máximo de tentativas de retry para um envio barrado pelo limite de
 * INSTÂNCIA. Ao atingir, vai para a dead-letter em vez de reenfileirar.
 */
const MAX_RETRY_ATTEMPTS = 5
/** Piso/teto do delay do retry (ms). Protege contra retryAfterMs=0 ou absurdo. */
const RETRY_DELAY_MIN_MS = 1_000
const RETRY_DELAY_MAX_MS = 60_000

function clampRetryDelayMs(retryAfterMs: number): number {
  if (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0) return RETRY_DELAY_MIN_MS
  return Math.min(RETRY_DELAY_MAX_MS, Math.max(RETRY_DELAY_MIN_MS, Math.ceil(retryAfterMs)))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sendAgentResponse(
  req: OutboundRequest,
  deps: OutboundDeps,
): Promise<OutboundResult> {
  const errors: string[] = []

  // 1. Connection lookup
  const connection = await deps.database.connection.findFirst({
    where: { id: req.connectionId, organizationId: req.organizationId },
  })
  if (!connection) {
    errors.push(`Connection ${req.connectionId} não encontrada para org ${req.organizationId}`)
    return { blocksSent: 0, persisted: false, errors }
  }
  if (!connection.uazapiToken) {
    errors.push(`Connection ${req.connectionId} sem uazapiToken configurado`)
    return { blocksSent: 0, persisted: false, errors }
  }

  const baseUrl = connection.uazapiBaseUrl ?? FALLBACK_BASE_URL

  // 2. Rate-limit (Orayon token bucket: por contato + por org). Consome cota
  //    UMA vez por turno — não dentro do loop de blocos. Fail-open por dentro.
  //    QH-02: só no envio ORIGINAL (attempt 0). Num RETRY (attempt>0) a cota de
  //    contato/org já foi consumida no turno original; re-consumir empurraria o
  //    contato sobre o limite por engano. Só o limite de INSTÂNCIA é retentado —
  //    o gate de instância abaixo SEMPRE roda (inclusive nos retries).
  if ((req.attempt ?? 0) === 0) {
    const rl = await checkOutboundRateLimit(req.organizationId, req.contactPhone)
    if (!rl.allowed) {
      const msg = `rate_limited scope=${rl.scope} current=${rl.current} limit=${rl.limit} org=${req.organizationId}`
      console.warn(`[outbound] ${msg}`)
      errors.push(msg)
      return { blocksSent: 0, persisted: false, errors, rateLimited: true }
    }
  }

  // QH-02: Rate limit por instância (60 msgs/min por connectionId) — token bucket
  // Redis Lua. Fail-open: Redis down → allowed=true, retryAfterMs=0.
  // Quando excedido, NÃO descartamos mais a resposta: agendamos um retry com
  // delay=retryAfterMs (o bucket refila ~1 token/s, então em ~1s o envio passa).
  // Cap em MAX_RETRY_ATTEMPTS — ao esgotar (ou sem scheduler injetado), vai para
  // a dead-letter (visibilidade de ops) em vez de reenfileirar pra sempre.
  const instanceRl = await checkRateLimit({ scope: 'instance', key: req.connectionId })
  if (!instanceRl.allowed) {
    const attempt = req.attempt ?? 0
    const msg = `rate_limited scope=instance key=${req.connectionId} retryAfterMs=${instanceRl.retryAfterMs} attempt=${attempt}`
    console.warn(`[outbound] QH-02: ${msg}`)
    errors.push(msg)

    if (deps.scheduleRetry && attempt < MAX_RETRY_ATTEMPTS) {
      const delayMs = clampRetryDelayMs(instanceRl.retryAfterMs)
      try {
        await deps.scheduleRetry({ ...req, attempt: attempt + 1 }, delayMs)
        return { blocksSent: 0, persisted: false, errors, rateLimited: true, retryScheduled: true, retryAfterMs: delayMs }
      } catch (err) {
        // Falha ao agendar não pode derrubar o turno — cai para dead-letter.
        errors.push(`schedule retry failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Esgotou retries OU sem scheduler OU falha ao agendar → dead-letter.
    await pushDeadLetter({
      organizationId: req.organizationId,
      phone: req.contactPhone,
      text: req.agentText,
      error: `rate_limited_instance attempt=${attempt} (max=${MAX_RETRY_ATTEMPTS}, scheduler=${deps.scheduleRetry ? 'present' : 'absent'})`,
      timestamp: new Date().toISOString(),
    })
    return { blocksSent: 0, persisted: false, errors, rateLimited: true, retryScheduled: false }
  }

  // 3. Parse tags ricas + split de texto puro
  const blocks = buildOutboundBlocks(req.agentText, MAX_BLOCK_CHARS)

  // 3b. FSM outbound durável — claim do dispatch por dispatchKey (checkpoint por
  //     bloco). Só ativa quando há `req.dispatchKey` E a dep `outboundDispatch`.
  //     REGRA DE OURO — FAIL-OPEN: qualquer passo do claim que lance desliga o
  //     durável (durable=false) e segue pelo caminho legado, NUNCA propaga nem
  //     bloqueia a mensagem. Preserva 100% dos testes que não passam dispatchKey.
  const dispatchKey = req.dispatchKey
  const dispatchDb = deps.database.outboundDispatch
  let durable = Boolean(dispatchKey) && Boolean(dispatchDb)
  let plan: BlockCheckpoint[] = []

  if (durable && dispatchKey && dispatchDb) {
    try {
      const existing = await dispatchDb.findUnique({ where: { dispatchKey } })
      const decision = resumeDecision(existing)

      // 'skip': dispatch já 'sent' → retorno idempotente, NÃO reenvia nem
      // re-persiste o Message (a duplicação que este épico evita).
      if (decision.action === 'skip') {
        return {
          blocksSent: existing?.sentBlocks ?? blocks.length,
          persisted: true,
          errors,
        }
      }

      // 'fresh': plano novo (todos pending). 'resume': reconstrói o plano com os
      // blocos já 'sent' marcados (preservando providerMessageId quando houver),
      // para PULAR o que já foi enviado.
      if (decision.action === 'resume') {
        plan = rebuildResumePlan(blocks.length, decision.sentIdx, existing?.blocks)
      } else {
        plan = initBlockPlan(blocks.length)
      }

      const alreadySent = plan.filter((b) => b.status === 'sent').length
      const attempt = existing?.attempt ?? 0
      await dispatchDb.upsert({
        where: { dispatchKey },
        create: {
          dispatchKey,
          organizationId: req.organizationId,
          sessionId: req.sessionId,
          connectionId: req.connectionId,
          contactPhone: req.contactPhone,
          agentText: req.agentText,
          status: 'sending',
          blocks: plan,
          totalBlocks: blocks.length,
          sentBlocks: alreadySent,
          attempt,
        },
        update: {
          status: 'sending',
          attempt: attempt + 1,
        },
      })
    } catch (err) {
      // Claim falhou → desliga o durável e segue legado. NUNCA propaga.
      console.warn(
        '[outbound] dispatch claim failed, falling back to legacy (no checkpoint):',
        err instanceof Error ? err.message : String(err),
      )
      durable = false
      plan = []
    }
  }

  // 4. Envio sequencial + bot-echo tracking. Cada bloco usa retry+backoff
  //    exponencial; ao esgotar, vai para a dead-letter (sem derrubar o turno).
  let blocksSent = 0
  let firstSuccessMessageId: string | undefined

  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx]

    // Durável: bloco já checkpointado 'sent' (crash/retry) → PULA o envio para
    // não duplicar. Conta como enviado e recupera o waMessageId do bloco 0.
    if (durable && !shouldSendBlock(plan, idx)) {
      blocksSent += 1
      if (idx === 0 && !firstSuccessMessageId) {
        const checkpoint = plan.find((b) => b.idx === 0)
        if (checkpoint?.providerMessageId) firstSuccessMessageId = checkpoint.providerMessageId
      }
      continue
    }

    const result = await sendWithRetry(
      () =>
        sendBlock(
          deps.sender,
          connection.uazapiToken as string,
          baseUrl,
          req.contactPhone,
          block,
          req.organizationId,
          req.tts,
        ),
      {
        organizationId: req.organizationId,
        phone: req.contactPhone,
        text: block.content,
      },
    )

    if (result.success) {
      blocksSent += 1
      if (result.messageId) {
        if (!firstSuccessMessageId) firstSuccessMessageId = result.messageId
        // Marca echo para o webhook OUT do UAZapi não reprocessar.
        await deps.markBotMessage(req.organizationId, result.messageId)
      }
    } else {
      errors.push(result.error ?? 'erro desconhecido')
    }

    // Durável: CHECKPOINT do bloco ANTES do próximo — persiste o providerMessageId
    // e o status, de forma que um crash aqui retome do bloco seguinte. FAIL-OPEN:
    // falha no checkpoint apenas loga e segue (não derruba o turno nem reenvia).
    if (durable && dispatchKey && dispatchDb) {
      plan = applyBlockResult(plan, idx, {
        success: result.success,
        providerMessageId: result.messageId,
      })
      try {
        await dispatchDb.update({
          where: { dispatchKey },
          data: {
            blocks: plan,
            sentBlocks: plan.filter((b) => b.status === 'sent').length,
            status: 'sending',
            ...(result.success ? {} : { lastError: result.error ?? 'erro desconhecido' }),
          },
        })
      } catch (err) {
        console.warn(
          '[outbound] dispatch block checkpoint failed (non-fatal):',
          err instanceof Error ? err.message : String(err),
        )
      }
    }
  }

  // 5. Persistência do Message + finalização do dispatch.
  //     B1: o status final 'sent' do dispatch SÓ é gravado DEPOIS de o Message
  //     ser persistido. Assim, um crash entre "blocos enviados" e "Message
  //     gravado" deixa o dispatch em 'sending' → o resume re-roda pulando os
  //     blocos já enviados (sem duplicar ao cliente) e grava o Message que
  //     faltou. Marcar 'sent' cedo demais faria o resume cair em 'skip' e perder
  //     o registro interno do Message.
  if (blocksSent === 0) {
    // Nada entregue → finaliza o dispatch (status 'failed', terminal) e retorna.
    await finalizeDispatch(deps, durable, dispatchKey, plan)
    return { blocksSent: 0, persisted: false, errors }
  }

  try {
    await deps.database.message.create({
      data: {
        sessionId: req.sessionId,
        connectionId: req.connectionId,
        contactPhone: req.contactPhone,
        // waMessageId é unique no schema. Caímos no firstSuccessMessageId; se
        // o provider não retornou (raro), usamos um sentinel determinístico.
        waMessageId: firstSuccessMessageId ?? `outbound-${req.sessionId}-${Date.now()}`,
        direction: 'OUTBOUND',
        type: 'text',
        author: 'AI',
        content: req.agentText,
        status: 'sent',
        sentAt: new Date(),
        // Per-turn AI attribution (these columns existed but were always NULL).
        ...(req.aiMeta
          ? {
              aiModel: req.aiMeta.model,
              aiProvider: req.aiMeta.provider,
              aiAgentId: req.aiMeta.agentId ?? undefined,
              inputTokens: req.aiMeta.inputTokens,
              outputTokens: req.aiMeta.outputTokens,
              inputCost: req.aiMeta.inputCost,
              outputCost: req.aiMeta.outputCost,
              totalCost: req.aiMeta.totalCost,
              aiLatency: req.aiMeta.latencyMs,
            }
          : {}),
      },
    })
    // Message persistido → AGORA é seguro marcar o status final do dispatch.
    await finalizeDispatch(deps, durable, dispatchKey, plan)
    return { blocksSent, persisted: true, errors }
  } catch (err) {
    errors.push(
      `persist Message failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    // NÃO finaliza o dispatch aqui: deixa em 'sending' para o resume re-tentar a
    // persistência (pulando os blocos já enviados). Evita a perda do Message (B1).
    return { blocksSent, persisted: false, errors }
  }
}

/**
 * FSM outbound durável: finaliza o dispatch com o status sumarizado
 * (sent/partial/failed). Chamado SOMENTE após a persistência do Message (B1) —
 * marcar 'sent' antes faria um crash perder o registro interno do Message.
 * FAIL-OPEN: qualquer falha aqui apenas loga; nunca derruba o turno.
 */
async function finalizeDispatch(
  deps: OutboundDeps,
  durable: boolean,
  dispatchKey: string | undefined,
  plan: BlockCheckpoint[],
): Promise<void> {
  const dispatchDb = deps.database.outboundDispatch
  if (!durable || !dispatchKey || !dispatchDb) return
  try {
    const summary = summarizeStatus(plan)
    await dispatchDb.update({
      where: { dispatchKey },
      data: { status: summary.status, sentBlocks: summary.sentBlocks },
    })
  } catch (err) {
    console.warn(
      '[outbound] dispatch finalize failed (non-fatal):',
      err instanceof Error ? err.message : String(err),
    )
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * FSM outbound durável: reconstrói o plano de blocos no RESUME (crash no meio).
 * Parte de `initBlockPlan(total)` (todos pending) e marca como 'sent' os índices
 * em `sentIdx`, recuperando o `providerMessageId` do `blocks` Json persistido
 * quando disponível (necessário p/ o waMessageId do Message no bloco 0).
 *
 * Defensivo: `persistedBlocks` é parseado frouxamente (Json `unknown`); índices
 * fora do range são ignorados. Imutável (retorna novo array).
 */
function rebuildResumePlan(
  total: number,
  sentIdx: number[],
  persistedBlocks: unknown,
): BlockCheckpoint[] {
  const providerById = new Map<number, string>()
  if (Array.isArray(persistedBlocks)) {
    for (const raw of persistedBlocks) {
      if (typeof raw !== 'object' || raw === null) continue
      const candidate = raw as { idx?: unknown; providerMessageId?: unknown }
      if (
        typeof candidate.idx === 'number' &&
        Number.isFinite(candidate.idx) &&
        typeof candidate.providerMessageId === 'string'
      ) {
        providerById.set(candidate.idx, candidate.providerMessageId)
      }
    }
  }

  const sentSet = new Set(sentIdx)
  return initBlockPlan(total).map((block) => {
    if (!sentSet.has(block.idx)) return block
    const providerMessageId = providerById.get(block.idx)
    const updated: BlockCheckpoint = { idx: block.idx, status: 'sent' }
    if (providerMessageId !== undefined) updated.providerMessageId = providerMessageId
    return updated
  })
}

/**
 * Divide o texto em blocos de até `maxChars`, respeitando:
 *   1. Parágrafos (`\n\n`) — preferencial
 *   2. Palavras (espaço) — fallback quando um parágrafo é maior que maxChars
 *
 * Garantia: nenhum bloco corta no meio de uma palavra (ASCII/UTF-8 — split
 * por espaços, não por bytes).
 *
 * Exportado para testes; uso primário interno.
 */
export function splitIntoBlocks(text: string, maxChars: number): string[] {
  return splitMessage(text, { maxChars, useDelay: false }).map((block) => block.content)
}
