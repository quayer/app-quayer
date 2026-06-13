import { createHash } from 'crypto'

/**
 * Núcleo PURO de checkpoint/resume do envio outbound durável.
 *
 * Pré-requisito do F2b (proatividade). Sem IO além de crypto, sem Prisma.
 * Tudo aqui é determinístico e imutável — a Unidade 3 (IO/Prisma) orquestra
 * estas funções com persistência por bloco do providerMessageId.
 *
 * REGRA DE OURO — FAIL-OPEN (responsabilidade da camada de IO): se dispatchKey
 * ausente, dep ausente ou qualquer operação de dispatch lançar, a camada de IO
 * cai para o comportamento de HOJE (envio sem checkpoint). Estas funções puras
 * apenas modelam a decisão; nunca fazem IO nem lançam por entrada malformada —
 * sempre degradam para o resultado mais seguro contra DUPLICAÇÃO de mensagens.
 */

/** Estado de um bloco individual no plano de envio. */
export type BlockStatus = 'pending' | 'sent' | 'failed'

/** Checkpoint imutável de um bloco: índice + providerMessageId (se enviado) + status. */
export type BlockCheckpoint = {
  idx: number
  providerMessageId?: string
  status: BlockStatus
}

/**
 * Chave de idempotência do dispatch: sha256 hex de `${sessionId}:${inboundMessageId}`.
 * Determinístico — mesma entrada sempre produz o mesmo hash. Usa o mesmo
 * createHash('sha256') do dedup existente (tts.service / dedup outbound).
 */
export function deriveDispatchKey(sessionId: string, inboundMessageId: string): string {
  return createHash('sha256').update(`${sessionId}:${inboundMessageId}`).digest('hex')
}

/**
 * Plano inicial de blocos: todos 'pending'. totalBlocks <= 0 (ou não-inteiro/NaN)
 * → [] (nada a enviar).
 */
export function initBlockPlan(totalBlocks: number): BlockCheckpoint[] {
  if (!Number.isFinite(totalBlocks) || totalBlocks <= 0) return []
  const n = Math.floor(totalBlocks)
  const plan: BlockCheckpoint[] = []
  for (let idx = 0; idx < n; idx++) {
    plan.push({ idx, status: 'pending' })
  }
  return plan
}

/** Ação decidida ao reivindicar (claim) um dispatch existente. */
export type ResumeAction =
  | { action: 'skip' }
  | { action: 'fresh' }
  | { action: 'resume'; sentIdx: number[] }

/**
 * Extrai os índices de blocos já 'sent' de um `blocks` Json persistido,
 * parseando DEFENSIVAMENTE: se não for um array de objetos válidos, retorna [].
 */
function parseSentIdx(blocks: unknown): number[] {
  if (!Array.isArray(blocks)) return []
  const sent: number[] = []
  for (const raw of blocks) {
    if (typeof raw !== 'object' || raw === null) continue
    const candidate = raw as { idx?: unknown; status?: unknown }
    if (candidate.status === 'sent' && typeof candidate.idx === 'number' && Number.isFinite(candidate.idx)) {
      sent.push(candidate.idx)
    }
  }
  return sent
}

/**
 * Decide o que fazer com um dispatch existente ao reivindicá-lo.
 *
 * - null / 'queued'        → fresh   (nunca começou de fato)
 * - 'sent'                 → skip    (já concluído — idempotência)
 * - 'sending' / 'partial'  → resume  (crash no meio — retoma pulando os 'sent')
 * - status DESCONHECIDO    → ver escolha abaixo
 *
 * ESCOLHA p/ status desconhecido: o mal a evitar é DUPLICAÇÃO de mensagens ao
 * cliente, não o atraso. Por isso, se o `blocks` for parseável (array com
 * blocos 'sent'), tratamos como RESUME (pulamos o que já foi enviado). Só
 * quando não há blocks parseáveis (sentIdx vazio) caímos em 'fresh' — aí não há
 * checkpoint a preservar, então reenviar do zero não duplica nada já entregue.
 *
 * Para 'sending'/'partial' a regra é a mesma de parse: sentIdx vem dos blocos
 * marcados 'sent'; se o blocks estiver corrompido, sentIdx=[] e o resume
 * reenvia tudo (degradação segura — preferível a travar o turno).
 */
