/**
 * edit_prompt_section — Builder tool (QH-07a)
 *
 * Surgical edit of ONE section (papel/objetivo/regras/limitacoes/formato)
 * without regenerating the full prompt. Reuses buildBuilderTool factory,
 * validatePrompt orchestrator, and Prisma database (same pattern as
 * update_agent_prompt). Creates a new draft BuilderPromptVersion on success;
 * returns success=false without persisting if validation has errors.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import { validatePrompt } from '../validators'
import type { BuilderToolExecutionContext } from './create-agent.tool'

// ---------------------------------------------------------------------------
// Section catalogue
// ---------------------------------------------------------------------------

const SECTION_HEADING: Record<string, RegExp> = {
  papel:      /^#\s+(papel|identidade|persona)\b/im,
  objetivo:   /^#\s+(objetivo|goal|miss[aã]o)\b/im,
  regras:     /^#\s+(regras?(\s+de\s+conduta|\s+cr[ií]ticas?)?|rules?)\b/im,
  limitacoes: /^#\s+(limita[cç][oõ]es?|restri[cç][oõ]es?|restrictions?)\b/im,
  formato:    /^#\s+(formato(\s+de\s+resposta)?|format(o)?)\b/im,
}

export type PromptSection = keyof typeof SECTION_HEADING

// ---------------------------------------------------------------------------
// Pure section-splice helpers (exported for testability)
// ---------------------------------------------------------------------------

export interface PromptSegment {
  /** Raw heading line (e.g. "# Regras de conduta"), or null for preamble */
  heading: string | null
  body: string
}

export function splitIntoSegments(prompt: string): PromptSegment[] {
  const parts = prompt.split(/(?=^#)/m)
  return parts.map((part) => {
    if (!part.startsWith('#')) return { heading: null, body: part }
    const nl = part.indexOf('\n')
    if (nl === -1) return { heading: part.trimEnd(), body: '' }
    return { heading: part.slice(0, nl).trimEnd(), body: part.slice(nl + 1) }
  })
}

export function joinSegments(segs: PromptSegment[]): string {
  return segs.map((s) => (s.heading === null ? s.body : `${s.heading}\n${s.body}`)).join('')
}

export function findSectionIndex(segs: PromptSegment[], section: PromptSection): number {
  const re = SECTION_HEADING[section]
  return segs.findIndex((s) => s.heading !== null && re.test(s.heading))
}

// ---------------------------------------------------------------------------
// Operation appliers
// ---------------------------------------------------------------------------

function applyAdd(body: string, content: string): string {
  return `${body.replace(/\n+$/, '')}\n${content}\n`
}
function applyReplace(_body: string, content: string): string {
  return `${content}\n`
}
function applyRemove(body: string, target: string): string {
  return body.split('\n').filter((l) => !l.includes(target)).join('\n')
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const editPromptSectionInputSchema = z.object({
  agentId:     z.string().uuid().describe('AIAgentConfig.id to edit'),
  section:     z.enum(['papel', 'objetivo', 'regras', 'limitacoes', 'formato']),
  operation:   z.enum(['add', 'replace', 'remove'])
    .describe('"add" appends; "replace" overwrites section body; "remove" deletes lines containing `target`'),
  content:     z.string().max(10_000).optional().describe('Required for add/replace'),
  target:      z.string().max(500).optional().describe('Required for remove — literal match'),
  description: z.string().max(500).optional(),
})

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function editPromptSectionTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'edit_prompt_section',
    metadata: { isReadOnly: false, isConcurrencySafe: false, requiresApproval: true },
    tool: tool({
      description:
        'Edits a single named section (papel/objetivo/regras/limitacoes/formato) of the active ' +
        'agent prompt without touching the others. Operations: add/replace/remove. ' +
        'Runs full validation after the edit — errors block persistence. ' +
        'Success creates a new draft BuilderPromptVersion (not published).',
      inputSchema: editPromptSectionInputSchema,
      execute: async (input) => {
        try {
          if ((input.operation === 'add' || input.operation === 'replace') && !input.content)
            return { success: false as const, message: `"content" is required for operation "${input.operation}"` }
          if (input.operation === 'remove' && !input.target)
            return { success: false as const, message: '"target" is required for operation "remove"' }

          // Tenant boundary: agent must belong to the active project
          const project = await database.builderProject.findFirst({
            where: { id: ctx.projectId, organizationId: ctx.organizationId, aiAgentId: input.agentId },
            select: { id: true },
          })
          if (!project)
            return { success: false as const, message: 'Agent does not belong to the active project' }

          // Load active prompt (prefer published, fall back to latest draft)
          const activeVersion = await database.builderPromptVersion.findFirst({
            where: { aiAgentId: input.agentId },
            orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { versionNumber: 'desc' }],
            select: { content: true, versionNumber: true },
          })
          if (!activeVersion)
            return { success: false as const, message: 'No prompt version found for this agent' }

          // Locate + splice section
          const segs = splitIntoSegments(activeVersion.content)
          const idx = findSectionIndex(segs, input.section)
          if (idx === -1)
            return { success: false as const, message: `Section "${input.section}" not found in the current prompt` }

          const seg = segs[idx]
          const newBody =
            input.operation === 'add'     ? applyAdd(seg.body, input.content!) :
            input.operation === 'replace' ? applyReplace(seg.body, input.content!) :
                                            applyRemove(seg.body, input.target!)
          const newPrompt = joinSegments(segs.map((s, i) => i === idx ? { ...s, body: newBody } : s))

          // Validate — do NOT persist on error
          const validation = validatePrompt(newPrompt)
          if (!validation.pass) {
            const errors = validation.issues.filter((i) => i.severity === 'error').map((i) => i.message)
            return {
              success: false as const,
              message: `Prompt validation failed — version NOT saved. Errors: ${errors.join('; ')}`,
              validationIssues: validation.issues,
            }
          }

          // Persist draft (publishedAt stays null)
          const nextVersion = activeVersion.versionNumber + 1
          const version = await database.builderPromptVersion.create({
            data: {
              aiAgentId:     input.agentId,
              versionNumber: nextVersion,
              content:       newPrompt,
              description:   input.description ?? `edit_prompt_section: ${input.operation} on "${input.section}"`,
              createdBy:     'chat',
            },
            select: { id: true },
          })

          return {
            success: true as const,
            versionNumber: nextVersion,
            versionId:     version.id,
            section:       input.section,
            operation:     input.operation,
            validationWarnings: validation.issues.filter((i) => i.severity === 'warning').map((i) => i.message),
            message: `Section "${input.section}" updated — new draft v${nextVersion} created. Not yet published.`,
          }
        } catch (err) {
          return { success: false as const, message: err instanceof Error ? err.message : 'Failed to edit prompt section' }
        }
      },
    }),
  })
}
