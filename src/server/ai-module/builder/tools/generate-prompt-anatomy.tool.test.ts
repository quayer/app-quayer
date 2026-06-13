/**
 * Unit tests — generatePromptAnatomyTool (self-correction loop)
 *
 * Strategy: mock the sub-agent barrel (writer + validator) and Prisma, then
 * verify the orchestration contract:
 *   - pass on attempt 1 → single writer call, attempts=1, honest "APROVADO"
 *   - fail → retry feeding validator errors → pass on attempt 2
 *   - fail twice → attempts=2, validation.pass=false, message demands
 *     honest reporting (never "prompt pronto" with pendências)
 *   - builderState projection: selectedToolKeys union + builderContext forward
 *   - writer hard failure → success=false envelope
 *
 * Hermetic: no real DB, no LLM.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (BEFORE importing the SUT)
// ---------------------------------------------------------------------------

const {
  mockWriterRun,
  mockValidatorRun,
  mockToContext,
  mockDbConversationFindFirst,
} = vi.hoisted(() => ({
  mockWriterRun: vi.fn(),
  mockValidatorRun: vi.fn(),
  mockToContext: vi.fn(),
  mockDbConversationFindFirst: vi.fn(),
}))

vi.mock('../sub-agents', () => ({
  promptWriterSubAgent: {
    metadata: {
      name: 'prompt-writer',
      isReadOnly: true,
      isConcurrencySafe: false,
      timeoutMs: 60_000,
    },
    run: mockWriterRun,
  },
  validatorSubAgent: {
    metadata: {
      name: 'validator',
      isReadOnly: true,
      isConcurrencySafe: true,
      timeoutMs: 5_000,
    },
    run: mockValidatorRun,
  },
  builderStateToPromptWriterContext: mockToContext,
}))

vi.mock('@/server/services/database', () => ({
  database: {
    builderProjectConversation: {
      findFirst: mockDbConversationFindFirst,
    },
  },
}))

import { generatePromptAnatomyTool } from './generate-prompt-anatomy.tool'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CTX = {
  projectId: 'proj-uuid-001',
  organizationId: 'org-uuid-001',
  userId: 'user-uuid-001',
}

const INPUT = {
  brief: 'Atendimento de barbearia, agenda cortes, tom descontraído.',
  nicho: 'barbearia',
  objetivo: 'Qualificar clientes e agendar cortes',
  attachedTools: ['transfer_to_human'],
}

const GENERATED = {
  prompt: '# Papel\nVocê é um atendente...\n# Encerramento\nFIM.',
  sections: { papel: 'Você é um atendente...', encerramento: 'FIM.' },
}

const BUILDER_CONTEXT = { hours: { preset: 'comercial' } }

const APPROVED_BLUEPRINT = {
  status: 'approved',
  objective: 'Qualificar interessados em imoveis e conduzir para visita.',
  niche: 'imobiliario',
  stages: [
    {
      id: 'qualificacao',
      title: 'Qualificacao',
      goal: 'Entender interesse e proximo passo.',
    },
  ],
  questions: [
    {
      id: 'regiao',
      stageId: 'qualificacao',
      text: 'Qual bairro voce busca?',
      purpose: 'Descobrir a regiao de interesse.',
      variableKey: 'regiao_interesse',
      skipWhenKnown: 'Pular se a regiao ja estiver clara no contexto.',
    },
  ],
  variables: [
    {
      key: 'regiao_interesse',
      label: 'Regiao de interesse',
      type: 'location',
      source: 'user',
      reviewRequired: false,
    },
  ],
  skipRules: [],
  successCriteria: ['Regiao e proximo passo claros.'],
  handoffTriggers: [],
  toolTriggers: [],
  objectionRules: [],
  doRules: [],
  dontRules: ['Nunca inventar disponibilidade.'],
  sourceRefs: [],
  approvedAt: '2026-06-12T12:00:00.000Z',
}

function writerOk(data = GENERATED) {
  return { success: true as const, data, durationMs: 50 }
}

function validatorOk(pass: boolean, issues: Array<{ validator: string; severity: string; message: string }> = []) {
  return {
    success: true as const,
    data: { pass, issues },
    durationMs: 5,
  }
}

const ANATOMY_ERROR = {
  validator: 'anatomy',
  severity: 'error',
  message: 'Seção obrigatória ausente: Encerramento/FIM — explicit end condition',
}

/** Extracts the execute function from the AI SDK tool wrapper. */
async function execute(input: unknown = INPUT) {
  const builtTool = generatePromptAnatomyTool(CTX)
  const executeFn = (
    builtTool as unknown as { execute: (i: unknown) => Promise<unknown> }
  ).execute
  return executeFn(input) as Promise<Record<string, unknown>>
}

