/**
 * opt-out-detection — F1/F2b: DETECÇÃO PURA de pedido de descadastro (opt-out) numa
 * mensagem inbound do cliente (épico `specs/builder-proatividade`; FR-PRO-08 /
 * NFR-PRO-2 — compliance/LGPD: o cliente pode pedir para parar de receber proativos).
 *
 * A razão de ser (por que detectar no texto):
 *   Não há fluxo formal de "responda SAIR" no WhatsApp Web/UAZ — o cliente pede para
 *   parar em LINGUAGEM NATURAL ("parar", "não quero mais mensagens", "me remove da
 *   lista"). Esta função reconhece esses pedidos de forma CONSERVADORA para o webhook
 *   gravar um `ContactOptOut` e cancelar os follow-ups pendentes do contato.
 *
 * 🔒 PRINCÍPIO — FALSO POSITIVO É PIOR QUE FALSO NEGATIVO AQUI:
 *   Marcar opt-out por engano CALA o agente para um cliente que só disse "não quero o
 *   plano premium" ou "pode cancelar a consulta". Por isso o reconhecimento exige
 *   EVIDÊNCIA dupla, em 4 camadas (qualquer uma basta, todas conservadoras):
 *     1. TOKEN FORTE inequívoco (`descadastr`, `unsubscribe`) — só significa "sair";
 *     2. COMANDO isolado (`parar`/`pare`/`sair`/`cancelar`/`remover`/`stop`) como a
 *        MENSAGEM INTEIRA (um comando, não parte de uma frase de negócio);
 *     3. CO-OCORRÊNCIA: um verbo de PARADA (`parar`/`cancelar`/`remov`/`não quero`/
 *        `não envie`...) JUNTO de um OBJETO de mensageria (`mensagem`/`receber`/
 *        `lista`/`contato`/`notificação`...). O objeto é o que desfaz a ambiguidade —
 *        "cancelar a consulta" (sem objeto) não conta; "cancelar as mensagens" conta;
 *     4. IDIOMA fixo (`não me perturbe`, `perde meu número`).
 *   Verbos sozinhos (`cancelar`/`remover`/`não quero`) NUNCA disparam fora de (2)/(3).
 *
 * Pura: sem IO, sem `any`. O caller (`opt-out-inbound.ts`) faz a persistência.
 */

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/**
 * Normaliza o texto para casamento robusto: minúsculas, remove acentos (NFD +
 * strip de diacríticos), troca pontuação por espaço e colapsa espaços. Assim
 * "Não quero mais!!" e "nao  quero   mais" convergem para a mesma forma.
 */
export function normalizeForOptOut(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos (combining marks U+0300–U+036F)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // pontuação/emoji → espaço
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Vocabulário (já NORMALIZADO — sem acento, minúsculo)
// ---------------------------------------------------------------------------

/**
 * Tokens INEQUÍVOCOS (substring) que sozinhos significam "sair". `descadastr`
 * cobre descadastrar/descadastre/descadastrado; nenhum tem sentido de negócio.
 */
const STRONG_OPT_OUT_TOKENS: readonly string[] = ['descadastr', 'unsubscribe']

/**
 * Comandos fortes que SÓ contam quando são a mensagem INTEIRA (curta, isolada).
 * Evita o falso positivo de "vou parar aí na loja" / "remover um item do pedido".
 */
const STANDALONE_OPT_OUT_COMMANDS: readonly string[] = [
  'parar',
  'pare',
  'sair',
  'cancelar',
  'remover',
  'stop',
]

/**
 * Verbos de PARADA (substring). Combinados com um OBJETO de mensageria → opt-out.
 * `sair`/`stop` ficam de fora daqui (ambíguos demais em co-ocorrência — só valem
 * como comando isolado).
 */
const STOP_INTENT_TOKENS: readonly string[] = [
  'parar',
  'pare de',
  'para de',
  'cancelar',
  'cancela ',
  'remov', // remover/remova/remove/removido
  'nao quero',
  'nao envie',
  'nao me envie',
  'nao mande',
  'nao manda',
  'nao me mande',
]

/**
 * OBJETOS de mensageria (substring). É o termo que desfaz a ambiguidade: o pedido
 * de parada precisa ser SOBRE mensagens/contato, não sobre um pedido de negócio.
 */
const MESSAGING_OBJECT_TOKENS: readonly string[] = [
  'mensage', // mensagem/mensagens
  'receber',
  'recebimento',
  'lista',
  'contato',
  'notificac', // notificacao/notificacoes
  'envie',
  'enviar',
  'mandar',
  'promoc', // promocao/promocoes
  'divulga',
  'propaganda',
  'spam',
]

/** Idiomas fixos que não se encaixam na co-ocorrência mas são opt-out claros. */
const FIXED_OPT_OUT_PHRASES: readonly string[] = [
  'nao perturbe',
  'nao me perturbe',
  'perde meu numero',
  'perca meu numero',
  'esquece meu numero',
  'esqueca meu numero',
  'apaga meu numero',
  'apague meu numero',
]

// ---------------------------------------------------------------------------
// Detecção
// ---------------------------------------------------------------------------

/**
 * `true` quando a mensagem é um pedido de opt-out reconhecível (conservador).
 *
 * Camadas (qualquer uma basta):
 *  1. token forte inequívoco (`descadastr`/`unsubscribe`) em qualquer posição;
 *  2. a mensagem INTEIRA é um comando isolado (`parar`/`pare`/`sair`/`cancelar`/
 *     `remover`/`stop`);
 *  3. co-ocorrência de um verbo de PARADA com um OBJETO de mensageria;
 *  4. idioma fixo (`não me perturbe`, ...).
 *
 * Texto vazio/whitespace/null → `false`. Pura, sem IO.
 */
export function detectOptOut(text: string | null | undefined): boolean {
  if (!text) return false
  const n = normalizeForOptOut(text)
  if (n.length === 0) return false

  // 1. Token forte inequívoco.
  if (STRONG_OPT_OUT_TOKENS.some((t) => n.includes(t))) return true

  // 2. Comando isolado (mensagem inteira).
  if (STANDALONE_OPT_OUT_COMMANDS.includes(n)) return true

  // 3. Co-ocorrência: verbo de parada + objeto de mensageria.
  const hasStop = STOP_INTENT_TOKENS.some((t) => n.includes(t))
  const hasObject = MESSAGING_OBJECT_TOKENS.some((t) => n.includes(t))
  if (hasStop && hasObject) return true

  // 4. Idioma fixo.
  if (FIXED_OPT_OUT_PHRASES.some((p) => n.includes(p))) return true

  return false
}
