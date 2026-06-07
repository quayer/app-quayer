/**
 * transfer_to_human — tool UNIFICADA de handoff para humano.
 *
 * Consolida o que antes eram 3 tools:
 *   - transfer_to_human  → routing:'queue'  + pauseAI:true   (fila geral, painel)
 *   - notify_team        → routing:'queue'  + pauseAI:false  (avisa SEM pausar)
 *   - dispatch_to_agent  → routing:'department'               (roleta por setor)
 * E adiciona um modo novo:
 *   - routing:'self'     → pinga o WhatsApp do próprio número conectado
 *                          (Connection.phoneNumber) — o "self-chat" do dono.
 *
 * Reaproveita executores existentes (não duplica lógica): routing:'department'
 * delega ao executeDispatchToAgent maduro (roleta + fallbacks + aviso 6A).
 *
 * Os antigos tools notify_team e dispatch_to_agent foram REMOVIDOS (Fase 2): as
 * capacidades viraram rotas desta tool. A migração de enabledTools
 * (20260606070000) garantiu que todo agente que os usava ganhasse transfer_to_human.
 *
 * Convenção de todas as rotas: a tool NÃO manda mensagem ao cliente — o agente
 * confirma por texto. O modo 'self' é a exceção parcial: ele envia um AVISO ao
 * dono (não ao cliente).
 */

import { tool } from 'ai'
import { Prisma, type SessionStatus } from '@prisma/client'
import { z } from 'zod'
import { database } from '@/server/services/database'
import type { ToolExecutionContext } from './builtin-tools'
import {
  executeDispatchToAgent,
  rouletteNotifyRateLimiter,
} from './department-dispatch'
import {
  sendText,
  normalizePhone,
} from '@/server/communication/services/uazapi-sender.service'
import {
  computeBusinessState,
  businessStateToDict,
} from '@/server/ai-module/ai-agents/services/business-hours.service'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const transferToHumanInputSchema = z.object({
  routing: z
    .enum(['queue', 'department', 'self'])
    .default('queue')
    .describe(
      "Como encaminhar: 'queue' = fila geral (painel da org); 'department' = " +
        "roleta de um setor (passe departmentId ou use o setor do agente); " +
        "'self' = avisa o WhatsApp do próprio número conectado (o dono). Padrão 'queue'.",
    ),
  pauseAI: z
    .boolean()
    .default(true)
    .describe(
      'true (padrão) pausa a IA e transfere. false apenas AVISA a equipe sem ' +
        'pausar (use para alertas informativos — antigo notify_team).',
    ),
  reason: z
    .string()
    .min(10)
    .max(500)
    .describe('Motivo do encaminhamento/aviso (ex: "cliente quer falar de contrato").'),
  razao: z
    .enum([
      'lead_qualificado',
      'lead_pediu_humano',
      'fora_escopo_critico',
      'fluxo_complexo',
    ])
    .optional()
    .describe(
      'Categoria estruturada do handoff (para analytics/auditoria). Opcional — ' +
        'complementa `reason` (texto livre).',
    ),
  urgency: z
    .enum(['low', 'medium', 'high'])
    .default('medium')
    .describe('Urgência: low, medium ou high.'),
  summary: z
    .string()
    .max(800)
    .optional()
    .describe('Resumo da conversa para o humano assumir rápido.'),
  departmentId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Só para routing='department': Department.id de destino. Se omitir, usa o " +
        'departamento configurado do agente.',
    ),
})

export type TransferToHumanInput = z.infer<typeof transferToHumanInputSchema>

