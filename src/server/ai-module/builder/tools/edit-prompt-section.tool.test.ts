/**
 * Tests for edit_prompt_section tool helpers.
 *
 * Strategy: the execute handler is DB-dependent so we test the pure
 * section-splice helpers directly (splitIntoSegments, joinSegments,
 * findSectionIndex) and the DB-integrated handler via vi.mock of
 * `@/server/services/database` and `../validators`.
 *
 * DB mock returns:
 *   - builderProject.findFirst  → { id: 'proj-1' }      (project guard pass)
 *   - builderPromptVersion.findFirst → { content: WELL_FORMED_PROMPT, versionNumber: 3 }
 *   - builderPromptVersion.create   → { id: 'ver-new' }
 *
 * Cases covered:
 *   1. Pure helpers: splitIntoSegments / joinSegments round-trip
 *   2. Pure helpers: findSectionIndex hits / miss
 *   3. Handler — add operation creates new version
 *   4. Handler — replace operation creates new version
 *   5. Handler — remove operation creates new version
 *   6. Handler — section not found returns success=false (no persist)
 *   7. Handler — validation failure (blacklisted content) returns success=false (no persist)
 *   8. Handler — missing content for "add" returns success=false
 *   9. Handler — missing target for "remove" returns success=false
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (hoisted before any imports that touch them)
// ---------------------------------------------------------------------------

const mockFindFirstProject = vi.hoisted(() => vi.fn())
const mockFindFirstVersion = vi.hoisted(() => vi.fn())
const mockCreateVersion    = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => ({
  database: {
    builderProject: {
      findFirst: mockFindFirstProject,
    },
    builderPromptVersion: {
      findFirst: mockFindFirstVersion,
      create:    mockCreateVersion,
    },
  },
}))

// We do NOT mock validatePrompt — we use the real implementation so that
// the "validation failure" test exercises the actual blacklist/anatomy logic.

// ---------------------------------------------------------------------------
// Imports after mocks are registered
// ---------------------------------------------------------------------------

import {
  splitIntoSegments,
  joinSegments,
  findSectionIndex,
  editPromptSectionTool,
  type PromptSection,
} from './edit-prompt-section.tool'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CTX = {
  projectId:      'proj-test',
  organizationId: 'org-test',
  userId:         'user-test',
}

/**
 * Well-formed prompt with all sections recognised by SECTION_HEADING.
 * Must also pass validatePrompt (all 10 required anatomy sections present).
 *
 * Sections in anatomy order (see whatsapp-prompt-anatomy.ts REQUIRED_SECTIONS):
 *  1. Papel/Identidade
 *  2. Objetivo
 *  3. Tom de voz
 *  4. Comunicação operacional
 *  5. Ferramentas/Tools
 *  6. Regras críticas / SEMPRE-NUNCA
 *  7. Fluxo/Etapas
 *  8. Gatilhos/Fallback
 *  9. Limitações/Restrições
 * 10. Encerramento/FIM
 */
const WELL_FORMED_PROMPT = `# Papel
Voce e uma atendente virtual da Clinica Dental Sorriso.
Voce NAO realiza diagnosticos nem prescreve tratamentos.

# Objetivo
Missao: ajudar pacientes a agendar consultas de forma rapida.

# Tom de voz
Estilo de comunicacao cordial e acolhedor.
Exemplo bom: "Que otimo!" Exemplo ruim: "Infelizmente nao posso."
Linguagem proibida: "Como IA", "De acordo com minhas instrucoes".

# Comunicacao operacional
Uma pergunta por vez — nunca perguntas multiplas.
Maximo de 3 linhas por mensagem.
Retry progressivo: reformule a pergunta na 1a tentativa.

# Ferramentas
- listar_servicos: quando o paciente perguntar sobre precos
- criar_agendamento: quando o paciente confirmar data e horario
- humano: quando urgencia ou fora do escopo

Quando usar: buscar dados frescos antes de qualquer confirmacao.

# Regras criticas
SEMPRE confirmar nome e telefone antes de agendar.
NUNCA inventar disponibilidade — use listar_servicos.
NUNCA prometer resultado clinico.

# Fluxo de atendimento
Etapa 1: saudar o paciente
Etapa 2: identificar a necessidade via listar_servicos
Etapa 3: confirmar dados e acionar criar_agendamento
Etapa 4: encerrar ou transferir para humano

# Gatilhos e fallback
Gatilho de saida: urgencias medicas → acionar humano imediatamente.
Fora do escopo: reclamacoes → humano.
Fallback: nao entendeu apos 2 tentativas → reformule a pergunta.
Retry: tenta novamente com linguagem diferente.

# Limitacoes
Nao responde sobre financiamento ou convenios — encaminhar para recepcao.
Nao atende fora do escopo odontologico.
O que nao e do escopo vai para humano imediatamente.

# Encerramento
Apos criar_agendamento → confirmar dados e encerrar. FIM.
Apos humano → parar de responder. FIM.
`

