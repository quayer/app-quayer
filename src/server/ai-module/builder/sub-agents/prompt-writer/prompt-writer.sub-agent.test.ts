/**
 * PromptWriter Sub-Agent — Unit Tests
 *
 * These tests mock `runLLMSubAgent` so the suite never hits a real LLM
 * provider. The focus is:
 *   - Input validation (Zod → INVALID_INPUT)
 *   - Successful section parsing on well-formed 10-section markdown
 *   - Failure surface for missing sections (PARSE_ERROR)
 *   - Forwarding of upstream LLM errors (TIMEOUT, etc.)
 *   - Deterministic helpers: buildUserMessage + parsePromptSections +
 *     builderStateToPromptWriterContext (builderState → writer context)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SubAgentContext, SubAgentResult } from '../types'
import type { RunLLMSubAgentSuccess } from '../base'

// ---------------------------------------------------------------------------
// Mock the base LLM helper BEFORE importing the sub-agent under test
// ---------------------------------------------------------------------------

vi.mock('../base', () => ({
  runLLMSubAgent: vi.fn(),
}))

import { runLLMSubAgent } from '../base'
import {
  promptWriterSubAgent,
  parsePromptSections,
  promptWriterInputSchema,
  type PromptWriterInput,
} from './prompt-writer.sub-agent'
import { buildUserMessage, SUB_LLM_SYSTEM } from './prompt-writer.prompt'
import { builderStateToPromptWriterContext } from './builder-context'
import { parseBuilderState } from '../../cards/builder-state'
import { REQUIRED_PROMPT_SECTIONS } from '../../templates/prompt-section-checklist'

const mockedRunLLM = vi.mocked(runLLMSubAgent)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseContext: SubAgentContext = {
  organizationId: 'org-test',
  userId: 'user-test',
  projectId: 'project-test',
}

const baseInput: PromptWriterInput = {
  brief: 'Atendimento de barbearia, agenda cortes, tom descontraído e jovem.',
  nicho: 'barbearia',
  objetivo: 'Qualificar clientes e agendar cortes de cabelo',
  attachedTools: [],
}

/** Well-formed 10-section markdown matching the canonical template headings. */
const wellFormedMarkdown = `# Papel
Você é um atendente virtual da Barbearia X. Você NÃO faz diagnósticos capilares.

# Objetivo
Agendar cortes e responder dúvidas rápidas. Missão cumprida quando o corte está agendado.

# Tom de voz
Tom descontraído e jovem. Exemplo bom: "Bora marcar?" Exemplo ruim: "Prezado cliente". Linguagem proibida: "Infelizmente".

# Comunicação
Uma pergunta por vez. No máximo 3 linhas por mensagem. Retry progressivo: reformule a pergunta antes de escalar.

# Ferramentas
- listar_servicos: quando o cliente perguntar preços
- criar_agendamento: quando o cliente confirmar horário

# Regras críticas
SEMPRE confirmar nome antes de agendar.
NUNCA inventar horários disponíveis.

# Fluxo de atendimento
Etapa 1: saudar o cliente
Etapa 2: identificar o serviço desejado
Etapa 3: confirmar dados e agendar

# Gatilhos e fallback
Fora do escopo: reclamações → acionar humano. Fallback: se não entender, reformule a pergunta.

# Limitações
- Não prometa preços sem confirmar.
- Se a pergunta fugir do escopo, use transfer_to_human.

# Encerramento
Após agendar, confirmar e encerrar: "Até logo!" FIM.`

const llmSuccess = (text: string): SubAgentResult<RunLLMSubAgentSuccess> => ({
  success: true,
  data: { text, durationMs: 100 },
  durationMs: 100,
})

beforeEach(() => {
  mockedRunLLM.mockReset()
})

// ---------------------------------------------------------------------------
// 1. Happy path
// ---------------------------------------------------------------------------