beforeEach(() => {
  mockWriterRun.mockReset()
  mockValidatorRun.mockReset()
  mockToContext.mockReset()
  mockDbConversationFindFirst.mockReset()
  // Default: conversation exists with selected tools via card
  mockDbConversationFindFirst.mockResolvedValue({
    builderState: { selectedToolKeys: ['criar_agendamento'] },
  })
  mockToContext.mockReturnValue(BUILDER_CONTEXT)
})

// ---------------------------------------------------------------------------
// 1. Pass on first attempt
// ---------------------------------------------------------------------------

describe('generate_prompt_anatomy — first attempt passes', () => {
  it('runs writer+validator once and reports approval honestly', async () => {
    mockWriterRun.mockResolvedValueOnce(writerOk())
    mockValidatorRun.mockResolvedValueOnce(validatorOk(true))

    const result = await execute()

    expect(mockWriterRun).toHaveBeenCalledTimes(1)
    expect(mockValidatorRun).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(true)
    expect(result.attempts).toBe(1)
    expect(result.prompt).toBe(GENERATED.prompt)
    expect(result.validation).toMatchObject({ ran: true, pass: true })
    expect(String(result.message)).toContain('APROVADO')

    // First attempt must NOT carry validator feedback
    const [writerInput] = mockWriterRun.mock.calls[0]
    expect(writerInput.validatorFeedback).toBeUndefined()
  })

  it('unions card-selected tools with LLM-provided attachedTools and forwards builderContext', async () => {
    mockWriterRun.mockResolvedValueOnce(writerOk())
    mockValidatorRun.mockResolvedValueOnce(validatorOk(true))

    await execute()

    const [writerInput] = mockWriterRun.mock.calls[0]
    expect(writerInput.attachedTools).toEqual(
      expect.arrayContaining(['transfer_to_human', 'criar_agendamento']),
    )
    expect(writerInput.builderContext).toBe(BUILDER_CONTEXT)

    const [validatorInput] = mockValidatorRun.mock.calls[0]
    expect(validatorInput.attachedTools).toEqual(
      expect.arrayContaining(['transfer_to_human', 'criar_agendamento']),
    )
  })
})

// ---------------------------------------------------------------------------
// 2. Self-correction retry
// ---------------------------------------------------------------------------

describe('generate_prompt_anatomy — self-correction loop', () => {
  it('retries ONCE feeding validator errors back to the writer, then passes', async () => {
    mockWriterRun
      .mockResolvedValueOnce(writerOk())
      .mockResolvedValueOnce(writerOk({ ...GENERATED, prompt: 'v2' }))
    mockValidatorRun
      .mockResolvedValueOnce(validatorOk(false, [ANATOMY_ERROR]))
      .mockResolvedValueOnce(validatorOk(true))

    const result = await execute()

    expect(mockWriterRun).toHaveBeenCalledTimes(2)
    expect(mockValidatorRun).toHaveBeenCalledTimes(2)

    // Retry call must carry the validator error messages
    const [retryInput] = mockWriterRun.mock.calls[1]
    expect(retryInput.validatorFeedback).toEqual([ANATOMY_ERROR.message])

    expect(result.success).toBe(true)
    expect(result.attempts).toBe(2)
    expect(result.prompt).toBe('v2')
    expect(result.validation).toMatchObject({ ran: true, pass: true })
  })

  it('stops at 2 attempts and returns pass=false with honest pendências message', async () => {
    mockWriterRun.mockResolvedValue(writerOk())
    mockValidatorRun.mockResolvedValue(validatorOk(false, [ANATOMY_ERROR]))

    const result = await execute()

    expect(mockWriterRun).toHaveBeenCalledTimes(2)
    expect(mockValidatorRun).toHaveBeenCalledTimes(2)
    expect(result.success).toBe(true)
    expect(result.attempts).toBe(2)
    expect(result.validation).toMatchObject({ ran: true, pass: false })
    const message = String(result.message)
    expect(message).toContain('REPROVOU')
    expect(message).toContain('NUNCA diga ao usuário que o prompt está pronto')
    expect(message).toContain(ANATOMY_ERROR.message)
  })

  it('does NOT retry on warning-only failures impossible state (no error messages)', async () => {
    // pass=false but zero error-severity issues → blind retry would not help.
    mockWriterRun.mockResolvedValueOnce(writerOk())
    mockValidatorRun.mockResolvedValueOnce(
      validatorOk(false, [{ ...ANATOMY_ERROR, severity: 'warning' }]),
    )

    const result = await execute()

    expect(mockWriterRun).toHaveBeenCalledTimes(1)
    expect(result.attempts).toBe(1)
    expect((result.validation as { pass: boolean }).pass).toBe(false)
  })

  it('keeps the first attempt result when the retry generation fails', async () => {
    mockWriterRun
      .mockResolvedValueOnce(writerOk())
      .mockResolvedValueOnce({
        success: false as const,
        error: 'timeout',
        code: 'TIMEOUT',
        durationMs: 60_000,
      })
    mockValidatorRun.mockResolvedValueOnce(validatorOk(false, [ANATOMY_ERROR]))

    const result = await execute()

    expect(result.success).toBe(true)
    expect(result.attempts).toBe(1)
    expect(result.prompt).toBe(GENERATED.prompt)
    expect(result.validation).toMatchObject({ ran: true, pass: false })
  })
})