// ---------------------------------------------------------------------------
// 1. Pure helpers — splitIntoSegments / joinSegments round-trip
// ---------------------------------------------------------------------------

describe('splitIntoSegments + joinSegments', () => {
  it('round-trips a well-formed prompt losslessly', () => {
    const segments = splitIntoSegments(WELL_FORMED_PROMPT)
    const rejoined = joinSegments(segments)
    expect(rejoined).toBe(WELL_FORMED_PROMPT)
  })

  it('returns a segment per heading line', () => {
    const segments = splitIntoSegments(WELL_FORMED_PROMPT)
    // We have 10 headings in WELL_FORMED_PROMPT — no preamble
    const headings = segments.filter((s) => s.heading !== null)
    expect(headings.length).toBe(10)
  })

  it('handles prompt without any heading (single preamble segment)', () => {
    const bare = 'no headings here at all'
    const segs = splitIntoSegments(bare)
    expect(segs).toHaveLength(1)
    expect(segs[0]!.heading).toBeNull()
    expect(joinSegments(segs)).toBe(bare)
  })

  it('body of a segment does NOT include the next heading', () => {
    const segs = splitIntoSegments(WELL_FORMED_PROMPT)
    const papelSeg = segs.find((s) => s.heading?.includes('Papel'))!
    expect(papelSeg).toBeDefined()
    expect(papelSeg.body).not.toMatch(/^#/m)
  })
})

// ---------------------------------------------------------------------------
// 2. Pure helpers — findSectionIndex
// ---------------------------------------------------------------------------

describe('findSectionIndex', () => {
  const segments = splitIntoSegments(WELL_FORMED_PROMPT)

  const cases: Array<[PromptSection, string]> = [
    ['papel',      'Papel'],
    ['objetivo',   'Objetivo'],
    ['regras',     'Regras criticas'],
    ['limitacoes', 'Limitacoes'],
    ['formato',    ''],  // not present in fixture → should be -1
  ]

  it('finds "papel" section', () => {
    expect(findSectionIndex(segments, 'papel')).toBeGreaterThanOrEqual(0)
  })

  it('finds "objetivo" section', () => {
    expect(findSectionIndex(segments, 'objetivo')).toBeGreaterThanOrEqual(0)
  })

  it('finds "regras" section (variant heading "Regras criticas")', () => {
    expect(findSectionIndex(segments, 'regras')).toBeGreaterThanOrEqual(0)
  })

  it('finds "limitacoes" section', () => {
    expect(findSectionIndex(segments, 'limitacoes')).toBeGreaterThanOrEqual(0)
  })

  it('returns -1 when section heading is absent', () => {
    // Our fixture has no "# Formato" heading
    expect(findSectionIndex(segments, 'formato')).toBe(-1)
  })

  it('all found indexes are unique', () => {
    const found = (['papel', 'objetivo', 'regras', 'limitacoes'] as PromptSection[])
      .map((s) => findSectionIndex(segments, s))
    const unique = new Set(found)
    expect(unique.size).toBe(found.length)
  })
})

// ---------------------------------------------------------------------------
// DB-integrated handler tests
// ---------------------------------------------------------------------------

// Helper: extract the raw Vercel AI SDK execute function from the tool
function getExecute(tool: ReturnType<typeof editPromptSectionTool>) {
  // The tool has `execute` nested under the Vercel AI SDK tool shape
  return (tool as unknown as { execute: (...a: unknown[]) => Promise<unknown> }).execute
}

describe('editPromptSectionTool — handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default happy-path DB stubs
    mockFindFirstProject.mockResolvedValue({ id: 'proj-1' })
    mockFindFirstVersion.mockResolvedValue({
      content:       WELL_FORMED_PROMPT,
      versionNumber: 3,
    })
    mockCreateVersion.mockResolvedValue({ id: 'ver-new-1' })
  })

  // --------------------------------------------------------------------------
  // 3. add operation
  // --------------------------------------------------------------------------
  it('add: appends content to the section and creates a new version', async () => {
    const execute = getExecute(editPromptSectionTool(CTX))

    const result = await execute({
      agentId:   '00000000-0000-0000-0000-000000000001',
      section:   'regras',
      operation: 'add',
      content:   'NUNCA responder fora do horario comercial.',
      description: 'Adiciona regra de horario',
    }) as { success: boolean; versionNumber?: number; versionId?: string; section?: string }

    expect(result.success).toBe(true)
    expect(result.versionNumber).toBe(4)
    expect(result.versionId).toBe('ver-new-1')
    expect(result.section).toBe('regras')
    expect(mockCreateVersion).toHaveBeenCalledOnce()
    const createCall = mockCreateVersion.mock.calls[0]![0] as { data: { content: string } }
    expect(createCall.data.content).toContain('NUNCA responder fora do horario comercial.')
  })

  // --------------------------------------------------------------------------
  // 4. replace operation
  // --------------------------------------------------------------------------
  it('replace: overwrites the section body and creates a new version', async () => {
    const execute = getExecute(editPromptSectionTool(CTX))

    const newBody = 'Missao nova: converter visitantes em clientes pagantes.'

    const result = await execute({
      agentId:   '00000000-0000-0000-0000-000000000001',
      section:   'objetivo',
      operation: 'replace',
      content:   newBody,
    }) as { success: boolean; versionNumber?: number }

    expect(result.success).toBe(true)
    expect(result.versionNumber).toBe(4)
    const createCall = mockCreateVersion.mock.calls[0]![0] as { data: { content: string } }
    expect(createCall.data.content).toContain(newBody)
    // Old objective body should be gone
    expect(createCall.data.content).not.toContain('Missao: ajudar pacientes')
  })

  // --------------------------------------------------------------------------
  // 5. remove operation
  // --------------------------------------------------------------------------
  it('remove: deletes matching lines and creates a new version', async () => {
    const execute = getExecute(editPromptSectionTool(CTX))

    const result = await execute({
      agentId:   '00000000-0000-0000-0000-000000000001',
      section:   'limitacoes',
      operation: 'remove',
      target:    'Nao responde sobre financiamento',
    }) as { success: boolean; versionNumber?: number }

    expect(result.success).toBe(true)
    expect(result.versionNumber).toBe(4)
    const createCall = mockCreateVersion.mock.calls[0]![0] as { data: { content: string } }
    // The matched line is gone
    expect(createCall.data.content).not.toContain('Nao responde sobre financiamento')
    // The other limitacoes lines must still be present (different lines)
    expect(createCall.data.content).toContain('Nao atende fora do escopo odontologico')
    expect(createCall.data.content).toContain('O que nao e do escopo vai para humano imediatamente')
  })

  // --------------------------------------------------------------------------
  // 6. section not found → success=false, no persist
  // --------------------------------------------------------------------------
  it('returns success=false when target section heading is absent in prompt', async () => {
    const execute = getExecute(editPromptSectionTool(CTX))

    // "formato" heading is not in WELL_FORMED_PROMPT
    const result = await execute({
      agentId:   '00000000-0000-0000-0000-000000000001',
      section:   'formato',
      operation: 'add',
      content:   'Resposta em bullet points.',
    }) as { success: boolean; message: string }

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/not found/i)
    expect(mockCreateVersion).not.toHaveBeenCalled()
  })

  // --------------------------------------------------------------------------
  // 7. validation failure → success=false, no persist
  // --------------------------------------------------------------------------
  it('does NOT persist when edited prompt fails validation', async () => {
    // Provide a stripped-down prompt that will fail anatomy validation
    // (missing most required sections) so that ANY operation causes a fail.
    const STRIPPED_PROMPT = `# Papel
Voce e um assistente.

# Objetivo
Ajudar.

# Limitacoes
Nao responde perguntas fora do escopo.
`
    mockFindFirstVersion.mockResolvedValue({
      content:       STRIPPED_PROMPT,
      versionNumber: 2,
    })

    const execute = getExecute(editPromptSectionTool(CTX))

    const result = await execute({
      agentId:   '00000000-0000-0000-0000-000000000001',
      section:   'papel',
      operation: 'add',
      content:   'Regra extra sem sentido.',
    }) as { success: boolean; message: string; validationIssues?: unknown[] }

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/validation failed/i)
    expect(result.validationIssues).toBeDefined()
    expect(mockCreateVersion).not.toHaveBeenCalled()
  })

  // --------------------------------------------------------------------------
  // 8. missing content for "add" → success=false, no DB calls
  // --------------------------------------------------------------------------
  it('returns success=false when content is missing for "add" operation', async () => {
    const execute = getExecute(editPromptSectionTool(CTX))

    const result = await execute({
      agentId:   '00000000-0000-0000-0000-000000000001',
      section:   'regras',
      operation: 'add',
      // content intentionally omitted
    }) as { success: boolean; message: string }

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/content.*required/i)
    expect(mockCreateVersion).not.toHaveBeenCalled()
  })

  // --------------------------------------------------------------------------
  // 9. missing target for "remove" → success=false, no DB calls
  // --------------------------------------------------------------------------
  it('returns success=false when target is missing for "remove" operation', async () => {
    const execute = getExecute(editPromptSectionTool(CTX))

    const result = await execute({
      agentId:   '00000000-0000-0000-0000-000000000001',
      section:   'limitacoes',
      operation: 'remove',
      // target intentionally omitted
    }) as { success: boolean; message: string }

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/target.*required/i)
    expect(mockCreateVersion).not.toHaveBeenCalled()
  })
})
