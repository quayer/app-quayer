/**
 * Tests for validatorSubAgent.
 *
 * Pure-logic sub-agent — no DB/LLM plumbing to mock except the call to
 * `validatePrompt` in the abort-path test (to prove we short-circuit
 * BEFORE invoking the validator).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SubAgentContext } from '../types'

// Hoisted spy — so the factory passed to vi.mock can reference it.
const validatePromptSpy = vi.hoisted(() => vi.fn())

vi.mock('../../validators', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../validators')>()
  return {
    ...actual,
    validatePrompt: (...args: Parameters<typeof actual.validatePrompt>) => {
      validatePromptSpy(...args)
      return actual.validatePrompt(...args)
    },
  }
})

// Imported AFTER vi.mock so the mocked module is used.
import { validatorSubAgent, validatorInputSchema } from './validator.sub-agent'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_CONTEXT: SubAgentContext = {
  organizationId: 'org-test',
  userId: 'user-test',
  projectId: 'project-test',
}

/** Prompt containing all 5 Anatomy sections with non-trivial content. */
const WELL_FORMED_PROMPT = `# Papel
Voce e uma atendente virtual da Clinica Dental Sorriso, especializada em agendamentos odontologicos.

# Objetivo
Ajudar pacientes a tirar duvidas sobre servicos da clinica e orientar sobre os proximos passos.

# Regras de conduta
Seja cordial e direto. Sempre confirme os dados do paciente antes de encerrar o atendimento.

# Limitacoes
Nunca prometa prazos de cura ou resultados clinicos especificos. Encaminhe casos urgentes ao telefone da clinica.

# Formato de resposta
Responda em mensagens curtas e objetivas, sem usar jargao tecnico complexo.`

/** Same prompt but missing the "Formato de resposta" section entirely. */
const PROMPT_MISSING_FORMAT = `# Papel
Voce e uma atendente virtual da Clinica Dental Sorriso, especializada em agendamentos odontologicos.

# Objetivo
Ajudar pacientes a tirar duvidas sobre servicos da clinica e orientar sobre os proximos passos.

# Regras de conduta
Seja cordial e direto. Sempre confirme os dados do paciente antes de encerrar o atendimento.

# Limitacoes
Nunca prometa prazos de cura ou resultados clinicos especificos. Encaminhe casos urgentes ao telefone da clinica.`

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('validatorSubAgent', () => {
  beforeEach(() => {
    validatePromptSpy.mockClear()
  })

  it('exposes the expected static metadata', () => {
    expect(validatorSubAgent.metadata).toEqual({
      name: 'validator',
      isReadOnly: true,
      isConcurrencySafe: true,
      timeoutMs: 5_000,
    })
  })

  it('happy path: well-formed prompt returns success=true with data.pass=true', async () => {
    const result = await validatorSubAgent.run(
      { prompt: WELL_FORMED_PROMPT, attachedTools: [] },
      BASE_CONTEXT,
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.pass).toBe(true)
    // No anatomy errors (warnings are allowed).
    const anatomyErrors = result.data.issues.filter(
      (i) => i.validator === 'anatomy' && i.severity === 'error',
    )
    expect(anatomyErrors).toHaveLength(0)
    expect(typeof result.durationMs).toBe('number')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('failure path: prompt missing Formato section returns data.pass=false with anatomy error', async () => {
    const result = await validatorSubAgent.run(
      { prompt: PROMPT_MISSING_FORMAT, attachedTools: [] },
      BASE_CONTEXT,
    )

    // The invocation itself succeeded — the prompt is just invalid.
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.pass).toBe(false)

    const anatomyErrors = result.data.issues.filter(
      (i) => i.validator === 'anatomy' && i.severity === 'error',
    )
    expect(anatomyErrors.length).toBeGreaterThanOrEqual(1)
    expect(typeof result.durationMs).toBe('number')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('input validation: prompt shorter than 20 chars returns INVALID_INPUT', async () => {
    const result = await validatorSubAgent.run(
      // Cast through unknown so we can exercise the runtime guard with
      // intentionally-invalid input (TS would normally reject it).
      { prompt: 'too short', attachedTools: [] } as unknown as Parameters<
        typeof validatorSubAgent.run
      >[0],
      BASE_CONTEXT,
    )

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
    expect(typeof result.durationMs).toBe('number')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    // validatePrompt must NOT have been called — we short-circuit on input error.
    expect(validatePromptSpy).not.toHaveBeenCalled()
  })

  it('cancellation: pre-aborted signal returns ABORTED without invoking validatePrompt', async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await validatorSubAgent.run(
      { prompt: WELL_FORMED_PROMPT, attachedTools: [] },
      { ...BASE_CONTEXT, signal: controller.signal },
    )

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('ABORTED')
    expect(typeof result.durationMs).toBe('number')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(validatePromptSpy).not.toHaveBeenCalled()
  })

  it('attachedTools defaults: omitting attachedTools does not throw and Zod applies default []', async () => {
    // Zod schema has `.default([])` — calling parse with attachedTools
    // omitted should succeed and produce an empty array.
    const parsed = validatorInputSchema.parse({ prompt: WELL_FORMED_PROMPT })
    expect(parsed.attachedTools).toEqual([])

    // Also exercise the sub-agent end-to-end without the field:
    const result = await validatorSubAgent.run(
      { prompt: WELL_FORMED_PROMPT } as unknown as Parameters<
        typeof validatorSubAgent.run
      >[0],
      BASE_CONTEXT,
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(typeof result.durationMs).toBe('number')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })
})
