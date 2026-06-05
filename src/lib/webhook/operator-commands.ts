/**
 * Operator commands (Orayon) — comandos que um operador humano digita no próprio
 * WhatsApp para controlar a sessão, sem precisar de painel (Quayer não tem
 * admin UI). Interceptados no webhook em mensagens OUT/AGENT (não-echo).
 *
 * O comando precisa ser a mensagem INTEIRA: `@verbo` (ou `/verbo`), sem texto
 * extra, para evitar falso-positivo no meio de uma frase. Case e acentos são
 * tolerados (`@Fechar`, `@robô` funcionam).
 *
 * Verbos suportados:
 *   close        — @fechar /encerrar /finalizar → fecha a sessão (IA volta na próxima)
 *   return_to_ai — @ia /bot /voltar /robo        → devolve o controle pra IA agora
 *   blacklist    — @blacklist /bloquear /block   → tag 'blacklist' + pausa IA
 *   whitelist    — @whitelist /liberar /permitir → tag 'whitelist'
 */

export type OperatorCommandKind =
  | 'close'
  | 'return_to_ai'
  | 'blacklist'
  | 'whitelist'

export interface OperatorCommand {
  kind: OperatorCommandKind
}

const COMMAND_ALIASES: Record<string, OperatorCommandKind> = {
  // fechar a sessão
  fechar: 'close',
  close: 'close',
  encerrar: 'close',
  finalizar: 'close',
  // devolver o controle pra IA
  ia: 'return_to_ai',
  bot: 'return_to_ai',
  robo: 'return_to_ai',
  voltar: 'return_to_ai',
  // blacklist (não deixa a IA atender este contato)
  blacklist: 'blacklist',
  bloquear: 'blacklist',
  block: 'blacklist',
  // whitelist (libera no modo whitelist_only)
  whitelist: 'whitelist',
  liberar: 'whitelist',
  permitir: 'whitelist',
}

/** Remove acentos para casar `robô`→`robo`, `liberár`→`liberar`, etc. */
function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Parse uma mensagem de operador. Retorna o comando reconhecido, ou `null`
 * quando não é um comando (texto normal → segue o fluxo de takeover).
 */
export function parseOperatorCommand(
  text: string | null | undefined,
): OperatorCommand | null {
  if (!text) return null
  // Mensagem inteira = `@verbo` ou `/verbo` (letras latinas, acentos ok).
  const match = /^[@/]([A-Za-zÀ-ÿ]+)\s*$/.exec(text.trim())
  if (!match) return null
  const verb = stripAccents(match[1].toLowerCase())
  const kind = COMMAND_ALIASES[verb]
  return kind ? { kind } : null
}

/** Adiciona uma tag sem duplicar. */
function addTag(tags: string[], tag: string): string[] {
  return tags.includes(tag) ? tags : [...tags, tag]
}

/**
 * Update Prisma derivado do comando (puro — testável isolado). Os campos batem
 * com ChatSession: status / aiEnabled / aiBlockReason / aiBlockedUntil / tags.
 */
export function buildOperatorCommandUpdate(
  command: OperatorCommand,
  currentTags: string[] = [],
): Record<string, unknown> {
  switch (command.kind) {
    case 'close':
      // Fecha a sessão: a IA volta sozinha quando o contato abrir uma nova.
      return { status: 'CLOSED', aiEnabled: false }
    case 'return_to_ai':
      // Devolve o controle pra IA agora (operador desfez o takeover).
      return { aiEnabled: true, aiBlockReason: null, aiBlockedUntil: null }
    case 'blacklist':
      return {
        tags: addTag(currentTags, 'blacklist'),
        aiEnabled: false,
        aiBlockReason: 'operator_blacklist',
      }
    case 'whitelist':
      return { tags: addTag(currentTags, 'whitelist') }
  }
}

/**
 * Superfície mínima de DB — desacopla do Prisma concreto e facilita o mock.
 */
interface SessionCommandDb {
  chatSession: {
    update: (args: {
      where: { id: string }
      data: Record<string, unknown>
    }) => Promise<unknown>
  }
}

/**
 * Aplica o comando na sessão. Best-effort + defensivo: erros são logados e nunca
 * derrubam o webhook (o operador continua atendendo). Retorna `true` no sucesso.
 */
export async function applyOperatorCommand(
  db: SessionCommandDb,
  sessionId: string,
  command: OperatorCommand,
  currentTags: string[] = [],
): Promise<boolean> {
  if (!sessionId) return false
  try {
    await db.chatSession.update({
      where: { id: sessionId },
      data: buildOperatorCommandUpdate(command, currentTags),
    })
    return true
  } catch (err) {
    console.warn(
      '[uazapi-webhook] operator command failed (non-fatal):',
      err instanceof Error ? err.message : String(err),
    )
    return false
  }
}
