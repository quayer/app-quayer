/**
 * research-mode-diagnosis (PURO) — F5 (Modo Pesquisa, FR-46/FR-47).
 *
 * Núcleo PURO (zero IO, zero `any`) do Modo Pesquisa: resolve O QUE pesquisar a
 * partir do builderState e TRADUZ o resultado do `nicheResearcherSubAgent`
 * (NicheInsights) no subtree `diagnosisInsights` que o card `diagnosis` renderiza.
 *
 * Por que aqui (e não no serviço): a resolução do sujeito e a tradução insights→
 * diagnóstico são regras determinísticas e testáveis sem DB/LLM. O serviço
 * (`research-mode-diagnosis.service.ts`) só orquestra o IO (rodar o sub-agente,
 * persistir) e delega TODA a lógica a estas funções.
 *
 * Mapa NicheInsights → DiagnosisInsights:
 *   - detectedBusiness ← sujeito (nicho + descrição), resumido;
 *   - risks            ← warnings ++ regulations (compliance = risco);
 *   - bestPractices    ← typicalFlows;
 *   - sources          ← sources (título+url);
 *   - recommendedCapabilities ← heurística determinística sobre nicho/insights;
 *   - lite             ← fromLLMKnowledgeOnly (pesquisa sem Tavily).
 */

import type { BuilderState, DiagnosisInsights } from '../cards/builder-state'
import { inferNiche } from '../playbook/niche-inference.pure'
import type { NicheInsights } from '../sub-agents'

// ---------------------------------------------------------------------------
// Sujeito da pesquisa
// ---------------------------------------------------------------------------

/** O que o Modo Pesquisa vai pesquisar: nicho (obrigatório) + descrição opcional. */
export interface ResearchSubject {
  nicho: string
  description?: string
}

/** Trim → undefined quando vazio. */
function clean(value: string | undefined | null): string | undefined {
  const t = value?.trim()
  return t && t.length > 0 ? t : undefined
}

/**
 * Resolve o sujeito da pesquisa a partir do builderState. A descrição prefere a
 * identidade/proposta do usuário, caindo para o que a fonte capturou ou o objetivo;
 * o nicho vem de `inferNiche` (vertical curada OU fallback do texto livre).
 *
 * Retorna `null` quando NÃO há SINAL REAL de negócio (sem descrição, sem nome de
 * projeto, sem serviços da fonte) — `inferNiche` sempre devolve um placeholder
 * genérico ('serviço local'), então NÃO basta confiar nele: sem sinal real o
 * serviço pula a pesquisa e o card degrada honestamente. Pura: não muta o input.
 */
export function resolveResearchSubject(
  state: BuilderState,
): ResearchSubject | null {
  const proposed = state.sourceIngestion.proposed
  const description =
    clean(state.identity.description) ??
    clean(state.proposal.description) ??
    clean(proposed?.businessName) ??
    clean(state.project.objective)
  const projectName = clean(state.project.name)
  const hasSourceServices = (proposed?.services ?? []).some(
    (s) => clean(s) !== undefined,
  )

  // Sem NENHUM sinal real → nada confiável para pesquisar (evita pesquisar o
  // placeholder genérico 'serviço local' de um state vazio).
  if (!description && !projectName && !hasSourceServices) return null

  const nicho = clean(inferNiche(state, undefined))
  if (!nicho || nicho.length < 2) return null

  return {
    nicho: nicho.slice(0, 200),
    ...(description ? { description: description.slice(0, 1000) } : {}),
  }
}

// ---------------------------------------------------------------------------
// Sugestão determinística de capacidades (linguagem de negócio)
// ---------------------------------------------------------------------------

/** Junta os textos relevantes do nicho+insights p/ o scan de palavras-chave. */
function insightsHaystack(
  subject: ResearchSubject,
  insights: NicheInsights,
): string {
  return [
    subject.nicho,
    subject.description ?? '',
    ...insights.typicalFlows,
    ...insights.vocabulary,
    ...insights.regulations,
  ]
    .join(' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * Sugere capacidades em LINGUAGEM DE NEGÓCIO (FR-49) a partir do nicho/insights.
 * Heurística determinística e CONSERVADORA — são SUGESTÕES exibidas no card, NUNCA
 * aplicadas sozinhas (a decisão é do usuário nos cards de domínio, FR-09/FR-52):
 *   - sempre: "Retomar leads que pararam de responder" (follow-up é universal);
 *   - regulamentações presentes OU nicho regulado → "Transferir para um humano";
 *   - sinais de agenda (agendar/consulta/visita/horário) → "Agendar pela conversa";
 *   - sinais de preço/orçamento → "Informar preços do catálogo".
 * Dedup preservando ordem. Pura.
 */
export function suggestCapabilitiesFromNiche(
  subject: ResearchSubject,
  insights: NicheInsights,
): string[] {
  const hay = insightsHaystack(subject, insights)
  const out: string[] = ['Retomar leads que pararam de responder']

  const regulated =
    insights.regulations.length > 0 ||
    /\b(advoc|advogad|juridic|saude|clinic|medic|odont|dentist|psicolog|nutricion|fisioterap)/.test(
      hay,
    )
  if (regulated) out.push('Transferir para um humano quando necessário')

  if (/(agend|consulta|visita|reserva|horario|marcar|appointment)/.test(hay)) {
    out.push('Agendar pela conversa')
  }
  if (/(preco|orcamento|valor|tabela|plano|mensalidade|pacote)/.test(hay)) {
    out.push('Informar preços do catálogo')
  }

  // Dedup preservando ordem.
  return Array.from(new Set(out)).slice(0, 12)
}

// ---------------------------------------------------------------------------
// Tradução NicheInsights → DiagnosisInsights
// ---------------------------------------------------------------------------

/** Trim + dedup + drop vazios + cap, preservando ordem. */
function cleanList(values: readonly string[], cap: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const t = raw.trim()
    if (t.length === 0 || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= cap) break
  }
  return out
}

/** Monta o texto "negócio detectado" a partir do sujeito. */
function buildDetectedBusiness(subject: ResearchSubject): string {
  if (subject.description) {
    return `${subject.nicho} — ${subject.description}`.slice(0, 400)
  }
  return subject.nicho.slice(0, 400)
}

/**
 * Traduz o resultado do sub-agente (`NicheInsights`) no subtree `diagnosisInsights`.
 * `generatedAt` é INJETADO (ISO) para manter a função pura/determinística.
 *
 *  - risks         = warnings ++ regulations (compliance é risco a evitar);
 *  - bestPractices = typicalFlows;
 *  - sources       = sources (título+url), clampados;
 *  - recommendedCapabilities = heurística determinística;
 *  - lite          = fromLLMKnowledgeOnly.
 * Pura: não toca DB, não muta o input.
 */
export function buildDiagnosisInsights(
  subject: ResearchSubject,
  insights: NicheInsights,
  generatedAt: string,
): DiagnosisInsights {
  return {
    detectedBusiness: buildDetectedBusiness(subject),
    risks: cleanList([...insights.warnings, ...insights.regulations], 20),
    bestPractices: cleanList(insights.typicalFlows, 20),
    recommendedCapabilities: suggestCapabilitiesFromNiche(subject, insights),
    sources: insights.sources
      .filter((s) => s.url.trim().length > 0)
      .slice(0, 12)
      .map((s) => ({
        title: (s.title?.trim() || s.url).slice(0, 300),
        url: s.url.trim().slice(0, 2000),
      })),
    lite: insights.fromLLMKnowledgeOnly,
    generatedAt,
  }
}
