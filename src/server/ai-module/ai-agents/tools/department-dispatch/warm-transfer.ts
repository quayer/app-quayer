/**
 * warm-transfer — F0 do épico QR/warm-transfer (folha pura, fail-safe).
 *
 * Quando o membro escolhido pela roleta tem uma instância WhatsApp PRÓPRIA
 * (DepartmentMember.connectionId), o handoff faz "warm transfer": a conexão DO
 * MEMBRO envia a 1ª mensagem AO CLIENTE, para o atendimento continuar no WhatsApp
 * do humano. O humano responde no próprio app (a conexão dele não tem agente, logo
 * o bot não processa o inbound dela). A IA do bot já foi pausada pelo dispatch.
 *
 * Garantias (espelha notify-member-whatsapp):
 *   - NUNCA lança (try/catch global → { sent:false, skippedReason }).
 *   - Best-effort: o retorno é só auditoria (customFields.handoff.warmTransfer).
 *     O dispatch NÃO altera success/message com base nisso.
 *   - org-scoped: a Connection do membro é filtrada por organizationId.
 *   - Sem connectionId → no-op silencioso (comportamento atual preservado).
 */

import { database } from '@/server/services/database'
import {
  sendText,
  normalizePhone,
} from '@/server/communication/services/uazapi-sender.service'

const FALLBACK_BASE_URL = process.env.UAZAPI_BASE_URL ?? 'https://api.uazapi.com'

interface ConnCredDelegate {
  findFirst: (args: {
    where: { id: string; organizationId: string }
    select: { uazapiToken: true; uazapiBaseUrl: true }
  }) => Promise<{ uazapiToken?: string | null; uazapiBaseUrl?: string | null } | null>
}

function getConnDelegate(): ConnCredDelegate {
  return (database as unknown as { connection: ConnCredDelegate }).connection
}

export type WarmTransferSkipReason = 'no_connection' | 'no_instance' | 'send_failed'

export interface WarmTransferResult {
  sent: boolean
  skippedReason?: WarmTransferSkipReason
}

/** Texto de abertura enviado AO CLIENTE pela conexão do membro. Determinístico. */
export function buildWarmTransferText(memberDisplayName: string): string {
  const name = memberDisplayName?.trim() || 'um atendente'
  return [
    `Olá! Aqui é ${name}, vou continuar seu atendimento por aqui. 👋`,
    'Pode me enviar sua dúvida que já te ajudo.',
  ].join('\n')
}

/**
 * Tenta o warm transfer: a conexão própria do membro manda a abertura ao cliente.
 * Sem connectionId → { sent:false, 'no_connection' } (caminho normal segue).
 */
export async function tryWarmTransferToClient(args: {
  organizationId: string
  memberConnectionId: string | null
  contactPhone: string
  memberDisplayName: string
}): Promise<WarmTransferResult> {
  try {
    const connId = args.memberConnectionId?.trim()
    if (!connId) return { sent: false, skippedReason: 'no_connection' }

    const conn = await getConnDelegate().findFirst({
      where: { id: connId, organizationId: args.organizationId },
      select: { uazapiToken: true, uazapiBaseUrl: true },
    })
    const token = conn?.uazapiToken
    if (!token) return { sent: false, skippedReason: 'no_instance' }

    const baseUrl = conn.uazapiBaseUrl ?? FALLBACK_BASE_URL
    const text = buildWarmTransferText(args.memberDisplayName)
    const res = await sendText(token, baseUrl, normalizePhone(args.contactPhone), text)
    return res.success ? { sent: true } : { sent: false, skippedReason: 'send_failed' }
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    console.warn('[warm-transfer] envio falhou (ignored):', m)
    return { sent: false, skippedReason: 'send_failed' }
  }
}
