/**
 * notify-member-whatsapp — helper de envio 6A da ROLETA (folha pura, fail-safe).
 *
 * Responsabilidade ÚNICA: dado um membro escolhido pela roleta, tentar avisá-lo
 * por WhatsApp que uma conversa foi atribuída a ele. É PURO upside sobre a
 * Notification in-app (que continua sendo o piso de auditoria em
 * `dispatch-to-agent.ts`): se qualquer coisa der errado aqui, o turno do agente
 * segue idêntico e o aviso in-app já cobre o caso.
 *
 * Decisão 6A (ver runtimeContract da M1):
 *   - A Connection do org é a fonte da instância/credencial (token + baseUrl),
 *     exatamente como em `outbound.service.ts`.
 *   - Rate-limit dedicado por (org + atendente) para NÃO floodar a mesma pessoa.
 *   - sendText do uazapi-sender faz o HTTP cru.
 *
 * Garantias:
 *   - NUNCA lança. Todo o corpo está em try/catch; qualquer throw inesperado é
 *     engolido e logado, devolvendo `{ sent:false, skippedReason:'send_failed' }`.
 *   - Best-effort: o retorno é só para AUDITORIA (vai para customFields/metadata
 *     do handoff). O dispatch NÃO altera `success`/`message` com base nele.
 *   - org-scoped: a Connection é sempre filtrada por `organizationId`.
 *
 * Isolado de `dispatch-to-agent.ts` de propósito: mantém aquele arquivo enxuto e
 * deixa este testável (sender/rate-limit/Connection mockáveis por boundary).
 *
 * NÃO faz:
 *   - criar a Notification in-app (isso é do dispatch — o piso de auditoria);
 *   - pausar a IA / mexer na ChatSession;
 *   - escolher o membro (isso é da roleta / round-robin.service.ts).
 */

import { database } from '@/server/services/database'
import {
  sendText,
  normalizePhone,
} from '@/server/communication/services/uazapi-sender.service'
import { RateLimiter } from '@/lib/rate-limit/rate-limiter'

// ---------------------------------------------------------------------------
// Rate limiter dedicado (6A)
// ---------------------------------------------------------------------------

/**
 * Limita avisos de roleta por WhatsApp para NÃO floodar o MESMO atendente.
 *
 * Chave de verificação: `${organizationId}:${normalizePhone(whatsapp)}` — o
 * limite é por pessoa dentro do org, não por org inteira (vários atendentes do
 * mesmo org podem receber avisos no mesmo minuto sem se atrapalhar).
 *
 * `check()` é FAIL-OPEN (Redis indisponível → deixa passar), coerente com o
 * resto do runtime: rate-limit nunca pode derrubar um aviso legítimo. Sem
 * `failClosedInProduction` justamente porque isto é best-effort, não uma rota
 * crítica de auth.
 */
export const rouletteNotifyRateLimiter = new RateLimiter({
  limit: 10,
  window: 60, // 1 minuto
  prefix: 'ratelimit:roulette-notify',
})

// ---------------------------------------------------------------------------
// Resolução de instância/credencial (mesma fonte do outbound.service)
// ---------------------------------------------------------------------------

/** Fallback de baseUrl quando a Connection não traz um (idem outbound.service). */
const FALLBACK_BASE_URL =
  process.env.UAZAPI_BASE_URL ?? 'https://api.uazapi.com'

/**
 * Subset estrutural do delegate `connection` do Prisma usado por este helper.
 *
 * Espelha o padrão de `OutboundDatabase` em `outbound.service.ts`: a coluna
 * `uazapiBaseUrl` é lida de forma frouxa (pode não existir no client gerado),
 * então a tipamos como opcional aqui em vez de depender do tipo gerado do
 * `Connection`. Mantém ZERO `any` e não acopla a versão exata do Prisma.
 */
interface ConnectionCredentialDelegate {
  findFirst: (args: {
    where: { id: string; organizationId: string }
    select: { uazapiToken: true; uazapiBaseUrl: true }
  }) => Promise<{
    uazapiToken?: string | null
    uazapiBaseUrl?: string | null
  } | null>
}

/**
 * Acessa o delegate `connection` através do subset estrutural acima, sem `any`.
 * `database.connection` existe sempre (modelo estável); o cast estrutural só
 * relaxa o shape do `select`/retorno para permitir ler `uazapiBaseUrl`.
 */
function getConnectionDelegate(): ConnectionCredentialDelegate {
  return (database as unknown as { connection: ConnectionCredentialDelegate })
    .connection
}

// ---------------------------------------------------------------------------
// Contrato público
// ---------------------------------------------------------------------------

/** Motivos pelos quais o WhatsApp NÃO foi enviado (auditoria do fallback in-app). */
export type RouletteNotifySkipReason =
  | 'no_whatsapp'
  | 'no_instance'
  | 'rate_limited'
  | 'send_failed'

