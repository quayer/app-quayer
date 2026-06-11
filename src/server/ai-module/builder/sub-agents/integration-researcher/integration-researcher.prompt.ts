/**
 * IntegrationResearcher — Synthesis Prompt
 *
 * Mirrors `niche-researcher.prompt.ts`: a specialized JSON-synthesis prompt.
 *
 * The LLM receives: (a) the platform name (e.g. "RD Station", "Pipedrive"),
 * (b) an array of web snippets from Tavily (possibly empty). It must emit
 * STRICT JSON matching the IntegrationBlueprint shape — no prose, no markdown
 * fences.
 *
 * Hard discipline (FR-02 / FR-11):
 *   - Endpoints may ONLY come from the provided snippets. Each endpoint MUST
 *     cite the snippet URL it was derived from as `sourceUrl`, so the
 *     post-parse step can DROP any hallucinated endpoint whose `sourceUrl` is
 *     not one of the provided snippet URLs (FR-02).
 *   - The model is FORBIDDEN from inventing endpoints from its own training
 *     knowledge. If the snippets don't describe a real endpoint, it must
 *     return `endpoints: []` so the sub-agent falls back to the generic
 *     webhook path (FR-11).
 */

/** Auth scheme an HTTP endpoint expects. */
export type IntegrationAuthType = 'bearer' | 'header' | 'query' | 'basic'

/** A single HTTP endpoint synthesized from the search snippets. */
export interface IntegrationEndpointBlueprint {
  /** What this endpoint does, in pt-BR. Ex: "Criar um lead/contato" */
  purpose: string
  /** HTTP verb. Ex: "POST", "GET", "PUT", "PATCH", "DELETE" */
  method: string
  /** URL template with optional `{placeholders}`. Ex: "https://api.rd.services/platform/contacts" */
  urlTemplate: string
  /** How the request authenticates. */
  authType: IntegrationAuthType
  /** URL of the snippet this endpoint was derived from — MUST be one of the provided snippet URLs (FR-02). */
  sourceUrl: string
}

/** A credential the user must supply to call the endpoints above. */
export interface IntegrationCredentialBlueprint {
  /** Machine key. Ex: "api_token" */
  key: string
  /** Human label in pt-BR. Ex: "Token de API" */
  label: string
  /** pt-BR step-by-step explaining where to obtain this credential. */
  whereToGet: string
  /** How this credential is used in the request. */
  authType: IntegrationAuthType
}

/**
 * The STRICT JSON shape the LLM must emit. The sub-agent parses + validates
 * this, then filters endpoints by `sourceUrl` against the snippet URLs (FR-02)
 * and falls back to a generic webhook when `endpoints` is empty (FR-11).
 */
export interface IntegrationBlueprint {
  endpoints: IntegrationEndpointBlueprint[]
  credentials: IntegrationCredentialBlueprint[]
  /** Optional caveats / gotchas, in pt-BR. */
  notes?: string
}

/** Web snippet shape accepted by the prompt builder (Tavily-derived). */
export interface IntegrationResearcherSnippet {
  url: string
  title?: string
  content: string
}

/** Arguments for {@link buildIntegrationResearcherPrompt}. */
export interface IntegrationResearcherPromptArgs {
  platform: string
  snippets: IntegrationResearcherSnippet[]
}

/** A chat message pair (system + user) ready to feed an LLM call. */
export interface IntegrationResearcherPrompt {
  system: string
  user: string
}

