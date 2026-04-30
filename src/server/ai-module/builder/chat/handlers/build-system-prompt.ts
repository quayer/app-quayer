/**
 * Builder Chat — Build Resolved System Prompt
 *
 * Encapsulates the logic to load Builder skills (dynamically, since the
 * skill-loader module is being developed in parallel under US-013) and
 * inject their summary into the BUILDER_SYSTEM_PROMPT template.
 *
 * The resolved summary is cached in-process to avoid reloading skills on
 * every chat turn — skills are static files on disk, so a per-process
 * cache is safe.
 *
 * Extracted from builder.controller.ts (lines 40-77) as part of the
 * chat refactor (split monolithic sendChatMessage into focused handlers).
 */

import {
  BUILDER_SYSTEM_PROMPT,
  SKILLS_SUMMARY_TOKEN,
  SKILLS_SUMMARY_FALLBACK,
} from '../../prompts/whatsapp-agent-system-prompt'

// ---------------------------------------------------------------------------
// Skill loader — imported dynamically to tolerate the module not existing
// yet (US-013 is being implemented by another agent in parallel).
// ---------------------------------------------------------------------------

type LoadSkillsFn = () => Promise<unknown[]>
type GetSkillsSummaryFn = (skills: unknown[]) => string

let _loadSkills: LoadSkillsFn | undefined
let _getSkillsSummary: GetSkillsSummaryFn | undefined

try {
   
  const mod = require('../../skills/skill-loader') as {
    loadSkills?: LoadSkillsFn
    getSkillsSummary?: GetSkillsSummaryFn
  }
  _loadSkills = mod.loadSkills
  _getSkillsSummary = mod.getSkillsSummary
} catch {
  // skill-loader not yet available — will use fallback summary.
}

// In-process cache — avoids reloading skills on every message.
let _cachedSkillsSummary: string | null = null

/**
 * Resolves the skills summary (from loader or fallback) and caches it
 * for the lifetime of the process.
 */
export async function getResolvedSkillsSummary(): Promise<string> {
  if (_cachedSkillsSummary !== null) return _cachedSkillsSummary

  if (_loadSkills && _getSkillsSummary) {
    try {
      const skills = await _loadSkills()
      if (skills.length > 0) {
        _cachedSkillsSummary = _getSkillsSummary(skills)
        return _cachedSkillsSummary
      }
    } catch (err: unknown) {
      console.warn(
        '[buildSystemPrompt] Failed to load skills, using fallback:',
        err,
      )
    }
  }

  _cachedSkillsSummary = SKILLS_SUMMARY_FALLBACK
  return _cachedSkillsSummary
}

/**
 * Builds the final system prompt string for the Builder meta-agent by
 * resolving the cached skills summary and substituting it into the
 * BUILDER_SYSTEM_PROMPT template.
 *
 * Currently consumed by `streamAgentResponse` / `chat.routes.ts`. The
 * agent-runtime still reads `aIAgentConfig.systemPrompt` from the DB —
 * this resolved prompt will replace that path in a later wave.
 */
export async function buildResolvedSystemPrompt(): Promise<string> {
  const summary = await getResolvedSkillsSummary()
  return BUILDER_SYSTEM_PROMPT.replace(SKILLS_SUMMARY_TOKEN, summary)
}

/**
 * Test-only: clears the in-process skills-summary cache so unit tests
 * can exercise both the loader-success and fallback paths.
 */
export function __resetSkillsSummaryCacheForTests(): void {
  _cachedSkillsSummary = null
}
