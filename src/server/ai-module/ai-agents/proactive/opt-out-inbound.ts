/**
 * opt-out-inbound — F1/F2b: aplica o OPT-OUT de proatividade quando o cliente pede
 * para parar de receber mensagens (épico `specs/builder-proatividade`; FR-PRO-08 /
 * NFR-PRO-2 — compliance/LGPD).
 *
 * A razão de ser (por que aqui, no inbound):
 *   No instante em que confirmamos um inbound GENUÍNO do cliente (pós-dedup,
 *   não-echo, org + telefone resolvidos), checamos se o TEXTO é um pedido de
 *   descadastro (`detectOptOut`, conservador). Se for:
 *     1. grava/atualiza um `ContactOptOut` (opt-out durável por org+telefone) — a
 *        mera existência da linha bloqueia QUALQUER envio proativo futuro
 *        (`loadEligibility` do worker lê isto → `canSendProactive` recusa);
 *     2. cancela TODOS os `ScheduledMessage` 'pending' do contato (não só os
 *        `cancelIfCustomerReplies` — opt-out cala tudo), com reason 'opted_out'.
 *
 *   Difere do `cancel-on-inbound` (que só cancela `cancelIfCustomerReplies=true` e
 *   NÃO grava opt-out durável): aqui o cliente pediu explicitamente para sair, então
 *   o efeito é permanente (até novo opt-in) e abrange todos os pendentes.
 *
 * 🔒 INVARIANTES:
 *   - org-scoped: TODO `where` filtra por `organizationId` (+ `phone`/`contactPhone`).
 *   - Idempotente: upsert não falha se já existe; o cancelamento converge.
 *   - FAIL-OPEN (responder ao cliente é sagrado): qualquer erro de DB é logado e a
 *     função NUNCA propaga exceção que pudesse derrubar o processamento do inbound.
 *   - `db` é loose-typed (subset estrutural) de propósito — testável sem PrismaClient.
 */

import { detectOptOut } from './opt-out-detection.pure'

// ---------------------------------------------------------------------------
// Contrato mínimo do DB (subset estrutural — testável sem PrismaClient)
// ---------------------------------------------------------------------------

/**
 * Subset do PrismaClient que esta função usa: `contactOptOut.upsert` (durável) +
 * `scheduledMessage.updateMany` (cancela pendentes). Tipado de forma estrutural/
 * frouxa para aceitar tanto o client real quanto um mock de teste.
 */
export interface OptOutInboundDb {
  contactOptOut: {
    upsert: (args: {
      where: { organizationId_phone: { organizationId: string; phone: string } }
      create: { organizationId: string; phone: string; reason: string }
      update: { reason: string }
    }) => Promise<unknown>
  }
  scheduledMessage: {
    updateMany: (args: {
      where: {
        organizationId: string
        contactPhone: string
        status: string
      }
      data: { status: string; cancelledReason: string }
    }) => Promise<{ count: number }>
  }
}

export interface OptOutInboundArgs {
  readonly organizationId: string
  readonly contactPhone: string
  /** Texto JÁ enriquecido/normalizado do inbound do cliente. */
  readonly text: string | null | undefined
}

export interface OptOutInboundResult {
  /** A mensagem foi reconhecida como pedido de opt-out. */
  readonly optedOut: boolean
  /** Quantidade de follow-ups pendentes cancelados (0 se nenhum/erro). */
  readonly cancelled: number
}

// ---------------------------------------------------------------------------
// Aplicação do opt-out (org-scoped, fail-open)
// ---------------------------------------------------------------------------

/**
 * Detecta opt-out no texto do inbound e, se reconhecido, grava `ContactOptOut` +
 * cancela todos os `ScheduledMessage` 'pending' do contato.
 *
 * Retorna `{ optedOut, cancelled }`. `optedOut` reflete a DETECÇÃO (mesmo que o DB
 * falhe depois — o webhook usa isso só para log). FAIL-OPEN: erro de DB → loga e
 * retorna `cancelled: 0` (nunca lança).
 */
export async function handleOptOutOnInbound(
  db: OptOutInboundDb,
  args: OptOutInboundArgs,
): Promise<OptOutInboundResult> {
  if (!detectOptOut(args.text)) {
    return { optedOut: false, cancelled: 0 }
  }

  try {
    // 1. Opt-out durável (a existência da linha bloqueia envios futuros). reason
    //    auditável; truncado defensivamente (a coluna é TEXT, mas evitamos guardar
    //    a mensagem inteira — só o trecho que justifica).
    const reason = `inbound:${(args.text ?? '').slice(0, 80)}`
    await db.contactOptOut.upsert({
      where: {
        organizationId_phone: {
          organizationId: args.organizationId,
          phone: args.contactPhone,
        },
      },
      create: {
        organizationId: args.organizationId,
        phone: args.contactPhone,
        reason,
      },
      update: { reason },
    })

    // 2. Cancela TODOS os pendentes do contato (opt-out cala tudo, não só os
    //    cancelIfCustomerReplies). reason 'opted_out' para auditoria.
    const result = await db.scheduledMessage.updateMany({
      where: {
        organizationId: args.organizationId,
        contactPhone: args.contactPhone,
        status: 'pending',
      },
      data: { status: 'cancelled', cancelledReason: 'opted_out' },
    })

    return { optedOut: true, cancelled: result.count }
  } catch (err) {
    // Fail-open: responder ao cliente é sagrado. Loga e segue.
    console.warn(
      '[opt-out-inbound] falha ao aplicar opt-out (não-fatal):',
      err instanceof Error ? err.message : String(err),
    )
    return { optedOut: true, cancelled: 0 }
  }
}
