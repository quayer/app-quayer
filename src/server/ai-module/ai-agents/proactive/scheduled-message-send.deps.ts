/**
 * scheduled-message-send.deps — DEPS REAIS (IO) do worker de envio proativo F2b.
 * Extraído de `scheduled-message-send.ts` (FILE_SIZE_GUIDELINES ≤500): o handler
 * puro + tipos + registerWorker ficam lá; aqui mora todo o IO (DB, runtime do
 * agente, envio) montado via lazy import — assim o producer/registry NÃO arrasta
 * o caminho de envio pro bundle do runtime Next; só o Worker dedicado paga no boot.
 *
 * ⚠️ QUALIDADE DO TEXTO É VALIDADA NO TESTE LOCAL/LLM: `resolveText` tenta
 * resolver o agente da sessão e gerar texto via `processAgentMessage`. Em qualquer
 * incerteza retorna `null` (skip seguro → markFailed), NUNCA envia lixo.
 */

import type { ProactiveSendDeps } from './scheduled-message-send'

/**
 * Diretiva proativa injetada como mensagem do "sistema/cliente sintético" no
 * runtime do agente: pede uma mensagem de follow-up CURTA, ancorada no objetivo
 * e motivo do agendamento. O agente real (com seu prompt/persona/RAG) gera o
 * texto — assim a mensagem soa como a marca, não como template genérico.
 */
function buildProactiveDirective(reason: string, messageGoal: string | null): string {
  const goal = messageGoal && messageGoal.trim().length > 0 ? messageGoal.trim() : 'retomar o contato'
  return (
    '[PROATIVO] Gere uma mensagem de follow-up curta e natural para o cliente. ' +
    `Objetivo: ${goal}. Motivo: ${reason}. ` +
    'Não invente informações; seja breve e cordial.'
  )
}

/**
 * Monta as deps reais via lazy import. O producer/registry não arrasta o
 * caminho de envio (database + runtime do agente + uazapi sender) pro bundle
 * do runtime Next — só o Worker dedicado paga esse custo no boot.
 */
