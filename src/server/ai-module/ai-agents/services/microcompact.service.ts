/**
 * Microcompact Service — token reduction for long agent conversations
 *
 * Reduz tokens em conversas longas do agente WhatsApp publicado.
 *
 * Estratégias:
 *  1. timeBasedMicrocompact — quando o gap desde a última mensagem
 *     assistant excede um threshold (default 30 min), substitui o
 *     conteúdo de tool_results antigos por um placeholder, mantendo
 *     intactos os N últimos (default 5). Mutação local de content.
 *
 *  2. cachedMicrocompact — identifica IDs de tool_calls compactáveis
 *     e retorna a lista de IDs a remover de um cache externo. Função
 *     puramente analítica (não muta `messages`).
 *
 *  3. estimateMessageTokens — estimador heurístico (chars/4 + padding
 *     4/3) usado para budget-check antes de chamadas LLM.
 *
 * Inspirado em `inspiration/claude-code-leak/src/services/compact/microCompact.ts`.
 *
 * IMPORTANTE: COMPACTABLE_TOOLS é o set de tools "barulhentas" cujo
 * resultado pode ser descartado sem perder rastreabilidade legal/auditoria.
 * Tools sensíveis (transfer_to_human, create_lead) NUNCA são compactadas.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Placeholder usado para substituir tool_results "limpos". */
export const CLEARED_PLACEHOLDER = '[Old tool result content cleared]'

/**
 * Tools cujo `tool_result` pode ser descartado quando antigos.
 *
 * Critério: nenhuma decisão de negócio é tomada com base nesse output
 * — o agente apenas usa o retorno como contexto efêmero.
 *
 * EXCLUÍDAS deliberadamente (precisam de auditoria/persistência):
 *   - transfer_to_human (escalonamento humano)
 *   - create_lead (gravação de lead no CRM)
 */
export const COMPACTABLE_TOOLS: ReadonlySet<string> = new Set<string>([
  'get_session_history',
  'search_contacts',
  'send_pricing',
  'schedule_appointment',
])

/** Imagens contam ~2000 tokens cada (padrão Claude Code). */
const IMAGE_MAX_TOKEN_SIZE = 2000

/** Default: gap em minutos para ativar o time-based microcompact. */
const DEFAULT_GAP_THRESHOLD_MINUTES = 30

/** Default: quantos tool_results mais recentes manter intactos. */
const DEFAULT_KEEP_LAST = 5

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Mensagem genérica do histórico do agente. Compatível com o shape do
 * Vercel AI SDK (role + content) e com message blocks no estilo
 * Anthropic SDK (array de blocks de tipo string).
 */
export interface MessageLike {
  role: 'user' | 'assistant' | 'system'
  content: string | unknown[]
  timestamp?: Date | string
}

/** Block discriminator helper — narrowing manual sobre `unknown`. */
interface BlockBase {
  type: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/** Estimativa "rough" de tokens a partir do número de chars. */
function roughTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Estima tokens para um array de mensagens.
 *
 * Heurística:
 *   - string content: chars / 4
 *   - text block: text.length / 4
 *   - tool_use block: (name + JSON.stringify(input)).length / 4
 *   - tool_result block: content.length / 4 (string) ou recursão em blocks
 *   - image/document block: IMAGE_MAX_TOKEN_SIZE (2000)
 *   - thinking/redacted_thinking: chars do payload / 4
 *
 * Aplica padding 4/3 ao final para ser conservador.
 */
export function estimateMessageTokens(messages: MessageLike[]): number {
  let total = 0

  for (const message of messages) {
    if (typeof message.content === 'string') {
      total += roughTokenCount(message.content)
      continue
    }

    if (!Array.isArray(message.content)) {
      continue
    }

    for (const raw of message.content) {
      const block = raw as BlockBase
      if (!block || typeof block !== 'object') continue

      switch (block.type) {
        case 'text': {
          const text = typeof block.text === 'string' ? block.text : ''
          total += roughTokenCount(text)
          break
        }
        case 'tool_use': {
          const name = typeof block.name === 'string' ? block.name : ''
          const input = block.input ?? {}
          total += roughTokenCount(name + JSON.stringify(input))
          break
        }
        case 'tool_result': {
          total += toolResultTokens(block)
          break
        }
        case 'image':
        case 'document': {
          total += IMAGE_MAX_TOKEN_SIZE
          break
        }
        case 'thinking': {
          const thinking =
            typeof block.thinking === 'string' ? block.thinking : ''
          total += roughTokenCount(thinking)
          break
        }
        case 'redacted_thinking': {
          const data = typeof block.data === 'string' ? block.data : ''
          total += roughTokenCount(data)
          break
        }
        default: {
          // Fallback: aproximação via JSON
          total += roughTokenCount(JSON.stringify(block))
        }
      }
    }
  }

  return Math.ceil(total * (4 / 3))
}

/** Calcula tokens para um bloco tool_result (suporta string ou sub-blocks). */
function toolResultTokens(block: BlockBase): number {
  const content = block.content
  if (content == null) return 0

  if (typeof content === 'string') {
    return roughTokenCount(content)
  }

  if (Array.isArray(content)) {
    let sum = 0
    for (const raw of content) {
      const item = raw as BlockBase
      if (!item || typeof item !== 'object') continue
      if (item.type === 'text' && typeof item.text === 'string') {
        sum += roughTokenCount(item.text)
      } else if (item.type === 'image' || item.type === 'document') {
        sum += IMAGE_MAX_TOKEN_SIZE
      }
    }
    return sum
  }

  return 0
}

// ---------------------------------------------------------------------------
// Helpers compartilhados
// ---------------------------------------------------------------------------

/**
 * Coleta IDs de `tool_use` cujo tool name é compactável, na ordem de
 * encontro. Usado por ambos os caminhos (time-based e cached).
 */
function collectCompactableToolIds(messages: MessageLike[]): string[] {
  const ids: string[] = []
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      continue
    }
    for (const raw of message.content) {
      const block = raw as BlockBase
      if (
        block?.type === 'tool_use' &&
        typeof block.id === 'string' &&
        typeof block.name === 'string' &&
        COMPACTABLE_TOOLS.has(block.name)
      ) {
        ids.push(block.id)
      }
    }
  }
  return ids
}