export interface TrySendRouletteWhatsAppArgs {
  /** Tenant boundary — sempre filtra a Connection por aqui. */
  organizationId: string
  /** Connection (instância UAZapi) usada para enviar — vem do ToolExecutionContext. */
  connectionId: string
  /** Membro escolhido pela roleta. `whatsapp` null = membro sem WhatsApp (não-usuário sem número, ou usuário sem telefone). */
  member: {
    whatsapp: string | null
    displayName: string
  }
  /** Telefone do CONTATO/cliente cuja conversa foi atribuída (vai no texto do aviso). */
  contactPhone: string
  /** Motivo do encaminhamento (mesmo `reason` do dispatch_to_agent). */
  reason: string
  /** Resumo opcional da conversa, para o atendente assumir rápido. */
  summary: string | null
  /** Urgência da fila — modula o tom do aviso. */
  urgency: 'low' | 'medium' | 'high'
}

export interface TrySendRouletteWhatsAppResult {
  /** true só quando o sendText retornou success. */
  sent: boolean
  /** Presente quando `sent=false` — por que caiu no fallback in-app. */
  skippedReason?: RouletteNotifySkipReason
}

// ---------------------------------------------------------------------------
// Montagem do texto do aviso
// ---------------------------------------------------------------------------

const URGENCY_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: 'baixa',
  medium: 'média',
  high: 'ALTA',
}

/**
 * Monta o texto do aviso de roleta enviado ao atendente.
 *
 * Determinístico e auto-contido (sem I/O) para ser testável. Inclui o nome do
 * atendente, o telefone do contato, o motivo, a urgência e — quando houver — o
 * resumo da conversa.
 */
export function buildRouletteNotifyText(args: {
  displayName: string
  contactPhone: string
  reason: string
  summary: string | null
  urgency: 'low' | 'medium' | 'high'
}): string {
  const lines: string[] = [
    `Olá, ${args.displayName}! Uma conversa foi atribuída a você pela roleta de atendimento.`,
    '',
    `Cliente: ${args.contactPhone}`,
    `Urgência: ${URGENCY_LABEL[args.urgency]}`,
    `Motivo: ${args.reason}`,
  ]

  const summary = args.summary?.trim()
  if (summary) {
    lines.push('', `Resumo: ${summary}`)
  }

  lines.push('', 'Abra o painel para assumir a conversa.')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Helper principal (fail-safe — NUNCA lança)
// ---------------------------------------------------------------------------

/**
 * Tenta avisar o membro escolhido pela roleta via WhatsApp (decisão 6A).
 *
 * Passos (todos dentro de um try/catch global que devolve `send_failed`):
 *   1. Sem `member.whatsapp` → `{ sent:false, skippedReason:'no_whatsapp' }`.
 *   2. Resolve a Connection do org (token + baseUrl). Sem token/instância →
 *      `{ sent:false, skippedReason:'no_instance' }`.
 *   3. Rate-limit por (org + atendente), fail-open. Estourou →
 *      `{ sent:false, skippedReason:'rate_limited' }`.
 *   4. `sendText` (que já é fail-safe e devolve `{ success, error }`). Falhou →
 *      `{ sent:false, skippedReason:'send_failed' }`.
 *   5. Sucesso → `{ sent:true }`.
 *
 * Em TODOS os caminhos de skip o aviso in-app já foi (ou será) criado pelo
 * dispatch — este retorno serve só para registrar `whatsappNotified` na
 * auditoria do handoff. NUNCA derruba o turno.
 */
export async function trySendRouletteWhatsApp(
  args: TrySendRouletteWhatsAppArgs,
): Promise<TrySendRouletteWhatsAppResult> {
  const { organizationId, connectionId, member } = args

  try {
    // 1. Membro sem WhatsApp → só o fallback in-app cobre.
    const whatsapp = member.whatsapp?.trim()
    if (!whatsapp) {
      return { sent: false, skippedReason: 'no_whatsapp' }
    }

    // 2. Resolve a instância/credencial (Connection é a fonte, igual outbound).
    const connection = await getConnectionDelegate().findFirst({
      where: { id: connectionId, organizationId },
      select: { uazapiToken: true, uazapiBaseUrl: true },
    })
    const token = connection?.uazapiToken
    if (!token) {
      return { sent: false, skippedReason: 'no_instance' }
    }

    // 3. Rate-limit por atendente (fail-open). Não floodar a mesma pessoa.
    const limitKey = `${organizationId}:${normalizePhone(whatsapp)}`
    const limit = await rouletteNotifyRateLimiter.check(limitKey)
    if (!limit.success) {
      return { sent: false, skippedReason: 'rate_limited' }
    }

    // 4. Envio cru via uazapi-sender (já fail-safe: devolve { success, error }).
    const baseUrl = connection.uazapiBaseUrl ?? FALLBACK_BASE_URL
    const text = buildRouletteNotifyText({
      displayName: member.displayName,
      contactPhone: args.contactPhone,
      reason: args.reason,
      summary: args.summary,
      urgency: args.urgency,
    })

    const result = await sendText(token, baseUrl, whatsapp, text)
    if (!result.success) {
      console.warn(
        '[roulette-6A] envio falhou (ignored):',
        result.error ?? 'erro desconhecido',
      )
      return { sent: false, skippedReason: 'send_failed' }
    }

    return { sent: true }
  } catch (error) {
    // Fail-safe total: qualquer throw inesperado é engolido — o turno segue.
    const msg = error instanceof Error ? error.message : String(error)
    console.warn('[roulette-6A] envio falhou (ignored):', msg)
    return { sent: false, skippedReason: 'send_failed' }
  }
}