export async function buildRealDeps(): Promise<ProactiveSendDeps> {
  const [
    { database },
    { sendAgentResponse },
    senderMod,
    { markBotMessage },
    { processAgentMessage },
  ] = await Promise.all([
    import('@/server/services/database'),
    import('@/server/communication/services/outbound.service'),
    import('@/server/communication/services/uazapi-sender.service'),
    import('@/server/communication/services/bot-echo-guard.service'),
    import('@/server/ai-module/ai-agents/agent-runtime.service'),
  ])

  const loadPending: ProactiveSendDeps['loadPending'] = async (id, organizationId) => {
    const row = await database.scheduledMessage.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        status: true,
        contactPhone: true,
        connectionId: true,
        sessionId: true,
        reason: true,
        messageGoal: true,
        maxAttempts: true,
      },
    })
    return row
  }

  const loadEligibility: ProactiveSendDeps['loadEligibility'] = async (p) => {
    // opt-out por (organizationId, phone) — a mera existência = opted-out.
    const optOutRow = await database.contactOptOut.findUnique({
      where: { organizationId_phone: { organizationId: p.organizationId, phone: p.contactPhone } },
      select: { phone: true },
    })

    // Sessão: prefere a sessão de origem (sessionId); senão, a mais recente do
    // par (connectionId, contactPhone, org). Subset p/ janela + supressão.
    const session = p.sessionId
      ? await database.chatSession.findFirst({
          where: { id: p.sessionId, organizationId: p.organizationId },
          select: {
            aiEnabled: true,
            aiBlockedUntil: true,
            status: true,
            whatsappWindowExpiresAt: true,
          },
        })
      : await database.chatSession.findFirst({
          where: { organizationId: p.organizationId, contactPhone: p.contactPhone },
          orderBy: { lastMessageAt: 'desc' },
          select: {
            aiEnabled: true,
            aiBlockedUntil: true,
            status: true,
            whatsappWindowExpiresAt: true,
          },
        })

    // Anti-spam reply-aware (FR-PRO-07). Proxy CONSERVADOR (fail-safe): contamos
    // os ScheduledMessage já 'sent' para o contato cuja sentAt é POSTERIOR ao
    // último inbound conhecido (lastCustomerMessageAt da sessão). Sem inbound
    // conhecido → contamos TODOS os 'sent' (número MAIOR bloqueia mais, fail-safe).
    // O caso comum (1 envio/contato) fica correto; em dúvida, bloqueia mais.
    const lastInboundRow = await database.chatSession.findFirst({
      where: { organizationId: p.organizationId, contactPhone: p.contactPhone },
      orderBy: { lastCustomerMessageAt: 'desc' },
      select: { lastCustomerMessageAt: true },
    })
    const lastInboundAt = lastInboundRow?.lastCustomerMessageAt ?? null

    const consecutiveProactiveWithoutReply = await database.scheduledMessage.count({
      where: {
        organizationId: p.organizationId,
        contactPhone: p.contactPhone,
        status: 'sent',
        ...(lastInboundAt ? { sentAt: { gt: lastInboundAt } } : {}),
      },
    })

    return {
      optOut: optOutRow ? { phone: optOutRow.phone } : null,
      session: {
        whatsappWindowExpiresAt: session?.whatsappWindowExpiresAt ?? null,
        aiEnabled: session?.aiEnabled,
        aiBlockedUntil: session?.aiBlockedUntil ?? null,
        status: session?.status,
      },
      consecutiveProactiveWithoutReply,
      // Sem catálogo HSM ainda (FR-PRO-06 / TPRO-50): fora da janela bloqueia.
      hasApprovedTemplate: false,
    }
  }

  const resolveText: ProactiveSendDeps['resolveText'] = async (p) => {
    // Resolve o agente da sessão de origem; sem agente seguro → null (skip).
    // ⚠️ Resolução do agente + qualidade do texto validadas no harness local/LLM.
    if (!p.sessionId) return null
    const sess = await database.chatSession.findFirst({
      where: { id: p.sessionId, organizationId: p.organizationId },
      select: { aiAgentConfigId: true, contactPhone: true, connectionId: true },
    })
    if (!sess?.aiAgentConfigId) return null

    try {
      const response = await processAgentMessage({
        agentConfigId: sess.aiAgentConfigId,
        sessionId: p.sessionId,
        contactId: sess.contactPhone,
        connectionId: sess.connectionId,
        organizationId: p.organizationId,
        messageContent: buildProactiveDirective(p.reason, p.messageGoal),
      })
      const text = response.text?.trim()
      return text && text.length > 0 ? text : null
    } catch (err) {
      // Em dúvida não envia: runtime falhou → null (skip seguro, markFailed).
      console.warn(
        '[scheduled-message-send] resolveText: runtime do agente falhou:',
        err instanceof Error ? err.message : String(err),
      )
      return null
    }
  }

  // BUG-1 fix: monta o `database` da chamada com os delegates NOMEADOS — em
  // especial `outboundDispatch` — para a 2ª camada de idempotência (FSM
  // outbound durável, checkpoint por bloco) ficar PROVADAMENTE ligada no envio
  // proativo, não por acidente do cast opaco. Se o delegate sumir (cliente
  // Prisma desatualizado / migration não aplicada), logamos: sendAgentResponse
  // cai fail-open no legado, mas o problema fica VISÍVEL em vez de silencioso.
  if (!database.outboundDispatch) {
    console.error(
      '[scheduled-message-send] PrismaClient sem delegate outboundDispatch — ' +
        'idempotência durável do envio proativo DESLIGADA (fail-open p/ legado). ' +
        'Rode prisma generate / aplique a migration outbound_dispatch.',
    )
  }
  const outboundDatabase = {
    connection: database.connection,
    message: database.message,
    outboundDispatch: database.outboundDispatch,
  } as unknown as Parameters<typeof sendAgentResponse>[1]['database']

  const send: ProactiveSendDeps['send'] = async (req) => {
    const result = await sendAgentResponse(
      {
        connectionId: req.connectionId,
        sessionId: req.sessionId,
        organizationId: req.organizationId,
        contactPhone: req.contactPhone,
        agentText: req.agentText,
        dispatchKey: req.dispatchKey,
      },
      {
        database: outboundDatabase,
        sender: senderMod,
        markBotMessage,
      },
    )
    return { blocksSent: result.blocksSent, errors: result.errors }
  }

  const markSent: ProactiveSendDeps['markSent'] = async (id, organizationId) => {
    await database.scheduledMessage.updateMany({
      where: { id, organizationId },
      data: { status: 'sent', sentAt: new Date() },
    })
  }

  const markCancelled: ProactiveSendDeps['markCancelled'] = async (id, organizationId, reason) => {
    await database.scheduledMessage.updateMany({
      where: { id, organizationId },
      data: { status: 'cancelled', cancelledReason: reason },
    })
  }

  const markFailed: ProactiveSendDeps['markFailed'] = async (id, organizationId, error) => {
    await database.scheduledMessage.updateMany({
      where: { id, organizationId },
      data: { status: 'failed', cancelledReason: error },
    })
  }

  return {
    loadPending,
    loadEligibility,
    resolveText,
    send,
    markSent,
    markCancelled,
    markFailed,
  }
}