/** Converte timestamp (Date | string | undefined) em ms epoch ou null. */
function timestampMs(ts: Date | string | undefined): number | null {
  if (ts == null) return null
  if (ts instanceof Date) return ts.getTime()
  const ms = new Date(ts).getTime()
  return Number.isFinite(ms) ? ms : null
}

// ---------------------------------------------------------------------------
// timeBasedMicrocompact
// ---------------------------------------------------------------------------

/**
 * Time-based microcompact.
 *
 * Quando o gap (em minutos) desde a última mensagem `assistant` com
 * timestamp excede `gapThresholdMinutes`, substitui o conteúdo dos
 * tool_results "antigos" (todos menos os últimos `keepLast`) pelo
 * placeholder. Tools fora de COMPACTABLE_TOOLS são ignoradas.
 *
 * Retorna `null` quando o trigger não dispara — sinaliza no-op para o
 * caller (sem necessidade de comparar arrays).
 */
export function timeBasedMicrocompact(
  messages: MessageLike[],
  options?: { gapThresholdMinutes?: number; keepLast?: number },
): MessageLike[] | null {
  const gapThreshold =
    options?.gapThresholdMinutes ?? DEFAULT_GAP_THRESHOLD_MINUTES
  const keepLast = Math.max(1, options?.keepLast ?? DEFAULT_KEEP_LAST)

  // Encontra última msg assistant com timestamp válido
  let lastAssistantMs: number | null = null
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant') {
      const ms = timestampMs(msg.timestamp)
      if (ms != null) {
        lastAssistantMs = ms
        break
      }
    }
  }

  if (lastAssistantMs == null) {
    return null
  }

  const gapMinutes = (Date.now() - lastAssistantMs) / 60_000
  if (!Number.isFinite(gapMinutes) || gapMinutes < gapThreshold) {
    return null
  }

  const compactableIds = collectCompactableToolIds(messages)
  if (compactableIds.length === 0) {
    return null
  }

  const keepSet = new Set(compactableIds.slice(-keepLast))
  const clearSet = new Set(compactableIds.filter((id) => !keepSet.has(id)))

  if (clearSet.size === 0) {
    return null
  }

  let touchedAny = false
  const result: MessageLike[] = messages.map((message) => {
    if (message.role !== 'user' || !Array.isArray(message.content)) {
      return message
    }
    let touched = false
    const newContent = message.content.map((raw) => {
      const block = raw as BlockBase
      if (
        block?.type === 'tool_result' &&
        typeof block.tool_use_id === 'string' &&
        clearSet.has(block.tool_use_id) &&
        block.content !== CLEARED_PLACEHOLDER
      ) {
        touched = true
        return { ...block, content: CLEARED_PLACEHOLDER }
      }
      return block
    })
    if (!touched) return message
    touchedAny = true
    return { ...message, content: newContent }
  })

  if (!touchedAny) {
    return null
  }

  return result
}

// ---------------------------------------------------------------------------
// cachedMicrocompact
// ---------------------------------------------------------------------------

/**
 * Cached microcompact (analítico).
 *
 * Identifica os tool_use IDs compactáveis no histórico e separa em:
 *   - `toolIdsToDelete`: candidatos a serem expurgados de um cache
 *     externo (deletar do prompt cache via cache_edits, por exemplo).
 *   - `activeToolCount`: quantos tools compactáveis permanecem
 *     "vivos" após preservar `keepLast` mais recentes.
 *
 * Não muta `messages` — o caller decide o que fazer com o resultado.
 *
 * O parâmetro `threshold` está reservado para uso futuro (e.g. só
 * acionar deleção quando o total de tools compactáveis ultrapassar
 * um piso), mas é aceito hoje para compat com a API documentada.
 */
export function cachedMicrocompact(
  messages: MessageLike[],
  options?: { keepLast?: number; threshold?: number },
): { toolIdsToDelete: string[]; activeToolCount: number } {
  const keepLast = Math.max(0, options?.keepLast ?? DEFAULT_KEEP_LAST)
  const threshold = options?.threshold ?? 0

  const compactableIds = collectCompactableToolIds(messages)

  // Abaixo do piso opcional → nada a deletar
  if (compactableIds.length <= threshold) {
    return { toolIdsToDelete: [], activeToolCount: compactableIds.length }
  }

  if (compactableIds.length <= keepLast) {
    return { toolIdsToDelete: [], activeToolCount: compactableIds.length }
  }

  const cutoff = compactableIds.length - keepLast
  const toolIdsToDelete = compactableIds.slice(0, cutoff)
  const activeToolCount = compactableIds.length - toolIdsToDelete.length

  return { toolIdsToDelete, activeToolCount }
}
