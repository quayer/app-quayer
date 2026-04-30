import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

export interface BuilderSkill {
  name: string
  description: string
  whenToUse: string
  allowedTools: string[]
  context: 'inline' | 'fork'
  body: string
}

const SKILLS_DIR = path.join(__dirname, '.')
const SKILL_EXTENSION = '.skill.md'

/**
 * Scans builder/skills/*.skill.md files, parses each with gray-matter,
 * and returns an array of BuilderSkill.
 * Handles missing directory gracefully (returns empty array).
 */
export function loadSkills(): BuilderSkill[] {
  try {
    if (!fs.existsSync(SKILLS_DIR)) {
      return []
    }

    const files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith(SKILL_EXTENSION))

    return files.map((file) => {
      const filePath = path.join(SKILLS_DIR, file)
      const raw = fs.readFileSync(filePath, 'utf-8')
      const { data, content } = matter(raw)

      return {
        name: String(data.name ?? ''),
        description: String(data.description ?? ''),
        whenToUse: String(data.when_to_use ?? ''),
        allowedTools: Array.isArray(data.allowed_tools)
          ? data.allowed_tools.map(String)
          : [],
        context: data.context === 'fork' ? 'fork' : 'inline',
        body: content.trim(),
      } satisfies BuilderSkill
    })
  } catch {
    return []
  }
}

/**
 * Returns a formatted summary of skills for system prompt injection.
 *
 * Format:
 * ```
 * # Skills disponíveis
 * SKILL: prompt-engineer (inline)
 *   Triggers: cria agente, novo projeto, melhora prompt
 *   Tools: generate_prompt_anatomy, run_playground_test, update_agent_prompt, search_web
 * ```
 */
export function getSkillsSummary(skills: BuilderSkill[]): string {
  if (skills.length === 0) {
    return '# Skills disponíveis\nNenhuma skill registrada.'
  }

  const lines = skills.map((skill) => {
    const toolsList = skill.allowedTools.join(', ')
    const triggers = extractTriggers(skill.whenToUse)
    return [
      `SKILL: ${skill.name} (${skill.context})`,
      `  Triggers: ${triggers}`,
      `  Tools: ${toolsList}`,
    ].join('\n')
  })

  return `# Skills disponíveis\n${lines.join('\n')}`
}

/**
 * Extracts trigger phrases from the whenToUse field.
 * Looks for quoted strings after "Triggers:" or falls back to first line.
 */
function extractTriggers(whenToUse: string): string {
  const triggersMatch = whenToUse.match(/Triggers?:\s*(.+)/i)
  if (triggersMatch) {
    // Extract quoted strings like "cria agente", "novo projeto"
    const quoted = triggersMatch[1].match(/"([^"]+)"/g)
    if (quoted) {
      return quoted.map((q) => q.replace(/"/g, '')).join(', ')
    }
    return triggersMatch[1].trim()
  }
  // Fallback: return first sentence
  const firstSentence = whenToUse.split(/[.\n]/)[0]
  return firstSentence?.trim() ?? whenToUse.trim()
}