describe('promptWriterSubAgent.run — happy path', () => {
  it('parses a well-formed 10-section markdown into typed sections', async () => {
    mockedRunLLM.mockResolvedValueOnce(llmSuccess(wellFormedMarkdown))

    const result = await promptWriterSubAgent.run(baseInput, baseContext)

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.prompt).toBe(wellFormedMarkdown)
    expect(result.data.sections.papel).toContain('Barbearia X')
    expect(result.data.sections.objetivo).toContain('Agendar cortes')
    expect(result.data.sections.tom).toContain('Exemplo bom')
    expect(result.data.sections.comunicacao).toContain('Uma pergunta por vez')
    expect(result.data.sections.ferramentas).toContain('listar_servicos')
    expect(result.data.sections.regras).toContain('SEMPRE confirmar')
    expect(result.data.sections.fluxo).toContain('Etapa 1')
    expect(result.data.sections.gatilhos).toContain('Fallback')
    expect(result.data.sections.limitacoes).toContain('transfer_to_human')
    expect(result.data.sections.encerramento).toContain('FIM')
    // Legacy frontend alias — mirrors comunicacao.
    expect(result.data.sections.formato).toBe(result.data.sections.comunicacao)
  })

  it('calls runLLMSubAgent with the canonical system prompt and temperature', async () => {
    mockedRunLLM.mockResolvedValueOnce(llmSuccess(wellFormedMarkdown))

    await promptWriterSubAgent.run(baseInput, baseContext)

    expect(mockedRunLLM).toHaveBeenCalledTimes(1)
    const [params] = mockedRunLLM.mock.calls[0]
    expect(params.systemPrompt).toBe(SUB_LLM_SYSTEM)
    expect(params.temperature).toBe(0.4)
    expect(params.maxOutputTokens).toBe(3000)
    expect(params.timeoutMs).toBe(60_000)
  })
})

// ---------------------------------------------------------------------------
// 2. Parse error
// ---------------------------------------------------------------------------

describe('promptWriterSubAgent.run — parse error', () => {
  it('returns PARSE_ERROR when a required section header is missing', async () => {
    // Drop the "Encerramento" section entirely.
    const truncated = wellFormedMarkdown.replace(
      /# Encerramento[\s\S]*$/,
      '',
    )
    mockedRunLLM.mockResolvedValueOnce(llmSuccess(truncated))

    const result = await promptWriterSubAgent.run(baseInput, baseContext)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('PARSE_ERROR')
    expect(result.error).toMatch(/Encerramento/i)
  })

  it('returns PARSE_ERROR when a section body is empty', async () => {
    const emptyBody = wellFormedMarkdown.replace(
      /# Limitações[\s\S]*?(?=# Encerramento)/,
      '# Limitações\n\n',
    )

    mockedRunLLM.mockResolvedValueOnce(llmSuccess(emptyBody))

    const result = await promptWriterSubAgent.run(baseInput, baseContext)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('PARSE_ERROR')
    expect(result.error).toMatch(/Limita[cç][oõ]es/i)
  })
})

// ---------------------------------------------------------------------------
// 3. LLM error forwarding
// ---------------------------------------------------------------------------

describe('promptWriterSubAgent.run — upstream errors', () => {
  it('forwards TIMEOUT from runLLMSubAgent unchanged', async () => {
    mockedRunLLM.mockResolvedValueOnce({
      success: false,
      error: 'timeout',
      code: 'TIMEOUT',
      durationMs: 60_000,
    })

    const result = await promptWriterSubAgent.run(baseInput, baseContext)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('TIMEOUT')
    expect(result.error).toBe('timeout')
  })

  it('forwards UPSTREAM_ERROR as-is', async () => {
    mockedRunLLM.mockResolvedValueOnce({
      success: false,
      error: 'provider down',
      code: 'UPSTREAM_ERROR',
      durationMs: 120,
    })

    const result = await promptWriterSubAgent.run(baseInput, baseContext)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('UPSTREAM_ERROR')
    expect(result.error).toBe('provider down')
  })
})

// ---------------------------------------------------------------------------
// 4. Input validation
// ---------------------------------------------------------------------------