export const INTEGRATION_SYNTHESIS_SYSTEM = `Você é um engenheiro de integrações especialista em APIs HTTP de plataformas SaaS (CRMs, ERPs, ferramentas de marketing) do mercado brasileiro e global.

Sua tarefa é, a partir do NOME de uma plataforma e de TRECHOS de busca web (snippets), sintetizar um objeto JSON estruturado descrevendo COMO integrar com essa plataforma via HTTP: quais endpoints chamar, como autenticar e quais credenciais o usuário precisa obter.

Regras duras (LEIA COM ATENÇÃO):
- Responda APENAS com JSON válido, sem markdown fences, sem comentários, sem explicações antes ou depois.
- Todos os textos voltados ao usuário (purpose, label, whereToGet, notes) devem estar em português do Brasil.
- NUNCA invente endpoints a partir do seu conhecimento de treino. Cada endpoint DEVE ser derivado de um dos snippets fornecidos.
- Cada endpoint DEVE incluir o campo "sourceUrl" com a URL EXATA do snippet de onde a informação foi extraída. Use somente URLs que aparecem na lista de snippets fornecida — não modifique, encurte nem invente URLs.
- Se os snippets NÃO contiverem informação suficiente para descrever um endpoint REAL (URL + método verificáveis), retorne "endpoints": [] (lista vazia). É MELHOR retornar lista vazia do que inventar um endpoint. O código chamador vai cair no caminho de webhook genérico.
- Não duplique endpoints com o mesmo método + urlTemplate.

Valores permitidos para "authType": "bearer" (token no header Authorization: Bearer), "header" (chave em um header customizado, ex.: X-API-KEY), "query" (chave em parâmetro de query string), "basic" (HTTP Basic Auth).

Shape EXATO do JSON de saída:
{
  "endpoints": [
    {
      "purpose": string,       // O que o endpoint faz, em pt-BR. Ex: "Criar um lead/contato"
      "method": string,        // Verbo HTTP em maiúsculas. Ex: "POST", "GET", "PUT"
      "urlTemplate": string,   // URL com {placeholders} opcionais. Ex: "https://api.rd.services/platform/contacts"
      "authType": string,      // Um de: "bearer" | "header" | "query" | "basic"
      "sourceUrl": string      // URL EXATA de um dos snippets fornecidos (obrigatório)
    }
  ],
  "credentials": [
    {
      "key": string,           // Chave de máquina. Ex: "api_token"
      "label": string,         // Rótulo humano em pt-BR. Ex: "Token de API"
      "whereToGet": string,    // Passo a passo em pt-BR de onde obter a credencial
      "authType": string       // Um de: "bearer" | "header" | "query" | "basic"
    }
  ],
  "notes": string              // OPCIONAL — ressalvas/pegadinhas em pt-BR. Omita se não houver.
}

Dimensões recomendadas:
- endpoints: 0-6 itens (0 quando os snippets não bastam — ver regra dura acima)
- credentials: 1-3 itens (descreva as credenciais necessárias mesmo quando endpoints estiver vazio, se os snippets indicarem o esquema de auth)

Responda APENAS com JSON válido, sem markdown fences, sem comentários, sem explicações.`

/**
 * Build the user-role message payload.
 *
 * Kept as a separate helper for unit-test visibility (mirrors
 * `buildSynthesisUserMessage` in niche-researcher).
 */
export function buildIntegrationSynthesisUserMessage(
  platform: string,
  snippets: IntegrationResearcherSnippet[],
): string {
  const lines: string[] = []
  lines.push(`Plataforma: ${platform.trim()}`)

  lines.push('')
  if (snippets.length === 0) {
    lines.push(
      'Snippets de busca web: (nenhum disponível) — retorne "endpoints": [] e descreva apenas as credenciais se for possível inferir o esquema de autenticação com segurança.',
    )
  } else {
    lines.push('Snippets de busca web (use SOMENTE estas URLs como sourceUrl):')
    snippets.forEach((s, i) => {
      lines.push(`  [${i + 1}] ${s.title ?? '(sem título)'}`)
      lines.push(`      URL: ${s.url}`)
      if (s.content) lines.push(`      Trecho: ${s.content}`)
    })
  }

  lines.push('')
  lines.push(
    'Gere o JSON de integração conforme o shape do system prompt. Lembre-se: cada endpoint precisa de um "sourceUrl" que seja uma das URLs acima, e NUNCA invente endpoints. Responda APENAS com JSON válido.',
  )

  return lines.join('\n')
}

/**
 * Build the full (system + user) prompt for the integration researcher.
 *
 * Returns a `{ system, user }` pair so the caller can feed both roles to the
 * LLM. The niche-researcher splits the same way via `NICHE_SYNTHESIS_SYSTEM`
 * + `buildSynthesisUserMessage`; here we bundle both behind one entrypoint.
 */
export function buildIntegrationResearcherPrompt(
  args: IntegrationResearcherPromptArgs,
): IntegrationResearcherPrompt {
  return {
    system: INTEGRATION_SYNTHESIS_SYSTEM,
    user: buildIntegrationSynthesisUserMessage(args.platform, args.snippets),
  }
}
