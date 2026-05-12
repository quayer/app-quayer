/**
 * Conditional Skill Activator
 *
 * Skills com triggers (keywords ou journey stages) ficam dormentes até que
 * o contexto da conversa bata com pelo menos um trigger. Quando ativadas,
 * o markdown do skill é concatenado ao system prompt do turno.
 *
 * Inspirado em src/skills/loadSkillsDir.ts do Claude Code (conditional skills).
 *
 * Regras:
 *  - alwaysActive=true → sempre passa.
 *  - sem triggers (undefined) OU triggers vazios ({}) → default loaded (passa).
 *  - com triggers → OR logic entre keywords / journeyStages / customerJourney.
 */

export interface SkillManifest {
  name: string
  description: string
  triggers?: {
    /** case-insensitive substring match contra messageContent */
    keywords?: string[]
    /** exact match contra session.journeyStage */
    journeyStages?: string[]
    /** exact match contra session.customerJourney */
    customerJourney?: string[]
  }
  /** Markdown content do skill (system prompt addendum). */
  content: string
  /** Se true, skill SEMPRE ativa (não conditional). */
  alwaysActive?: boolean
}

export interface ActivationContext {
  messageContent: string
  session?: {
    journeyStage?: string | null
    customerJourney?: string | null
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function hasAnyTrigger(t: SkillManifest['triggers']): boolean {
  if (!t) return false
  const k = t.keywords?.length ?? 0
  const j = t.journeyStages?.length ?? 0
  const c = t.customerJourney?.length ?? 0
  return k + j + c > 0
}

function matchKeyword(messageContent: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false
  const haystack = messageContent.toLowerCase()
  return keywords.some((kw) => {
    const needle = kw.toLowerCase()
    return needle.length > 0 && haystack.includes(needle)
  })
}

function matchStage(
  stage: string | null | undefined,
  allowed: string[] | undefined
): boolean {
  if (!allowed || allowed.length === 0) return false
  if (!stage) return false
  return allowed.includes(stage)
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Filtra skills aplicáveis ao contexto atual.
 *
 * - alwaysActive=true → sempre incluso.
 * - sem triggers ou triggers vazios → default loaded.
 * - com triggers → ao menos um deve casar (OR).
 */
export function activateSkills(
  skills: SkillManifest[],
  context: ActivationContext
): SkillManifest[] {
  return skills.filter((skill) => {
    if (skill.alwaysActive) return true

    if (!hasAnyTrigger(skill.triggers)) {
      // Sem triggers ou triggers vazios → default loaded.
      return true
    }

    const triggers = skill.triggers!

    if (
      triggers.keywords &&
      triggers.keywords.length > 0 &&
      matchKeyword(context.messageContent, triggers.keywords)
    ) {
      return true
    }

    if (
      matchStage(context.session?.journeyStage, triggers.journeyStages)
    ) {
      return true
    }

    if (
      matchStage(context.session?.customerJourney, triggers.customerJourney)
    ) {
      return true
    }

    return false
  })
}

/**
 * Concatena content dos skills ativos em um único bloco markdown
 * para ser anexado ao system prompt. Inclui header "## Skills ativas".
 * Retorna string vazia se a lista estiver vazia.
 */
export function renderActiveSkills(skills: SkillManifest[]): string {
  if (skills.length === 0) return ''
  const body = skills.map((s) => s.content.trim()).join('\n\n')
  return `## Skills ativas\n\n${body}`
}
