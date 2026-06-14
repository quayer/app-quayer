/**
 * proactive-history — F1.5: mapper PURO que torna LEGÍVEL o histórico de envios
 * proativos (épico `specs/builder-proatividade`). Traduz os códigos opacos de
 * `ScheduledMessage.status` + `cancelledReason` (gerados pelo worker de envio, pelo
 * cancel-on-inbound e pelo opt-out) em rótulos PT amigáveis, para o usuário entender
 * POR QUE uma mensagem proativa foi enviada, agendada, cancelada ou falhou.
 *
 * Acceptance (plano-tarefas-faltantes F1.5): "Usuário consegue ver por que uma
 * mensagem proativa foi enviada ou bloqueada."
 *
 * Pura: sem IO, sem `any`. A leitura org/project-scoped do DB vive na rota
 * (`projects/routes/proactive-history.routes.ts`); aqui só formatamos a linha.
 *
 * Vocabulário de reasons (fonte → código):
 *   - cancel-on-inbound → `customer_replied`
 *   - opt-out-inbound / gate → `opted_out`
 *   - gate de elegibilidade → `suppressed` | `anti_spam` | `outside_window_no_template`
 *   - worker de envio → `no_text_resolved` | `template_send_failed` | `no_session` |
 *     `no_blocks_sent` | (string de erro arbitrária do transporte)
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Linha mínima de `ScheduledMessage` que o mapper formata. */
export interface ProactiveMessageRow {
  readonly id: string
  readonly status: string
  /** Motivo do AGENDAMENTO (passado ao create_followup — "por que foi agendado"). */
  readonly reason: string
  readonly messageGoal: string | null
  readonly scheduledAt: Date
  readonly sentAt: Date | null
  readonly cancelledReason: string | null
  readonly contactPhone: string
  readonly createdAt: Date
}

/** Item de histórico já LEGÍVEL para o painel (datas em ISO, rótulos PT). */
export interface ProactiveHistoryItem {
  readonly id: string
  readonly status: string
  readonly statusLabel: string
  readonly contactPhone: string
  /** Objetivo/motivo do follow-up (o que se pretendia com a mensagem). */
  readonly goal: string | null
  readonly scheduledAt: string
  readonly sentAt: string | null
  /** Código bruto do desfecho (null quando não há — ex.: enviado/pendente). */
  readonly outcomeReason: string | null
  /** Rótulo PT do desfecho: por que enviou / bloqueou / falhou. */
  readonly outcomeLabel: string
}

// ---------------------------------------------------------------------------
// Dicionários (status + reason → PT)
// ---------------------------------------------------------------------------

const STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: 'Agendado',
  sent: 'Enviado',
  cancelled: 'Cancelado',
  failed: 'Falhou',
}

/** Reasons conhecidos (vocabulário fechado) → frase amigável. */
const REASON_LABELS: Readonly<Record<string, string>> = {
  customer_replied: 'Cliente respondeu antes do envio',
  opted_out: 'Cliente pediu para não receber mais mensagens',
  suppressed: 'Atendimento estava pausado ou com um humano',
  anti_spam: 'Limite de mensagens sem resposta atingido',
  outside_window_no_template: 'Fora da janela de 24h e sem template aprovado',
  no_text_resolved: 'Não foi possível gerar o texto com segurança',
  template_send_failed: 'Falha ao enviar o template aprovado',
  no_session: 'Sessão de origem indisponível',
  no_blocks_sent: 'Nenhum bloco de mensagem foi entregue',
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/** Rótulo PT do status; fallback para o próprio código se desconhecido. */
export function describeProactiveStatus(status: string): string {
  return STATUS_LABELS[status] ?? status
}

/**
 * Descreve o DESFECHO (por que enviou/agendou/cancelou/falhou):
 *  - sent     → "Mensagem enviada" (sem código de bloqueio);
 *  - pending  → "Aguardando horário de envio";
 *  - cancelled/failed → usa `cancelledReason`: rótulo conhecido OU, para erro
 *    arbitrário do transporte, "Erro: <código>" (failed) / o próprio código.
 */
export function describeProactiveOutcome(
  status: string,
  cancelledReason: string | null,
): { reason: string | null; label: string } {
  if (status === 'sent') return { reason: null, label: 'Mensagem enviada' }
  if (status === 'pending') {
    return { reason: null, label: 'Aguardando horário de envio' }
  }

  const code = cancelledReason
  if (!code) {
    return {
      reason: null,
      label: status === 'cancelled' ? 'Cancelado' : 'Falhou',
    }
  }

  const known = REASON_LABELS[code]
  if (known) return { reason: code, label: known }

  // failed com string de erro arbitrária do transporte (ex.: erro do Graph).
  return {
    reason: code,
    label: status === 'failed' ? `Erro: ${code}` : code,
  }
}

/** Converte a linha do DB num item de histórico legível (datas em ISO). */
export function toProactiveHistoryItem(
  row: ProactiveMessageRow,
): ProactiveHistoryItem {
  const outcome = describeProactiveOutcome(row.status, row.cancelledReason)
  return {
    id: row.id,
    status: row.status,
    statusLabel: describeProactiveStatus(row.status),
    contactPhone: row.contactPhone,
    goal: row.messageGoal ?? row.reason ?? null,
    scheduledAt: row.scheduledAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    outcomeReason: outcome.reason,
    outcomeLabel: outcome.label,
  }
}