export function resumeDecision(
  existing: { status: string; blocks: unknown } | null,
): ResumeAction {
  if (existing === null) return { action: 'fresh' }

  const { status } = existing
  if (status === 'queued') return { action: 'fresh' }
  if (status === 'sent') return { action: 'skip' }

  if (status === 'sending' || status === 'partial') {
    return { action: 'resume', sentIdx: parseSentIdx(existing.blocks) }
  }

  // Status desconhecido: se há checkpoint parseável, retoma pulando os 'sent'
  // (anti-duplicação). Sem checkpoint → fresh.
  const sentIdx = parseSentIdx(existing.blocks)
  if (sentIdx.length > 0) return { action: 'resume', sentIdx }
  return { action: 'fresh' }
}

/** True se o bloco `idx` AINDA precisa ser enviado (não está 'sent'). */
export function shouldSendBlock(plan: BlockCheckpoint[], idx: number): boolean {
  const block = plan.find((b) => b.idx === idx)
  if (!block) return true
  return block.status !== 'sent'
}

/**
 * Aplica o resultado do envio de um bloco, retornando uma CÓPIA imutável do plano.
 * - success      → idx vira 'sent' (+ providerMessageId, se houver)
 * - !success     → idx vira 'failed'
 * - idx fora do range (não existe no plano) → retorna o plano inalterado (cópia).
 */
export function applyBlockResult(
  plan: BlockCheckpoint[],
  idx: number,
  r: { success: boolean; providerMessageId?: string },
): BlockCheckpoint[] {
  // Mapeia para uma CÓPIA imutável. Bloco com o idx alvo recebe o novo status;
  // os demais (e o caso idx fora do range) são clonados inalterados.
  return plan.map((b) => {
    if (b.idx !== idx) return { ...b }
    if (r.success) {
      const updated: BlockCheckpoint = { idx: b.idx, status: 'sent' }
      if (r.providerMessageId !== undefined) updated.providerMessageId = r.providerMessageId
      return updated
    }
    return { idx: b.idx, status: 'failed' as const }
  })
}

/** Resumo agregado do plano, gravado na linha do dispatch ao fim do turno. */
export type DispatchSummary = {
  status: 'sent' | 'partial' | 'failed'
  sentBlocks: number
  totalBlocks: number
}

/**
 * Sumariza o status final do plano:
 * - todos os blocos 'sent'  → 'sent'
 * - algum (mas não todos)   → 'partial'
 * - nenhum 'sent'           → 'failed'
 *
 * ESCOLHA p/ plano vazio: [] significa 0 blocos a enviar. Não há falha possível
 * — "nada a fazer" é sucesso. Retornamos {status:'sent', sentBlocks:0, totalBlocks:0}
 * (e NÃO 'failed'), evitando que um turno legítimo sem blocos seja marcado erro.
 */
export function summarizeStatus(plan: BlockCheckpoint[]): DispatchSummary {
  const totalBlocks = plan.length
  const sentBlocks = plan.filter((b) => b.status === 'sent').length

  if (totalBlocks === 0) return { status: 'sent', sentBlocks: 0, totalBlocks: 0 }
  if (sentBlocks === totalBlocks) return { status: 'sent', sentBlocks, totalBlocks }
  if (sentBlocks > 0) return { status: 'partial', sentBlocks, totalBlocks }
  return { status: 'failed', sentBlocks, totalBlocks }
}

/**
 * Detecta um dispatch "preso" (crash deixou em 'sending'/'partial' e não foi
 * retomado). True se status ∈ {'sending','partial'} E (now - updatedAt) >= staleMs.
 *
 * Datas inválidas (NaN) ou staleMs não-finito → false (fail-safe: não declara
 * preso o que não dá pra medir — evita reprocessar indevidamente).
 */
export function isStuckDispatch(
  row: { status: string; updatedAt: Date },
  now: Date,
  staleMs: number,
): boolean {
  if (row.status !== 'sending' && row.status !== 'partial') return false
  if (!Number.isFinite(staleMs)) return false
  const nowMs = now.getTime()
  const updatedMs = row.updatedAt.getTime()
  if (!Number.isFinite(nowMs) || !Number.isFinite(updatedMs)) return false
  return nowMs - updatedMs >= staleMs
}