describe('promptWriterSubAgent.run — input validation', () => {
  it('returns INVALID_INPUT when brief is shorter than 20 chars', async () => {
    const result = await promptWriterSubAgent.run(
      { ...baseInput, brief: 'curto demais' },
      baseContext,
    )

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
    expect(mockedRunLLM).not.toHaveBeenCalled()
  })

  it('returns INVALID_INPUT when objetivo is missing minimum length', async () => {
    const result = await promptWriterSubAgent.run(
      { ...baseInput, objetivo: 'curto' },
      baseContext,
    )

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
  })

  it('schema accepts well-formed input, with optional builderContext + validatorFeedback', () => {
    expect(promptWriterInputSchema.safeParse(baseInput).success).toBe(true)
    expect(
      promptWriterInputSchema.safeParse({
        ...baseInput,
        builderContext: {
          hours: { preset: 'comercial', outOfHours: 'silent' },
          handoff: { mode: 'roleta', steps: ['nome'], memberNames: ['Ana'] },
        },
        validatorFeedback: ['Seção obrigatória ausente: Encerramento/FIM'],
      }).success,
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. Niche hint application
// ---------------------------------------------------------------------------

describe('buildUserMessage — niche hint', () => {
  it('injects the barbearia fallback (NICHE_HINTS.outro) when niche is unknown', () => {
    const msg = buildUserMessage({
      brief: 'Atendimento de barbearia X, agenda cortes.',
      nicho: 'barbearia',
      objetivo: 'Qualificar leads e agendar corte',
    })

    // "barbearia" is NOT a key of NICHE_HINTS, so we expect the `outro` hint.
    expect(msg).toContain('Quayer é canal specialist')
    expect(msg).toContain('## Contexto do nicho: barbearia')
  })

  it('picks the advocacia hint when nicho contains "advocacia"', () => {
    const msg = buildUserMessage({
      brief:
        'Escritório de advocacia trabalhista, atendimento consultivo para leads.',
      nicho: 'advocacia trabalhista',
      objetivo: 'Qualificar leads e marcar consulta',
    })

    expect(msg).toContain('escritório de advocacia')
    expect(msg).toContain('OAB')
  })
})

// ---------------------------------------------------------------------------
// 6. Niche insights inclusion
// ---------------------------------------------------------------------------

describe('buildUserMessage — niche insights', () => {
  it('appends an "Insights do nicho" block when insights are provided', () => {
    const msg = buildUserMessage({
      brief: 'Clínica veterinária que atende cães e gatos 24h.',
      nicho: 'veterinaria',
      objetivo: 'Agendar consultas de emergência',
      nicheInsights: {
        regulations: ['Resolução CFMV 1138/2016'],
        warnings: ['Nunca diagnosticar por texto sem exame presencial'],
      },
    })

    expect(msg).toContain('## Insights do nicho')
    expect(msg).toContain('Resolução CFMV 1138/2016')
    expect(msg).toContain('Nunca diagnosticar por texto sem exame presencial')
  })

  it('skips the insights block entirely when nicheInsights is omitted', () => {
    const msg = buildUserMessage({
      brief: 'Clínica veterinária que atende cães e gatos 24h.',
      nicho: 'veterinaria',
      objetivo: 'Agendar consultas de emergência',
    })

    expect(msg).not.toContain('## Insights do nicho')
  })
})

// ---------------------------------------------------------------------------
// 7. Builder context + validator feedback blocks
// ---------------------------------------------------------------------------

describe('buildUserMessage — builder context & validator feedback', () => {
  it('marks every group as NÃO INFORMADO when no builderContext is given', () => {
    const msg = buildUserMessage({
      brief: 'Atendimento de barbearia X, agenda cortes.',
      nicho: 'barbearia',
      objetivo: 'Qualificar leads e agendar corte',
    })

    expect(msg).toContain('## Dados já coletados do negócio')
    expect(msg).toContain('Horário de atendimento: NÃO INFORMADO')
    expect(msg).toContain('Handoff para humanos: NÃO INFORMADO')
    expect(msg).toContain('[REVISAR]')
  })

  it('renders collected hours, handoff and activation data', () => {
    const msg = buildUserMessage({
      brief: 'Atendimento de barbearia X, agenda cortes.',
      nicho: 'barbearia',
      objetivo: 'Qualificar leads e agendar corte',
      builderContext: {
        persona: { name: 'Lia', tone: 'descontraído' },
        hours: { preset: 'comercial', outOfHours: 'silent' },
        handoff: {
          mode: 'roleta',
          steps: ['Perguntar o nome', 'Perguntar o serviço'],
          memberNames: ['Ana', 'Beto'],
          openingMessage: 'Oi {nome}, sou da equipe!',
        },
        activation: { mode: 'keyword', keywords: ['corte', 'agendar'] },
      },
    })

    expect(msg).toContain('Nome: Lia')
    expect(msg).toContain('Preset: comercial')
    expect(msg).toContain('ficar em silêncio até reabrir')
    expect(msg).toContain('modo roleta')
    expect(msg).toContain('Perguntar o nome')
    expect(msg).toContain('Time: Ana, Beto')
    expect(msg).toContain('Oi {nome}, sou da equipe!')
    expect(msg).toContain('Palavras-chave de ativação: corte, agendar')
    expect(msg).not.toContain('Horário de atendimento: NÃO INFORMADO')
  })

  it('appends the validator-correction block only on retry', () => {
    const base = {
      brief: 'Atendimento de barbearia X, agenda cortes.',
      nicho: 'barbearia',
      objetivo: 'Qualificar leads e agendar corte',
    }

    expect(buildUserMessage(base)).not.toContain(
      '## Correções exigidas pelo validador',
    )

    const retry = buildUserMessage({
      ...base,
      validatorFeedback: ['Seção obrigatória ausente: Encerramento/FIM'],
    })
    expect(retry).toContain('## Correções exigidas pelo validador')
    expect(retry).toContain('Seção obrigatória ausente: Encerramento/FIM')
  })

  it('system prompt instructs all 10 checklist sections', () => {
    for (const section of REQUIRED_PROMPT_SECTIONS) {
      expect(SUB_LLM_SYSTEM).toContain(`# ${section.heading}`)
      expect(SUB_LLM_SYSTEM).toContain(`{{${section.key}}}`)
    }
  })
})

// ---------------------------------------------------------------------------
// 8. builderStateToPromptWriterContext (builderState → writer context)
// ---------------------------------------------------------------------------

describe('builderStateToPromptWriterContext', () => {
  it('collapses an empty state to all-undefined groups', () => {
    const context = builderStateToPromptWriterContext(parseBuilderState(null))
    expect(context.persona).toBeUndefined()
    expect(context.services).toBeUndefined()
    expect(context.hours).toBeUndefined()
    expect(context.handoff).toBeUndefined()
    expect(context.activation).toBeUndefined()
  })

  it('projects collected card data (hours, handoff members, activation)', () => {
    const state = parseBuilderState({
      persona: { name: 'Lia', tone: 'informal' },
      services: { offered: ['corte'], notOffered: ['coloração'] },
      hours: { preset: 'comercial', timezone: 'America/Sao_Paulo' },
      handoff: {
        mode: 'roleta',
        alsoSchedule: true,
        steps: ['nome'],
        members: [
          { name: 'Ana', position: 0 },
          { userId: 'u2', position: 1 }, // sem nome → filtrado de memberNames
        ],
        openingMessage: 'Oi!',
      },
      activation: { mode: 'always', keywords: [] },
    })

    const context = builderStateToPromptWriterContext(state)
    expect(context.persona?.name).toBe('Lia')
    expect(context.services?.notOffered).toEqual(['coloração'])
    expect(context.hours?.preset).toBe('comercial')
    expect(context.handoff?.mode).toBe('roleta')
    expect(context.handoff?.alsoSchedule).toBe(true)
    expect(context.handoff?.memberNames).toEqual(['Ana'])
    expect(context.handoff?.openingMessage).toBe('Oi!')
    expect(context.activation?.mode).toBe('always')
  })
})

// ---------------------------------------------------------------------------
// 9. parsePromptSections unit tests
// ---------------------------------------------------------------------------

describe('parsePromptSections', () => {
  it('extracts all ten sections from valid markdown', () => {
    const { sections, missing } = parsePromptSections(wellFormedMarkdown)

    expect(missing).toEqual([])
    expect(sections.papel).toContain('Barbearia X')
    expect(sections.tom).toContain('Exemplo bom')
    expect(sections.comunicacao).toContain('Uma pergunta por vez')
    expect(sections.ferramentas).toContain('criar_agendamento')
    expect(sections.fluxo).toContain('Etapa 3')
    expect(sections.gatilhos).toContain('acionar humano')
    expect(sections.encerramento).toContain('FIM')
    expect(sections.formato).toBe(sections.comunicacao)
  })

  it('accepts deeper header levels (##, ###)', () => {
    const withDeepHeaders = wellFormedMarkdown
      .replace(/^# Papel/m, '## Papel')
      .replace(/^# Encerramento/m, '### Encerramento')

    const { missing } = parsePromptSections(withDeepHeaders)
    expect(missing).toEqual([])
  })

  it('accepts "Limitacoes" without diacritics and heading suffixes (tolerant regex)', () => {
    const variants = wellFormedMarkdown
      .replace(/# Limitações/, '# Limitacoes')
      .replace(/# Comunicação/, '# Comunicacao operacional')
      .replace(/# Regras críticas/, '# Regras de conduta')
    const { missing } = parsePromptSections(variants)
    expect(missing).toEqual([])
  })

  it('does not leak an extra optional section into the previous body', () => {
    const withHours = wellFormedMarkdown.replace(
      /# Encerramento/,
      '# Horário de atendimento\nAtendemos das 9 às 18.\n\n# Encerramento',
    )
    const { sections, missing } = parsePromptSections(withHours)
    expect(missing).toEqual([])
    expect(sections.limitacoes).not.toContain('Atendemos das 9 às 18')
  })

  it('reports missing section names when a header is absent', () => {
    const dropped = wellFormedMarkdown.replace(
      /# Regras críticas[\s\S]*?(?=#)/,
      '',
    )

    const { missing } = parsePromptSections(dropped)
    expect(missing).toContain('Regras críticas')
  })

  it('reports missing section when body is empty after trim', () => {
    const emptyBody = wellFormedMarkdown.replace(
      /# Gatilhos e fallback[\s\S]*?(?=# Limitações)/,
      '# Gatilhos e fallback\n\n\n',
    )

    const { missing } = parsePromptSections(emptyBody)
    expect(missing).toContain('Gatilhos e fallback')
  })
})
