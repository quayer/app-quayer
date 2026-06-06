/**
 * Builder Cards — Sugestão de keywords por profissão (G9)
 *
 * Helper PURO e DETERMINÍSTICO para o `activation-mode-card.tsx`. Dada a config
 * de texto livre do projeto (objetivo + descrição da proposta + nome), tenta
 * inferir a profissão e devolver um conjunto de palavras-chave de gatilho
 * sugeridas — chips "+ keyword" mostradas no modo `keyword_trigger`.
 *
 * DIFERENÇA-CHAVE vs Orayon.Profissoes: aqui NÃO existe slug de profissão. A
 * profissão é derivada do TEXTO LIVRE que o usuário já forneceu nos primeiros
 * turnos do Builder (value.project.objective + value.proposal.description +
 * value.project.name), casando aliases normalizados como substring.
 *
 * Sem rede, sem random, sem IO — testável isolado. Texto vazio/undefined cai no
 * fallback genérico sem lançar exceção.
 */

/**
 * Palavras-chave sugeridas por profissão (chave canônica). Mantido pequeno e
 * extensível conforme o catálogo cresce. As keywords são as palavras de gatilho
 * típicas que um cliente usaria ao chamar aquele tipo de negócio no WhatsApp.
 */
export const PROFESSION_KEYWORDS: Record<string, string[]> = {
  dentista: ["agendar", "consulta", "preço", "orçamento", "clareamento", "horário"],
  advogado: ["consulta", "honorários", "atendimento", "orçamento", "agendar", "processo"],
  personal: ["aula", "treino", "agendar", "preço", "horário", "plano"],
  psicologo: ["sessão", "consulta", "agendar", "valor", "horário", "atendimento"],
  clinica: ["agendar", "consulta", "exame", "preço", "convênio", "horário"],
  estetica: ["agendar", "procedimento", "preço", "horário", "promoção", "avaliação"],
  imobiliaria: ["agendar", "visita", "imóvel", "aluguel", "valor", "financiamento"],
  contador: ["abrir empresa", "imposto", "mei", "honorários", "orçamento", "consultoria"],
  petshop: ["agendar", "banho", "tosa", "preço", "horário", "vacina"],
  restaurante: ["reserva", "cardápio", "delivery", "horário", "preço", "pedido"],
}

/**
 * Termos a casar no texto livre → profissão. Todos em lowercase e SEM acento
 * (o texto de entrada é normalizado da mesma forma antes do match). A primeira
 * profissão cujo alias aparecer como substring vence — por isso a ordem de
 * inserção importa (mais específico antes do mais genérico).
 */
export const PROFESSION_ALIASES: Record<string, string[]> = {
  dentista: ["dentista", "odonto", "odontolog", "consultorio odontolog"],
  advogado: ["advogado", "advocacia", "juridic", "advogada", "escritorio de advocacia"],
  personal: ["personal", "treino", "academia", "musculacao", "educador fisico", "crossfit"],
  psicologo: ["psicolog", "terapia", "terapeuta", "psicanal", "saude mental"],
  estetica: ["estetica", "salao", "beleza", "cabelo", "manicure", "depilac", "spa"],
  petshop: ["pet shop", "petshop", "veterinari", "banho e tosa"],
  imobiliaria: ["imobiliaria", "corretor", "corretagem", "imoveis", "aluguel de imove"],
  contador: ["contador", "contabilidade", "contabil", "escritorio contabil"],
  restaurante: ["restaurante", "lanchonete", "delivery", "hamburgueria", "pizzaria", "cardapio"],
  // 'clinica' é o mais genérico de saúde — fica por último para não roubar o
  // match de dentista/psicólogo que são mais específicos.
  clinica: ["clinica", "medic", "saude", "fisioterap", "nutric"],
}

/**
 * Fallback genérico quando nenhuma profissão é reconhecida (ou o texto é vazio).
 * Palavras de gatilho universais que servem para qualquer atendimento comercial.
 */
export const KEYWORD_SUGGESTIONS_DEFAULT: string[] = [
  "agendar",
  "preço",
  "orçamento",
  "atender",
  "valor",
  "horário",
]

/** Input de texto livre lido (read-only) da BuilderState. */
export interface SuggestKeywordsInput {
  /** value.project.objective — o que o negócio faz. */
  objective?: string
  /** value.proposal.description — one-liner do agente proposto. */
  proposalDescription?: string
  /** value.project.name — nome do projeto/negócio. */
  projectName?: string
}

/**
 * Normaliza texto para o match: lowercase + remove acentos (NFD + strip dos
 * diacríticos combinantes). Undefined/null vira string vazia — nunca lança.
 */
function normalizeText(input: string | undefined): string {
  if (!input) return ""
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

/**
 * Sugere keywords de gatilho a partir do texto livre do projeto.
 *
 * Algoritmo (puro):
 *  1. concatena objective + proposalDescription + projectName e normaliza;
 *  2. percorre PROFESSION_ALIASES na ordem de inserção e retorna as keywords da
 *     PRIMEIRA profissão cujo alias aparece como substring no texto;
 *  3. se nada casar (ou texto vazio), retorna KEYWORD_SUGGESTIONS_DEFAULT.
 *
 * Sempre devolve um array novo (não compartilha referência com as constantes),
 * então o chamador pode filtrar/ordenar sem mutar o catálogo.
 */
export function suggestKeywordsForProject(input: SuggestKeywordsInput): string[] {
  const haystack = normalizeText(
    [input.objective, input.proposalDescription, input.projectName]
      .filter((part): part is string => Boolean(part))
      .join(" "),
  )

  if (haystack.length > 0) {
    for (const [profession, aliases] of Object.entries(PROFESSION_ALIASES)) {
      const matched = aliases.some((alias) => haystack.includes(alias))
      if (matched) {
        const keywords = PROFESSION_KEYWORDS[profession]
        if (keywords && keywords.length > 0) return [...keywords]
      }
    }
  }

  return [...KEYWORD_SUGGESTIONS_DEFAULT]
}