export interface TransferToHumanResult {
  success: boolean
  message: string
  routing?: 'queue' | 'department' | 'self'
  paused?: boolean
  /** routing:'self' — se o aviso ao dono saiu por WhatsApp (auditoria). */
  whatsappNotified?: boolean | null
  /** routing:'department' — repassa os campos do dispatch. */
  departmentId?: string
  assignedAgentId?: string | null
  assignedAgentName?: string | null
  dispatchedVia?: 'roulette' | 'queue'
  /**
   * Melhoria #2 — contexto de horário comercial (status + orientacao_resposta),
   * presente quando o agente tem businessHours configurado. O LLM usa a
   * `orientacao_resposta` para dizer ao lead QUANDO a equipe responde.
   */
  atendimento?: Record<string, unknown>
}

const URGENCY_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: 'baixa',
  medium: 'média',
  high: 'ALTA',
}

// ---------------------------------------------------------------------------
// routing:'queue' — fila geral (com ou sem pausa)
// ---------------------------------------------------------------------------

/**
 * Encaminha para a fila geral da org. Com pauseAI=true reproduz o antigo
 * transfer_to_human (pausa + handoff + notifica). Com pauseAI=false reproduz o
 * antigo notify_team (apenas notifica, sem pausar nem marcar handoff).
 */
