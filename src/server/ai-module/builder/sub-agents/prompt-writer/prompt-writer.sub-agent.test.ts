/**
 * PromptWriter Sub-Agent — Unit Tests
 *
 * These tests mock `runLLMSubAgent` so the suite never hits a real LLM
 * provider. The focus is:
 *   - Input validation (Zod → INVALID_INPUT)
 *   - Successful section parsing on well-formed markdown
 *   - Failure surface for missing sections (PARSE_ERROR)
 *   - Forwarding of upstream LLM errors (TIMEOUT, etc.)
 *   - Deterministic helpers: buildUserMessage + parsePromptSections
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
}

const wellFormedMarkdown = `# Papel
Você é um atendente virtual da Barbearia X.

# Objetivo
Agendar cortes e responder dúvidas rápidas.

# Regras de conduta
- Seja educado e direto.
- Use emojis com moderação.
- Confirme horário antes de finalizar.

# Limitações
- Não prometa preços sem confirmar.
- Se a pergunta fugir do escopo, use transfer_to_human.

# Formato de resposta
Respostas curtas, em pt-BR, até 3 frases, tom informal e acolhedor.`

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
  it('parses a well-formed 5-section markdown into typed sections', async () => {
    mockedRunLLM.mockResolvedValueOnce(llmSuccess(wellFormedMarkdown))

    const result = await promptWriterSubAgent.run(baseInput, baseContext)

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.prompt).toBe(wellFormedMarkdown)
    expect(result.data.sections.papel).toContain('Barbearia X')
    expect(result.data.sections.objetivo).toContain('Agendar cortes')
    expect(result.data.sections.regras).toContain('- Seja educado')
    expect(result.data.sections.limitacoes).toContain('transfer_to_human')
    expect(result.data.sections.formato).toContain('pt-BR')
  })

  it('calls runLLMSubAgent with the canonical system prompt and temperature', async () => {
    mockedRunLLM.mockResolvedValueOnce(llmSuccess(wellFormedMarkdown))

    await promptWriterSubAgent.run(baseInput, baseContext)

    expect(mockedRunLLM).toHaveBeenCalledTimes(1)
    const [params] = mockedRunLLM.mock.calls[0]
    expect(params.systemPrompt).toBe(SUB_LLM_SYSTEM)
    expect(params.temperature).toBe(0.4)
    expect(params.maxOutputTokens).toBe(2000)
    expect(params.timeoutMs).toBe(60_000)
  })
})

// ---------------------------------------------------------------------------
// 2. Parse error
// ---------------------------------------------------------------------------

describe('promptWriterSubAgent.run — parse error', () => {
  it('returns PARSE_ERROR when a required section header is missing', async () => {
    // Drop the "Formato de resposta" section entirely.
    const truncated = wellFormedMarkdown.replace(
      /# Formato de resposta[\s\S]*$/,
      '',
    )
    mockedRunLLM.mockResolvedValueOnce(llmSuccess(truncated))

    const result = await promptWriterSubAgent.run(baseInput, baseContext)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('PARSE_ERROR')
    expect(result.error).toMatch(/Formato de resposta/i)
  })

  it('returns PARSE_ERROR when a section body is empty', async () => {
    const emptyBody = `# Papel
Atendente.

# Objetivo
Agendar.

# Regras de conduta
- Seja educado.

# Limitações

# Formato de resposta
Curto e direto.`

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

  it('schema accepts well-formed input', () => {
    const parsed = promptWriterInputSchema.safeParse(baseInput)
    expect(parsed.success).toBe(true)
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

  it('omits empty insight categories', () => {
    const msg = buildUserMessage({
      brief: 'Clínica veterinária que atende cães e gatos 24h.',
      nicho: 'veterinaria',
      objetivo: 'Agendar consultas de emergência',
      nicheInsights: {
        regulations: ['Resolução CFMV 1138/2016'],
      },
    })

    expect(msg).toContain('### Regulamentações')
    expect(msg).not.toContain('### Alertas')
    expect(msg).not.toContain('### Vocabulário do setor')
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
// 7. parsePromptSections unit tests
// ---------------------------------------------------------------------------

describe('parsePromptSections', () => {
  it('extracts all five sections from valid markdown', () => {
    const { sections, missing } = parsePromptSections(wellFormedMarkdown)

    expect(missing).toEqual([])
    expect(sections.papel).toContain('Barbearia X')
    expect(sections.objetivo).toContain('Agendar cortes')
    expect(sections.regras).toContain('Seja educado')
    expect(sections.limitacoes).toContain('transfer_to_human')
    expect(sections.formato).toContain('pt-BR')
  })

  it('accepts deeper header levels (##, ###)', () => {
    const withDeepHeaders = wellFormedMarkdown
      .replace(/^# Papel/m, '## Papel')
      .replace(/^# Formato de resposta/m, '### Formato de resposta')

    const { missing } = parsePromptSections(withDeepHeaders)
    expect(missing).toEqual([])
  })

  it('accepts "Limitacoes" without diacritics (tolerant regex)', () => {
    const noDiacritic = wellFormedMarkdown.replace(
      /# Limitações/,
      '# Limitacoes',
    )
    const { missing } = parsePromptSections(noDiacritic)
    expect(missing).toEqual([])
  })

  it('reports missing section names when a header is absent', () => {
    const dropped = wellFormedMarkdown.replace(/# Regras de conduta[\s\S]*?(?=#)/, '')

    const { missing } = parsePromptSections(dropped)
    expect(missing).toContain('Regras de conduta')
  })

  it('reports missing section when body is empty after trim', () => {
    const emptyBody = `# Papel
A.

# Objetivo
B.

# Regras de conduta
- ok

# Limitações


# Formato de resposta
C.`

    const { missing } = parsePromptSections(emptyBody)
    expect(missing).toContain('Limitações')
  })
})
