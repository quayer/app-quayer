/**
 * prompt-builder.service — monta system prompts em camadas para reduzir custo
 * via prompt caching ephemeral do Anthropic (cross-session quando possível).
 *
 * Inspirado em:
 *   - inspiration/claude-code-leak/src/utils/api.ts (splitSysPromptPrefix,
 *     boundary marker)
 *   - inspiration/claude-code-leak/src/services/api/claude.ts
 *     (buildSystemPromptBlocks, getCacheControl)
 *
 * Estratégia: o system prompt é dividido em N "sections" com scope global /
 * org / session. O conteúdo "global" e "org" é estável entre turnos (cacheável,
 * pode ser servido do prompt cache da Anthropic, reduzindo ~70–90% do input
 * cost). Já o conteúdo "session" muda a cada conversa e fica DEPOIS do boundary
 * marker — nunca vira cacheBreakpoint.
 *
 * O Vercel AI SDK consome o resultado via `providerOptions.anthropic.cacheControl`
 * por mensagem. Este service apenas constrói o text + a lista de breakpoints; o
 * caller decide como aplicá-los (no SDK, normalmente uma mensagem `system` por
 * layer com o `cacheControl` no fim de cada layer cacheable).
 */

/**
 * Boundary marker separando conteúdo estático (cross-session cacheable) do
 * conteúdo session-specific. Tudo ANTES do marker pode usar cache global/org.
 * Tudo DEPOIS é dinâmico e nunca recebe cacheBreakpoint.
 *
 * WARNING: não remover/renomear sem atualizar os callers que detectam o marker.
 */
export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY =
  '\n<!-- __QUAYER_SYSTEM_PROMPT_DYNAMIC_BOUNDARY__ -->\n'

export type CacheTTL = '5m' | '1h'

export type PromptSectionScope = 'global' | 'org' | 'session'

export interface PromptSection {
  /** Nome lógico da section (debug/telemetria). */
  name: string
  /** Conteúdo textual. Strings vazias/whitespace-only são omitidas. */
  content: string
  /** Escopo do cache: global e org ficam antes do boundary; session depois. */
  scope: PromptSectionScope
  /** Se true e a section for static (global/org), gera um cacheBreakpoint no fim. */
  cacheable: boolean
}

export interface PromptCacheBreakpoint {
  /** Posição (índice de char) no `text` final onde termina a layer. */
  position: number
  ttl: CacheTTL
  scope: PromptSectionScope
}

export interface BuiltSystemPrompt {
  text: string
  cacheBreakpoints: PromptCacheBreakpoint[]
  /** Estimativa grosseira: ceil(text.length / 4). */
  estimatedTokens: number
}

/**
 * Ordem fixa por scope. Sections com mesmo scope mantêm ordem de chegada.
 * Session sempre é jogado para o fim — por contrato, esses pedaços não
 * podem ficar antes do boundary, ou estariam "dentro" do prefixo cacheável e
 * fragmentariam o hash do cache a cada turno.
 */
const SCOPE_ORDER: Record<PromptSectionScope, number> = {
  global: 0,
  org: 1,
  session: 2,
}

function isNonEmpty(content: string): boolean {
  return content.trim().length > 0
}

/**
 * Monta o system prompt em camadas com cache breakpoints.
 *
 * Comportamento:
 *   - Ordena: global → org → (boundary) → session
 *   - Insere boundary marker entre static (global/org) e dynamic (session)
 *   - Adiciona cacheBreakpoint ao FIM de cada layer cacheable static
 *   - Sections com cacheable=false NÃO geram breakpoint
 *   - Sections com content vazio são omitidas
 *   - Se cacheTtlEligibility=true → o ÚLTIMO breakpoint global usa ttl '1h',
 *     todos os outros '5m'. Caso contrário, todos '5m'.
 */
