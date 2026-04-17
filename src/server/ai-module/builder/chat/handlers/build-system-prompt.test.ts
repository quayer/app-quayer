/**
 * Tests for buildResolvedSystemPrompt + getResolvedSkillsSummary.
 */

import { describe, it } from 'vitest'

describe('buildResolvedSystemPrompt', () => {
  it.todo('substitutes SKILLS_SUMMARY_TOKEN with the resolved summary')
  it.todo('falls back to SKILLS_SUMMARY_FALLBACK when skill-loader is missing')
  it.todo('caches the resolved summary across calls within the same process')
})

describe('getResolvedSkillsSummary', () => {
  it.todo('uses the loader summary when skills array is non-empty')
  it.todo('warns and returns fallback when loadSkills throws')
})
