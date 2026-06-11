/**
 * PromptWriter — Builder Context
 *
 * Bridges the canonical `BuilderState` (cards/builder-state.ts) into the
 * compact, writer-friendly context the PromptWriter sub-LLM consumes:
 *
 *   - `promptWriterBuilderContextSchema` — Zod shape accepted by the writer
 *     input (everything optional; the writer degrades to sensible defaults).
 *   - `builderStateToPromptWriterContext` — pure mapper BuilderState → context.
 *   - `formatBuilderContextBlock` — renders the `## Dados já coletados` block
 *     of the user message. Missing data is explicitly marked `NÃO INFORMADO`
 *     so the writer fills a sensible default AND tags the line `[REVISAR]`.
 *
 * Pure module — no IO, no `any`.
 */

import { z } from 'zod'
import type { BuilderState } from '../../cards/builder-state'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const promptWriterBuilderContextSchema = z.object({
  /** agent_persona card — identity already approved by the user. */
  persona: z
    .object({
      name: z.string().optional(),
      tone: z.string().optional(),
      style: z.string().optional(),
      greeting: z.string().optional(),
    })
    .optional(),
  /** services_oferece_nao card. */
  services: z
    .object({
      offered: z.array(z.string()).default([]),
      notOffered: z.array(z.string()).default([]),
    })
    .optional(),
  /** business_hours card. `scheduleText` is a pre-rendered human summary. */
  hours: z
    .object({
      preset: z.string().optional(),
      timezone: z.string().optional(),
      outOfHours: z.enum(['reply_notice', 'silent']).optional(),
      scheduleText: z.string().optional(),
    })
    .optional(),
  /** handoff card — modo + roteiro + roster + abertura do warm transfer. */
  handoff: z
    .object({
      mode: z.enum(['solo', 'roleta', 'departamentos', 'nenhum']).optional(),
      alsoSchedule: z.boolean().optional(),
      steps: z.array(z.string()).default([]),
      memberNames: z.array(z.string()).default([]),
      openingMessage: z.string().optional(),
    })
    .optional(),
  /** activation_mode card. */
  activation: z
    .object({
      mode: z.string().optional(),
      keywords: z.array(z.string()).default([]),
    })
    .optional(),
  /** identity owned via accept do card source_progress (Fontes do negócio). */
  business: z
    .object({
      address: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
})

export type PromptWriterBuilderContext = z.infer<
  typeof promptWriterBuilderContextSchema
>

// ---------------------------------------------------------------------------
// Mapper — BuilderState → PromptWriterBuilderContext
// ---------------------------------------------------------------------------

function compactStrings(values: ReadonlyArray<string | undefined>): string[] {
  return values.filter((v): v is string => Boolean(v && v.trim()))
}

/** Render the opaque `hours.schedule` JSON into a short human-readable line. */
function renderScheduleText(schedule: unknown): string | undefined {
  if (schedule === null || schedule === undefined) return undefined
  try {
    const text = JSON.stringify(schedule)
    if (!text || text === '{}' || text === '[]') return undefined
    return text.length > 600 ? `${text.slice(0, 600)}…` : text
  } catch {
    return undefined
  }
}

/**
 * Pure projection of the canonical BuilderState into the writer context.
 * Empty groups collapse to `undefined` so the formatter can flag them as
 * "NÃO INFORMADO" instead of emitting empty bullets.
 */
export function builderStateToPromptWriterContext(
  state: BuilderState,
): PromptWriterBuilderContext {
  const persona = state.persona
  const hasPersona = Boolean(
    persona.name || persona.tone || persona.style || persona.greeting,
  )

  const services = state.services
  const hasServices =
    services.offered.length > 0 || services.notOffered.length > 0

  const hours = state.hours
  const scheduleText = renderScheduleText(hours.schedule)
  const hasHours = Boolean(hours.preset || scheduleText || hours.timezone)

  const handoff = state.handoff
  const memberNames = compactStrings(handoff.members.map((m) => m.name))
  const hasHandoff = Boolean(
    handoff.mode || handoff.steps.length > 0 || memberNames.length > 0,
  )

  const activation = state.activation
  const hasActivation = Boolean(
    activation.mode || activation.keywords.length > 0,
  )

  // identity (address/description) — owned via accept do card Fontes do negócio.
  // `identity` pode estar ausente em BuilderState antigos serializados antes do
  // campo existir; o schema backfilla `{}` mas protegemos com optional chaining.
  const identity = state.identity
  const businessAddress = identity?.address?.trim() || undefined
  const businessDescription = identity?.description?.trim() || undefined
  const hasBusiness = Boolean(businessAddress || businessDescription)

  return {
    persona: hasPersona
      ? {
          name: persona.name,
          tone: persona.tone,
          style: persona.style,
          greeting: persona.greeting,
        }
      : undefined,
    services: hasServices
      ? { offered: services.offered, notOffered: services.notOffered }
      : undefined,
    hours: hasHours
      ? {
          preset: hours.preset,
          timezone: hours.timezone,
          outOfHours: hours.outOfHours,
          scheduleText,
        }
      : undefined,
    handoff: hasHandoff
      ? {
          mode: handoff.mode,
          alsoSchedule: handoff.alsoSchedule,
          steps: handoff.steps,
          memberNames,
          openingMessage: handoff.openingMessage,
        }
      : undefined,
    activation: hasActivation
      ? { mode: activation.mode, keywords: activation.keywords }
      : undefined,
    business: hasBusiness
      ? { address: businessAddress, description: businessDescription }
      : undefined,
  }
}

// ---------------------------------------------------------------------------
// Formatter — context → `## Dados já coletados` block
// ---------------------------------------------------------------------------

const NOT_PROVIDED =
  'NÃO INFORMADO — use um default sensato e marque a(s) linha(s) geradas com [REVISAR]'

function bulletList(items: readonly string[]): string {
  return items.map((i) => `  - ${i}`).join('\n')
}

const HANDOFF_MODE_LABEL: Record<string, string> = {
  solo: 'solo (o próprio dono recebe os leads qualificados)',
  roleta: 'roleta (rodízio entre membros do time)',
  departamentos: 'departamentos (transfere para o departamento certo)',
  nenhum: 'nenhum (o agente resolve sozinho, sem transferir para humanos)',
}

/**
 * Render the writer-facing context block. ALWAYS emits every group so the
 * sub-LLM sees explicitly what is known vs. pending (`NÃO INFORMADO`).
 */
export function formatBuilderContextBlock(
  context: PromptWriterBuilderContext | undefined,
): string {
  const ctx = context ?? {}
  const lines: string[] = ['## Dados já coletados do negócio']

  // Persona / identidade
  if (ctx.persona) {
    lines.push('- Identidade do agente:')
    if (ctx.persona.name) lines.push(`  - Nome: ${ctx.persona.name}`)
    if (ctx.persona.tone) lines.push(`  - Tom: ${ctx.persona.tone}`)
    if (ctx.persona.style) lines.push(`  - Estilo: ${ctx.persona.style}`)
    if (ctx.persona.greeting) {
      lines.push(`  - Saudação: ${ctx.persona.greeting}`)
    }
  } else {
    lines.push(`- Identidade do agente: ${NOT_PROVIDED}`)
  }

  // Serviços
  if (ctx.services) {
    if (ctx.services.offered.length > 0) {
      lines.push('- Serviços oferecidos:')
      lines.push(bulletList(ctx.services.offered))
    }
    if (ctx.services.notOffered.length > 0) {
      lines.push('- Serviços que NÃO oferece (citar em Limitações):')
      lines.push(bulletList(ctx.services.notOffered))
    }
  } else {
    lines.push(`- Serviços oferecidos: ${NOT_PROVIDED}`)
  }

  // Horário da equipe humana (não limita disponibilidade da IA)
  if (ctx.hours) {
    lines.push(
      '- Horário da equipe humana (incluir seção "# Horário da equipe"; a IA continua disponível 24/7):',
    )
    if (ctx.hours.preset) lines.push(`  - Preset: ${ctx.hours.preset}`)
    if (ctx.hours.scheduleText) {
      lines.push(`  - Agenda: ${ctx.hours.scheduleText}`)
    }
    if (ctx.hours.timezone) lines.push(`  - Fuso: ${ctx.hours.timezone}`)
    lines.push(
      ctx.hours.outOfHours === 'silent'
        ? '  - Fora do horário da equipe: a IA responde sozinha e não promete retorno humano imediato'
        : '  - Fora do horário da equipe: a IA responde e avisa quando a equipe humana retorna',
    )
  } else {
    lines.push(`- Horário da equipe humana: ${NOT_PROVIDED}`)
  }

  // Handoff
  if (ctx.handoff) {
    const modeLabel = ctx.handoff.mode
      ? (HANDOFF_MODE_LABEL[ctx.handoff.mode] ?? ctx.handoff.mode)
      : 'não definido'
    lines.push(`- Handoff para humanos: modo ${modeLabel}`)
    if (ctx.handoff.alsoSchedule) {
      lines.push('  - Também agenda compromissos (incluir no fluxo)')
    }
    if (ctx.handoff.steps.length > 0) {
      lines.push(
        '  - Roteiro de qualificação ANTES do handoff (usar como etapas do fluxo):',
      )
      lines.push(ctx.handoff.steps.map((s) => `    - ${s}`).join('\n'))
    }
    if (ctx.handoff.memberNames.length > 0) {
      lines.push(`  - Time: ${ctx.handoff.memberNames.join(', ')}`)
    }
    if (ctx.handoff.openingMessage) {
      lines.push(`  - Mensagem de abertura do transfer: ${ctx.handoff.openingMessage}`)
    }
    lines.push(
      '  - Antes de transferir, montar resumo com nome + interesse + objetivo do cliente.',
    )
  } else {
    lines.push(`- Handoff para humanos: ${NOT_PROVIDED}`)
  }

  // Negócio (endereço/descrição vindos das Fontes do negócio)
  if (ctx.business) {
    lines.push('- Dados do negócio (das fontes site/Instagram aceitas pelo usuário):')
    if (ctx.business.description) {
      lines.push(`  - Descrição: ${ctx.business.description}`)
    }
    if (ctx.business.address) {
      lines.push(
        `  - Endereço: ${ctx.business.address} (informar quando o cliente perguntar localização)`,
      )
    }
  }

  // Ativação
  if (ctx.activation) {
    if (ctx.activation.mode) {
      lines.push(`- Modo de ativação do agente: ${ctx.activation.mode}`)
    }
    if (ctx.activation.keywords.length > 0) {
      lines.push(
        `- Palavras-chave de ativação: ${ctx.activation.keywords.join(', ')}`,
      )
    }
  } else {
    lines.push(`- Modo de ativação: ${NOT_PROVIDED}`)
  }

  return `${lines.join('\n')}\n`
}