export function buildLayeredSystemPrompt(
  sections: PromptSection[],
  options?: { cacheTtlEligibility?: boolean },
): BuiltSystemPrompt {
  const cacheTtlEligibility = options?.cacheTtlEligibility === true

  // 1. Filtra vazios e ordena por scope estável (sort estável do Node 12+).
  const filtered = sections.filter(s => isNonEmpty(s.content))
  const sorted = [...filtered].sort(
    (a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope],
  )

  if (sorted.length === 0) {
    return { text: '', cacheBreakpoints: [], estimatedTokens: 0 }
  }

  // 2. Particiona em static (global/org) e dynamic (session).
  const staticSections = sorted.filter(s => s.scope !== 'session')
  const dynamicSections = sorted.filter(s => s.scope === 'session')

  // 3. Identifica índice do último breakpoint global (para ttl '1h').
  // Note: usamos `findLastIndex` em forma manual para compat com TS targets antigos.
  let lastGlobalIdx = -1
  for (let i = 0; i < staticSections.length; i++) {
    if (staticSections[i].scope === 'global' && staticSections[i].cacheable) {
      lastGlobalIdx = i
    }
  }

  // 4. Concatena static e calcula breakpoints.
  const parts: string[] = []
  const cacheBreakpoints: PromptCacheBreakpoint[] = []
  let cursor = 0

  staticSections.forEach((section, idx) => {
    if (parts.length > 0) {
      parts.push('\n\n')
      cursor += 2
    }
    parts.push(section.content)
    cursor += section.content.length

    if (section.cacheable) {
      const ttl: CacheTTL =
        cacheTtlEligibility && idx === lastGlobalIdx ? '1h' : '5m'
      cacheBreakpoints.push({
        position: cursor,
        ttl,
        scope: section.scope,
      })
    }
  })

  // 5. Se houver dynamic, insere boundary marker + dynamic. NUNCA gera
  //    breakpoint para dynamic — sessions são por turno.
  if (dynamicSections.length > 0) {
    if (parts.length > 0) {
      parts.push(SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
      cursor += SYSTEM_PROMPT_DYNAMIC_BOUNDARY.length
    }
    dynamicSections.forEach((section, idx) => {
      if (idx > 0) {
        parts.push('\n\n')
        cursor += 2
      }
      parts.push(section.content)
      cursor += section.content.length
    })
  }

  const text = parts.join('')
  const estimatedTokens = Math.ceil(text.length / 4)

  return { text, cacheBreakpoints, estimatedTokens }
}

/**
 * Retorna opções de provider para o Anthropic com cacheControl ephemeral
 * quando aplicável.
 *
 * `promptHasStableHead`: o início do system prompt é estável (não muda entre
 * turnos)? Se sim, vale ativar cacheControl.
 * `toolsAreStable`: a lista de tools é estável? Se sim, vale cachear os tool
 * schemas também (o caller usa para decidir se passa cacheControl no array de
 * tools).
 */
export function buildAnthropicCacheOptions(
  promptHasStableHead: boolean,
  toolsAreStable: boolean,
): {
  anthropic: {
    cacheControl?: { type: 'ephemeral' }
    cacheToolSchemas?: boolean
  }
} {
  const cacheControl =
    promptHasStableHead || toolsAreStable
      ? { type: 'ephemeral' as const }
      : undefined

  return {
    anthropic: {
      ...(cacheControl ? { cacheControl } : {}),
      ...(toolsAreStable ? { cacheToolSchemas: true } : {}),
    },
  }
}

/**
 * Atalho para migrar callers legacy que passam `system: string` flat para o
 * SDK. Devolve sections prontas para `buildLayeredSystemPrompt`.
 *
 * - `systemPrompt`           → 1 section global cacheable
 * - `contactContext` (opt.)  → 1 section session NÃO cacheable
 */
export function fromFlatPrompt(
  systemPrompt: string,
  contactContext?: string,
): PromptSection[] {
  const sections: PromptSection[] = []

  if (isNonEmpty(systemPrompt)) {
    sections.push({
      name: 'system',
      content: systemPrompt,
      scope: 'global',
      cacheable: true,
    })
  }

  if (contactContext && isNonEmpty(contactContext)) {
    sections.push({
      name: 'contact-context',
      content: contactContext,
      scope: 'session',
      cacheable: false,
    })
  }

  return sections
}
