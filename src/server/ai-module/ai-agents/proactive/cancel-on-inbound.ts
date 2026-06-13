/**
 * cancel-on-inbound — F2b: CANCELAMENTO de follow-ups proativos pendentes quando
 * o CLIENTE responde (épico `specs/builder-proatividade`, fase F2 follow-up;
 * FR-PRO-07 / NFR-PRO-2 — reply-aware anti-spam).
 *
 * A razão de ser (por que cancelar no inbound):
 *   Um follow-up proativo (`create_followup`) é agendado APOSTANDO que o cliente
 *   ficou em silêncio. Se o cliente responder ANTES do disparo, aquele follow-up
 *   perde o sentido — enviá-lo seria spam/ruído. Por isso, no momento em que
 *   confirmamos um inbound GENUÍNO do cliente (pós-dedup, não-echo, org +
 *   telefone resolvidos), cancelamos todos os ScheduledMessage `pending` daquele
 *   par (organizationId, contactPhone) que pedem `cancelIfCustomerReplies`.
 *
 *   O worker de envio (`scheduled-message-send`) também reavalia elegibilidade
 *   no disparo (2ª camada). Este cancelamento no inbound é a camada PROATIVA:
 *   limpa a fila cedo e deixa a auditoria com o motivo correto ('customer_replied').
 *
 * 🔒 INVARIANTES:
 *   - org-scoped: o `where` SEMPRE filtra por `organizationId` + `contactPhone`.
 *   - Só cancela `status='pending'` E `cancelIfCustomerReplies=true` — não toca
 *     em mensagens já 'sent'/'cancelled'/'failed', nem em follow-ups marcados
 *     para ignorar a resposta do cliente.
 *   - FAIL-OPEN (responder ao cliente é sagrado): qualquer erro no cancelamento
 *     é logado e a função retorna 0. NUNCA propaga exceção que pudesse derrubar o
 *     processamento do inbound.
 *   - `db` é loose-typed (subset estrutural) de propósito — NÃO importa o
 *     PrismaClient concreto, mantendo o módulo testável com mock simples.
 */

// ---------------------------------------------------------------------------
// Contrato mínimo do DB (subset estrutural — testável sem PrismaClient)
// ---------------------------------------------------------------------------

/**
 * Subset do PrismaClient que esta função usa: apenas
 * `scheduledMessage.updateMany`. Tipado de forma estrutural/frouxa (args e
 * retorno mínimos) para aceitar tanto o client real quanto um mock de teste,
 * sem acoplar ao @prisma/client.
 */
export interface CancelOnInboundDb {
  scheduledMessage: {
    updateMany: (args: {
      where: {
        organizationId: string
        contactPhone: string
        status: string
        cancelIfCustomerReplies: boolean
      }
      data: {
        status: string
        cancelledReason: string
      }
    }) => Promise<{ count: number }>
  }
}

export interface CancelOnInboundArgs {
  readonly organizationId: string
  readonly contactPhone: string
}

// ---------------------------------------------------------------------------
// Cancelamento (org-scoped, fail-open)
// ---------------------------------------------------------------------------

/**
 * Cancela todos os follow-ups proativos PENDENTES do par
 * (organizationId, contactPhone) que pedem `cancelIfCustomerReplies`, marcando
 * `status='cancelled'` + `cancelledReason='customer_replied'`.
 *
 * Retorna a quantidade de linhas canceladas. FAIL-OPEN: erro → loga e retorna 0
 * (nunca lança — o processamento do inbound não pode quebrar por causa disto).
 */
export async function cancelPendingProactiveOnInbound(
  db: CancelOnInboundDb,
  args: CancelOnInboundArgs,
): Promise<number> {
  try {
    const result = await db.scheduledMessage.updateMany({
      where: {
        organizationId: args.organizationId,
        contactPhone: args.contactPhone,
        status: 'pending',
        cancelIfCustomerReplies: true,
      },
      data: {
        status: 'cancelled',
        cancelledReason: 'customer_replied',
      },
    })
    return result.count
  } catch (err) {
    // Fail-open: responder ao cliente é sagrado. Loga e segue (retorna 0).
    console.warn(
      '[cancel-on-inbound] falha ao cancelar follow-ups pendentes (não-fatal):',
      err instanceof Error ? err.message : String(err),
    )
    return 0
  }
}