// ---------------------------------------------------------------------------
// 2b. Builder Playbook guard + preservation
// ---------------------------------------------------------------------------

describe('generate_prompt_anatomy — Builder Playbook', () => {
  it('requires an approved conversation blueprint before generating v2 prompts', async () => {
    mockDbConversationFindFirst.mockResolvedValueOnce({
      builderState: { journeyVersion: 2 },
    })

    const result = await execute()

    expect(result.success).toBe(false)
    expect(result.code).toBe('BLUEPRINT_REQUIRED')
    expect(String(result.message)).toContain('Plano de atendimento')
    expect(mockWriterRun).not.toHaveBeenCalled()
    expect(mockValidatorRun).not.toHaveBeenCalled()
  })

  it('retries when the prompt does not preserve the approved blueprint', async () => {
    mockDbConversationFindFirst.mockResolvedValueOnce({
      builderState: {
        journeyVersion: 2,
        conversationBlueprint: APPROVED_BLUEPRINT,
      },
    })
    mockToContext.mockReturnValueOnce({
      ...BUILDER_CONTEXT,
      conversationBlueprint: APPROVED_BLUEPRINT,
    })

    const promptWithBlueprint = `
# Fluxo de atendimento
Pergunte: "Qual bairro voce busca?".
Capture regiao_interesse / regiao de interesse.
Nao repetir se a regiao ja estiver clara no contexto.

# Regras criticas
Nunca inventar disponibilidade.
`

    mockWriterRun
      .mockResolvedValueOnce(
        writerOk({ ...GENERATED, prompt: 'Prompt generico sem roteiro.' }),
      )
      .mockResolvedValueOnce(writerOk({ ...GENERATED, prompt: promptWithBlueprint }))
    mockValidatorRun.mockResolvedValue(validatorOk(true))

    const result = await execute()

    expect(mockWriterRun).toHaveBeenCalledTimes(2)
    expect(mockValidatorRun).toHaveBeenCalledTimes(2)

    const [firstWriterInput] = mockWriterRun.mock.calls[0]
    expect(firstWriterInput.builderContext).toMatchObject({
      conversationBlueprint: { status: 'approved' },
    })

    const [retryInput] = mockWriterRun.mock.calls[1]
    expect(retryInput.validatorFeedback).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Pergunta do blueprint ausente'),
      ]),
    )
    expect(result.success).toBe(true)
    expect(result.attempts).toBe(2)
    expect(result.validation).toMatchObject({ ran: true, pass: true })
  })
})

// ---------------------------------------------------------------------------
// 3. Failure surfaces
// ---------------------------------------------------------------------------

describe('generate_prompt_anatomy — failures', () => {
  it('returns success=false when the first generation fails outright', async () => {
    mockWriterRun.mockResolvedValueOnce({
      success: false as const,
      error: 'provider down',
      code: 'UPSTREAM_ERROR',
      durationMs: 100,
    })

    const result = await execute()

    expect(result.success).toBe(false)
    expect(result.message).toBe('provider down')
    expect(result.code).toBe('UPSTREAM_ERROR')
    expect(mockValidatorRun).not.toHaveBeenCalled()
  })

  it('flags QA-skipped when the validator itself fails (ran=false, no retry)', async () => {
    mockWriterRun.mockResolvedValueOnce(writerOk())
    mockValidatorRun.mockResolvedValueOnce({
      success: false as const,
      error: 'boom',
      code: 'RUNTIME_ERROR',
      durationMs: 1,
    })

    const result = await execute()

    expect(mockWriterRun).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(true)
    expect(result.validation).toMatchObject({ ran: false, error: 'boom' })
    expect(String(result.message)).toContain('não foi verificado')
  })

  it('fails open when the conversation lookup throws (no context, tools from input only)', async () => {
    mockDbConversationFindFirst.mockRejectedValueOnce(new Error('db down'))
    mockWriterRun.mockResolvedValueOnce(writerOk())
    mockValidatorRun.mockResolvedValueOnce(validatorOk(true))

    const result = await execute()

    expect(result.success).toBe(true)
    const [writerInput] = mockWriterRun.mock.calls[0]
    expect(writerInput.attachedTools).toEqual(['transfer_to_human'])
    expect(writerInput.builderContext).toBeUndefined()
  })
})
