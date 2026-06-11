/**
 * Quayer Builder — Journey Rules (Orayon Uplift, W2 foundation)
 *
 * Terse pt-BR rule block injected into the per-turn system banner by
 * `buildJourneyBanner`. It teaches the meta-agent how to behave during the
 * "jornada livre" (free-text journey): accept free-text that fits the active
 * step, answer digressions briefly then re-present the pending step, never skip
 * a required field silently, and defer card-owned fields to the card.
 *
 * Target budget: < ~300 tokens. Keep it terse — this rides on EVERY turn.
 *
 * Pure constants only. No IO, no `any`. Contract: docs/builder/ORAYON_UPLIFT_SPEC.md.
 */

/**
 * Field-ownership map: canonical field path → where it is collected.
 * `'card'` = owned by a card (must use the UI); `'livre'` = free text in chat.
 *
 * Kept structural (not imported from readiness.types) so this file stays
 * dependency-free. `Readiness.fieldOwnership` (a `Record<string, 'card'|'livre'>`)
 * is assignable to this type.
 */
export type FieldOwnershipMap = Record<string, 'card' | 'livre'>

/** Single field-ownership value. */
export type FieldOwnership = 'card' | 'livre'

/**
 * The journey rules block. Terse, imperative, pt-BR.
 *
 * Rule summary (kept in sync with the spec, section 4 "Journey-rules-prompt"):
 *  - Aceite texto-livre que casa com o campo `livre` do passo ativo → chame a
 *    tool, não re-pergunte.
 *  - Digressão → responda em 1-3 linhas e re-apresente o passo pendente.
 *  - Nunca pule um campo obrigatório em silêncio.
 *  - Campo `card` → peça para o usuário usar o card (não colete por texto).
 *  - Conduza APENAS o passo do banner no turno; registre respostas de outros
 *    passos via tool sem anunciar e volte ao passo ativo.
 *  - Fase Conhecer (objetivo/identidade, texto-livre): ofereça `quick_reply_chips`
 *    com opções comuns para o usuário tocar em vez de digitar — o chip vira um
 *    turno normal; nunca trave a resposta livre.
 */
export const BUILDER_JOURNEY_RULES = `Regras da jornada (texto-livre):
- Se a mensagem do usuário já preenche o campo "livre" do PRÓXIMO PASSO, registre-a chamando a tool correspondente — não re-pergunte o que ele acabou de responder.
- Digressão ou pergunta fora do passo: responda em no máximo 1-3 linhas e, em seguida, re-apresente o PRÓXIMO PASSO pendente.
- Nunca pule um campo obrigatório em silêncio. Se o usuário tentar avançar sem preencher, explique o que falta e mantenha o passo atual.
- Campos marcados como "card" são preenchidos na interface, não por texto. Quando o passo for de um campo "card", peça ao usuário para usar o card exibido — não colete o valor por texto livre nem invente o conteúdo.
- Uma pergunta por vez. Assuma defaults razoáveis e confirme depois, mas só marque um passo como concluído quando o estado realmente tiver o valor.
- Conduza APENAS o passo do PRÓXIMO PASSO neste turno. Se o usuário responder algo de OUTRO passo, registre com a tool adequada (ex.: set_project_basics para objetivo/nome) SEM anunciar, e volte ao passo ativo — não puxe perguntas de passos futuros.
- Na fase Conhecer (perguntas de objetivo/identidade em texto livre), ofereça quick_reply_chips com 2-4 respostas comuns para o usuário tocar em vez de digitar — o chip escolhido vira um turno normal. Os chips são atalho, nunca obrigatórios: o usuário pode sempre responder por texto livre.
- Quando o passo ativo for source_ingestion (card "Fontes do negócio"), resposta CURTA ancorada no card — sem novas perguntas de outros passos no mesmo turno.`

/**
 * Renders the "card vs livre" field-ownership table as a compact Markdown list,
 * grouped by owner. Tolerant: an empty/undefined map yields a single explanatory
 * line so the banner section never renders blank.
 *
 * @param fieldOwnership map of canonical field path → 'card' | 'livre'
 *   (typically `Readiness.fieldOwnership`).
 */
export function renderFieldOwnership(
  fieldOwnership: FieldOwnershipMap | undefined | null,
): string {
  const entries = fieldOwnership ? Object.entries(fieldOwnership) : []
  if (entries.length === 0) {
    return '_(sem campos mapeados para este passo)_'
  }

  const card = entries.filter(([, owner]) => owner === 'card').map(([f]) => f)
  const livre = entries.filter(([, owner]) => owner === 'livre').map(([f]) => f)

  const lines: string[] = []
  if (card.length > 0) {
    lines.push('Card (usar a interface):')
    for (const field of card) lines.push(`- \`${field}\``)
  }
  if (livre.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('Livre (texto no chat):')
    for (const field of livre) lines.push(`- \`${field}\``)
  }

  return lines.join('\n')
}
