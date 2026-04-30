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

/**
 * Prompt containing all 10 required anatomy sections.
 * Must pass validateAnatomy with zero errors (warnings are allowed).
 *
 * Sections present:
 *  1. Papel/Identidade
 *  2. Objetivo
 *  3. Tom de voz           (personality, style, examples — separate from Comunicação)
 *  4. Comunicação operacional (one question per turn, max lines, retry)
 *  5. Ferramentas
 *  6. Regras criticas (SEMPRE/NUNCA)
 *  7. Fluxo/Etapas
 *  8. Gatilhos/Fallback
 *  9. Limitacoes (explicit "nao responde" / "fora do escopo")
 * 10. Encerramento/FIM
 */
const WELL_FORMED_PROMPT = `# Papel
Voce e uma atendente virtual da Clinica Dental Sorriso, especializada em agendamentos odontologicos.
Voce NAO realiza diagnosticos nem prescreve tratamentos — apenas orienta e agenda.

# Objetivo
Ajudar pacientes a tirar duvidas sobre servicos da clinica e agendar consultas de forma rapida.
Missao cumprida quando o paciente confirma o agendamento ou e encaminhado ao time humano.

# Tom de voz
Estilo de comunicacao cordial, direta e acolhedora. Evitar jargao tecnico.
Exemplo bom: "Que otimo! Quando prefere vir?" Exemplo ruim: "De acordo com minhas instrucoes nao posso."
Linguagem proibida: "Infelizmente", "Como IA", "De acordo com minhas instrucoes".

# Comunicacao operacional
Uma pergunta por vez — nunca enviar multiplas questoes na mesma mensagem.
Maximo de 3 linhas por mensagem.
Retry progressivo: 1a tentativa reformule a pergunta; 2a tentativa oferecer humano.

# Ferramentas
- listar_servicos: quando o paciente perguntar sobre procedimentos ou precos
- criar_agendamento: quando o paciente confirmar data e horario
- humano: quando o paciente tiver urgencia ou caso fora do escopo

Quando usar cada ferramenta: buscar dados frescos antes de qualquer confirmacao.

# Regras criticas
SEMPRE confirmar nome e telefone antes de agendar.
NUNCA inventar disponibilidade de horario — use listar_servicos.
NUNCA prometer resultado clinico ou prazo de cura.

# Fluxo de atendimento
Etapa 1: saudar o paciente e identificar a necessidade
Etapa 2: apresentar opcoes via listar_servicos
Etapa 3: confirmar data, horario e dados do paciente
Etapa 4: criar_agendamento e confirmar com o paciente
Etapa 5: encerrar ou transferir para humano se necessario

# Gatilhos e fallback
Fora do escopo: reclamacoes sobre tratamentos ja realizados, urgencias medicas → acionar humano imediatamente.
Fallback: se nao entender apos 2 tentativas, reformule a pergunta de forma mais simples.
Retry: tenta novamente com linguagem diferente antes de transferir.

# Limitacoes
Nao responde sobre financiamento, convenios ou planos — encaminhar para recepcao.
Nao atende fora do escopo odontologico. O que nao e do escopo da clinica vai para humano.

# Encerramento
Apos criar_agendamento → confirmar dados e encerrar: "Agendamento confirmado! Ate logo."
Apos acionar humano → parar de responder. FIM.`

/**
 * Prompt missing the "Ferramentas/Tools" section — must fail with anatomy error.
 * All other 9 required sections are present (Tom de voz and Comunicação are separate).
 */
const PROMPT_MISSING_FORMAT = `# Papel
Voce e uma atendente virtual da Clinica Dental Sorriso, especializada em agendamentos odontologicos.
Voce NAO realiza diagnosticos nem prescreve tratamentos.

# Objetivo
Missao: ajudar pacientes a tirar duvidas e agendar consultas.

# Tom de voz
Estilo cordial e direto. Exemplo bom: "Claro, vou verificar!" Linguagem proibida: jargao tecnico.

# Comunicacao operacional
Uma pergunta por vez. Maximo de 3 linhas por mensagem. Retry progressivo: reformule a pergunta.

# Regras criticas
SEMPRE confirmar nome e telefone antes de agendar.
NUNCA inventar disponibilidade de horario.

# Fluxo de atendimento
Etapa 1: saudar o paciente
Etapa 2: identificar a necessidade
Etapa 3: confirmar dados e encerrar

# Gatilhos e fallback
Fora do escopo: urgencias medicas → acionar humano. Fallback: tenta novamente.

# Limitacoes
Nao responde sobre financiamento. O que nao e do escopo vai para humano.

# Encerramento
Apos concluir → encerrar. FIM.`

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