export async function executeQueueHandoff(
  ctx: ToolExecutionContext,
  input: Pick<TransferToHumanInput, 'reason' | 'urgency' | 'summary' | 'pauseAI' | 'razao'>,
): Promise<TransferToHumanResult> {
  const { reason, urgency, summary, pauseAI, razao } = input

  try {
    const session = await database.chatSession.findUnique({
      where: { id: ctx.sessionId },
      select: { customFields: true, contactPhone: true, status: true },
    })
    if (!session) {
      return { success: false, message: 'Sessão não encontrada.', routing: 'queue' }
    }

    const existing =
      (session.customFields as Record<string, unknown> | null) ?? {}

    if (pauseAI) {
      // ── pausa + handoff (transfer_to_human clássico) ──
      await database.chatSession.update({
        where: { id: ctx.sessionId },
        data: {
          aiEnabled: false,
          aiBlockReason: reason,
          pausedBy: 'agent',
          status: session.status === 'CLOSED' ? session.status : 'PAUSED',
          customFields: {
            ...existing,
            handoff: {
              reason,
              razao: razao ?? null,
              urgency,
              summary: summary ?? null,
              transferredAt: new Date().toISOString(),
              dispatchedVia: 'queue',
            },
          } as Prisma.InputJsonValue,
          tags: { push: 'human_handoff' },
        },
      })

      await database.notification.create({
        data: {
          organizationId: ctx.organizationId,
          type: urgency === 'high' ? 'ERROR' : 'WARNING',
          title:
            urgency === 'high'
              ? 'Transferência urgente para humano'
              : 'Transferência para humano',
          description: `${session.contactPhone}: ${reason}`,
          source: 'ai-agent',
          sourceId: ctx.sessionId,
          actionUrl: `/conversations/${ctx.sessionId}`,
          actionLabel: 'Assumir conversa',
          metadata: {
            sessionId: ctx.sessionId,
            urgency,
            razao: razao ?? null,
            summary: summary ?? null,
            routing: 'queue',
            triggeredBy: 'transfer_to_human_tool',
          },
        },
      })

      return {
        success: true,
        routing: 'queue',
        paused: true,
        message: `Transferido para humano (${urgency}).`,
      }
    }

    // ── notifica sem pausar (notify_team clássico) ──
    await database.notification.create({
      data: {
        organizationId: ctx.organizationId,
        type: urgency === 'high' ? 'WARNING' : 'INFO',
        title:
          urgency === 'high'
            ? 'Alerta do Agente IA (alta prioridade)'
            : 'Notificação do Agente IA',
        description: reason,
        source: 'ai-agent',
        sourceId: ctx.sessionId,
        actionUrl: `/conversations/${ctx.sessionId}`,
        actionLabel: 'Ver conversa',
        metadata: {
          sessionId: ctx.sessionId,
          contactId: ctx.contactId,
          urgency,
          razao: razao ?? null,
          routing: 'queue',
          triggeredBy: 'transfer_to_human_tool(notify)',
        },
      },
    })

    return {
      success: true,
      routing: 'queue',
      paused: false,
      message: `Equipe notificada (sem pausar a IA): "${reason}".`,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[transfer_to_human:queue] Failed:', msg)
    return { success: false, message: `Erro ao encaminhar: ${msg}`, routing: 'queue' }
  }
}

// ---------------------------------------------------------------------------
// routing:'self' — avisa o WhatsApp do próprio número conectado (dono)
// ---------------------------------------------------------------------------

/** Subset estrutural do delegate connection (lê uazapiBaseUrl/phoneNumber sem acoplar ao tipo gerado). */
interface ConnSelfDelegate {
  findFirst: (args: {
    where: { id: string; organizationId: string }
    select: { uazapiToken: true; uazapiBaseUrl: true; phoneNumber: true }
  }) => Promise<{
    uazapiToken?: string | null
    uazapiBaseUrl?: string | null
    phoneNumber?: string | null
  } | null>
}

function getConnSelfDelegate(): ConnSelfDelegate {
  return (database as unknown as { connection: ConnSelfDelegate }).connection
}

const FALLBACK_BASE_URL = process.env.UAZAPI_BASE_URL ?? 'https://api.uazapi.com'

/** Texto do aviso enviado ao próprio número conectado (dono). Determinístico. */
export function buildSelfHandoffText(args: {
  contactPhone: string
  reason: string
  summary: string | null
  urgency: 'low' | 'medium' | 'high'
}): string {
  const lines = [
    '🔔 Um lead precisa de você.',
    '',
    `Cliente: ${args.contactPhone}`,
    `Urgência: ${URGENCY_LABEL[args.urgency]}`,
    `Motivo: ${args.reason}`,
  ]
  const summary = args.summary?.trim()
  if (summary) lines.push('', `Resumo: ${summary}`)
  lines.push('', 'Abra a conversa para assumir o atendimento.')
  return lines.join('\n')
}

/**
 * Avisa o dono no próprio número conectado (self-chat) e, por padrão, pausa a IA.
 * Fail-safe no envio: se não houver instância/número ou o envio falhar, ainda
 * cria a Notification in-app (piso de auditoria) e — quando pauseAI — pausa a
 * sessão; o retorno marca whatsappNotified para auditoria.
 */
export async function executeSelfHandoff(
  ctx: ToolExecutionContext,
  input: Pick<TransferToHumanInput, 'reason' | 'urgency' | 'summary' | 'pauseAI' | 'razao'>,
): Promise<TransferToHumanResult> {
  const { reason, urgency, summary, pauseAI, razao } = input

  try {
    const session = await database.chatSession.findUnique({
      where: { id: ctx.sessionId },
      select: { customFields: true, contactPhone: true, status: true },
    })
    if (!session) {
      return { success: false, message: 'Sessão não encontrada.', routing: 'self' }
    }

    // 1. Tenta avisar o número conectado (best-effort, nunca derruba o turno).
    let whatsappNotified = false
    try {
      const connection = await getConnSelfDelegate().findFirst({
        where: { id: ctx.connectionId, organizationId: ctx.organizationId },
        select: { uazapiToken: true, uazapiBaseUrl: true, phoneNumber: true },
      })
      const token = connection?.uazapiToken
      const phone = connection?.phoneNumber?.trim()

      if (token && phone) {
        const limitKey = `${ctx.organizationId}:${normalizePhone(phone)}`
        const limit = await rouletteNotifyRateLimiter.check(limitKey)
        if (limit.success) {
          const baseUrl = connection!.uazapiBaseUrl ?? FALLBACK_BASE_URL
          const text = buildSelfHandoffText({
            contactPhone: session.contactPhone,
            reason,
            summary: summary ?? null,
            urgency,
          })
          const sent = await sendText(token, baseUrl, phone, text)
          whatsappNotified = sent.success === true
        }
      }
    } catch (sendErr) {
      const m = sendErr instanceof Error ? sendErr.message : String(sendErr)
      console.warn('[transfer_to_human:self] aviso WhatsApp falhou (ignored):', m)
    }

    const existing =
      (session.customFields as Record<string, unknown> | null) ?? {}

    // 2. Pausa + handoff (quando pauseAI).
    if (pauseAI) {
      await database.chatSession.update({
        where: { id: ctx.sessionId },
        data: {
          aiEnabled: false,
          aiBlockReason: reason,
          pausedBy: 'agent',
          status: session.status === 'CLOSED' ? session.status : 'PAUSED',
          customFields: {
            ...existing,
            handoff: {
              reason,
              razao: razao ?? null,
              urgency,
              summary: summary ?? null,
              transferredAt: new Date().toISOString(),
              dispatchedVia: 'self',
              whatsappNotified,
            },
          } as Prisma.InputJsonValue,
          tags: { push: 'human_handoff' },
        },
      })
    }

    // 3. Notification in-app = piso de auditoria (sempre).
    await database.notification.create({
      data: {
        organizationId: ctx.organizationId,
        type: urgency === 'high' ? 'ERROR' : 'WARNING',
        title:
          urgency === 'high'
            ? 'Lead urgente para o dono'
            : 'Lead encaminhado para o dono',
        description: `${session.contactPhone}: ${reason}`,
        source: 'ai-agent',
        sourceId: ctx.sessionId,
        actionUrl: `/conversations/${ctx.sessionId}`,
        actionLabel: 'Assumir conversa',
        metadata: {
          sessionId: ctx.sessionId,
          urgency,
          razao: razao ?? null,
          summary: summary ?? null,
          routing: 'self',
          whatsappNotified,
          triggeredBy: 'transfer_to_human_tool(self)',
        },
      },
    })

    const waNote = whatsappNotified
      ? ' Aviso enviado ao seu WhatsApp.'
      : ' (não foi possível avisar por WhatsApp — veja no painel.)'
    return {
      success: true,
      routing: 'self',
      paused: pauseAI,
      whatsappNotified,
      message: `Lead encaminhado para o dono (${urgency}).${waNote}`,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[transfer_to_human:self] Failed:', msg)
    return { success: false, message: `Erro ao encaminhar: ${msg}`, routing: 'self' }
  }
}

// ---------------------------------------------------------------------------
// Idempotência (#1) — dedupe de handoff por recência
// ---------------------------------------------------------------------------

/**
 * Janela de dedupe: se um handoff foi marcado há menos que isto, uma 2ª chamada
 * de transfer_to_human (retry/loop do LLM no mesmo turno) é tratada como no-op —
 * evita 2ª Notification + 2ª pausa. Curta o suficiente para permitir um
 * re-handoff LEGÍTIMO depois (ex.: conversa reaberta e encaminhada de novo).
 */
export const HANDOFF_DEDUPE_WINDOW_MS = 60_000

/**
 * true se a sessão já tem um `customFields.handoff` recente (dentro da janela).
 * Lê só customFields. FAIL-OPEN: qualquer erro de leitura → false (nunca bloquear
 * um handoff legítimo por causa do guard).
 */
export async function hasRecentHandoff(
  sessionId: string,
  nowMs: number = Date.now(),
  windowMs: number = HANDOFF_DEDUPE_WINDOW_MS,
): Promise<boolean> {
  try {
    const session = await database.chatSession.findUnique({
      where: { id: sessionId },
      select: { customFields: true },
    })
    const cf = (session?.customFields as Record<string, unknown> | null) ?? {}
    const handoff = cf.handoff as { transferredAt?: string } | undefined
    const ts = handoff?.transferredAt ? Date.parse(handoff.transferredAt) : NaN
    return Number.isFinite(ts) && nowMs - ts < windowMs
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Melhoria #2 — resolve o contexto de horário comercial do agente
// ---------------------------------------------------------------------------

interface StoredBusinessHours {
  schedule?: unknown
  timezone?: string | null
  holidays?: string[]
}

/**
 * Lê AIAgentConfig.businessHours (materializado do builderState) e computa o
 * estado do atendimento AGORA. Retorna `undefined` quando não há agente/horário
 * configurado (a tool simplesmente não inclui `atendimento`). FAIL-OPEN.
 */
export async function resolveAtendimento(
  ctx: ToolExecutionContext,
): Promise<Record<string, unknown> | undefined> {
  if (!ctx.agentConfigId) return undefined
  try {
    const cfg = await database.aIAgentConfig.findUnique({
      where: { id: ctx.agentConfigId },
      select: { businessHours: true },
    })
    const bh = (cfg?.businessHours ?? null) as StoredBusinessHours | null
    if (!bh || bh.schedule === undefined || bh.schedule === null) return undefined
    const state = computeBusinessState(
      bh.schedule,
      bh.timezone ?? undefined,
      Array.isArray(bh.holidays) ? bh.holidays : [],
    )
    return businessStateToDict(state)
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Executor unificado
// ---------------------------------------------------------------------------

export async function executeTransferToHuman(
  ctx: ToolExecutionContext,
  input: TransferToHumanInput,
): Promise<TransferToHumanResult> {
  // Contexto de horário comercial (#2): anexado a todos os retornos quando houver.
  const atendimento = await resolveAtendimento(ctx)

  // Idempotência: short-circuit se já houve handoff há instantes (mesmo turno).
  // Só dedupe quando ESTE pedido também pausa (pauseAI) — um aviso informativo
  // (pauseAI:false) pode legitimamente repetir e não escreve handoff de qualquer forma.
  if (input.pauseAI && (await hasRecentHandoff(ctx.sessionId))) {
    return {
      success: true,
      routing: input.routing,
      paused: true,
      message: 'Já transferido há instantes — ignorado para não duplicar.',
      atendimento,
    }
  }

  if (input.routing === 'department') {
    const r = await executeDispatchToAgent(ctx, {
      departmentId: input.departmentId,
      reason: input.reason,
      summary: input.summary,
      urgency: input.urgency,
    })
    return {
      success: r.success,
      message: r.message,
      routing: 'department',
      paused: r.success,
      departmentId: r.departmentId,
      assignedAgentId: r.assignedAgentId,
      assignedAgentName: r.assignedAgentName,
      dispatchedVia: r.dispatchedVia,
      atendimento,
    }
  }

  if (input.routing === 'self') {
    return { ...(await executeSelfHandoff(ctx, input)), atendimento }
  }

  return { ...(await executeQueueHandoff(ctx, input)), atendimento }
}

// ---------------------------------------------------------------------------
// Tool factory (spread into createBuiltinTools())
// ---------------------------------------------------------------------------

export function createTransferToHumanTool(ctx: ToolExecutionContext) {
  return tool({
    description:
      'Encaminha a conversa para um humano (ou apenas avisa a equipe). Escolha o ' +
      "destino com routing: 'queue' (fila/painel da org), 'department' (roleta de " +
      "um setor) ou 'self' (avisa o WhatsApp do próprio dono). Use pauseAI:false " +
      'para apenas alertar sem pausar a IA. Use quando o cliente pedir uma pessoa, ' +
      'reclamar, ou a situação exigir julgamento humano. O agente confirma por texto. ' +
      'O resultado pode trazer `atendimento` (status do horário comercial + ' +
      '`orientacao_resposta`): use a orientacao para dizer ao lead QUANDO a equipe ' +
      'responde. NUNCA invente horários — use só o que vier em `atendimento`.',
    inputSchema: transferToHumanInputSchema,
    execute: async (input) => executeTransferToHuman(ctx, input),
  })
}
