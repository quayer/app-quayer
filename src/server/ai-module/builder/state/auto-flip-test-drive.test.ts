/**
 * T69 (jornada-builder-v2, Onda 5) — unit do helper `autoFlipTestDrive`.
 *
 * O helper é o ÚNICO ponto compartilhado pelos dois caminhos que destravam o passo
 * Testar sem card obrigatório: o stream stateless da tab Testar
 * (`processPlaygroundStream`, resolve pelo `agentConfigId`) e a tool de teste do
 * meta-agente (`run_playground_test`, resolve pelo `projectId`). A estratégia espelha
 * `cards/handlers/apply/journey-v2.test.ts`: mock de `@/server/services/database`
 * (sem DB real) com um `$transaction` que invoca o callback IMEDIATAMENTE com um `tx`
 * cujos métodos são os mesmos mocks hoisted; `trackJourneyEvent` é mockado à parte.
 *
 * Cobre (critério da tarefa T69):
 *   - 1º turno bem-sucedido flipa `confirmations.testDrive` + emite `test_done` com a
 *     journeyVersion CONGELADA do estado lido;
 *   - 2º turno (sentinel já true) é NO-OP: nem write nem re-emissão do evento;
 *   - FAIL-OPEN total: erro de DB em QUALQUER ponto NUNCA lança (não quebra o stream);
 *   - resolve a conversa pelos DOIS alvos (`agentConfigId` via project.aiAgentId /
 *     `projectId` direto), sempre org-scoped;
 *   - conversa inexistente → no-op silencioso (sem write/evento).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks (registrados antes de qualquer import que os toque)
// ---------------------------------------------------------------------------

const mockConvFindFirst = vi.hoisted(() => vi.fn())
const mockConvUpdateMany = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
const mockTrackJourneyEvent = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => {
  const tx = {
    builderProjectConversation: {
      findFirst: mockConvFindFirst,
      updateMany: mockConvUpdateMany,
    },
  }
  return {
    database: {
      ...tx,
      $transaction: mockTransaction.mockImplementation(
        async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    },
  }
})

vi.mock('@/server/services/journey-events', () => ({
  trackJourneyEvent: mockTrackJourneyEvent,
}))

// ---------------------------------------------------------------------------
// Imports após o registro dos mocks
// ---------------------------------------------------------------------------

import { autoFlipTestDrive } from './auto-flip-test-drive'
import {
  parseBuilderState,
  patchBuilderState,
  type BuilderState,
} from '../cards/builder-state'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONV_ID = 'conv-1'
const PROJECT_ID = 'proj-1'
const ORG_ID = 'org-1'
const AGENT_ID = 'agent-1'

/** State v2 com o sentinel `testDrive` ainda false (1º turno). */
function v2StateUntested(): BuilderState {
  return patchBuilderState(parseBuilderState(undefined), { journeyVersion: 2 })
}

/** State v2 com `testDrive` JÁ true (2º turno em diante). */
function v2StateTested(): BuilderState {
  return patchBuilderState(parseBuilderState(undefined), {
    journeyVersion: 2,
    confirmations: { testDrive: true },
  })
}

/**
 * Arma o caminho feliz: o 1º findFirst resolve a POSSE da conversa (resolução do
 * alvo, fora da tx) e o 2º findFirst (dentro da tx) devolve o estado fresco.
 */
function armResolveThenState(state: BuilderState) {
  mockConvFindFirst
    .mockResolvedValueOnce({ id: CONV_ID, projectId: PROJECT_ID })
    .mockResolvedValueOnce({ builderState: state })
}

/** O builderState gravado no (único) updateMany da conversa. */
function writtenConvState(): BuilderState {
  expect(mockConvUpdateMany).toHaveBeenCalledOnce()
  const call = mockConvUpdateMany.mock.calls[0]![0] as {
    where: { id: string; organizationId: string }
    data: { builderState: BuilderState }
  }
  return call.data.builderState
}

describe('autoFlipTestDrive — T69 (FR-16/T33)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConvUpdateMany.mockResolvedValue({ count: 1 })
    // $transaction re-arma o impl (clearAllMocks limpa a implementação).
    mockTransaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) =>
        fn({
          builderProjectConversation: {
            findFirst: mockConvFindFirst,
            updateMany: mockConvUpdateMany,
          },
        }),
    )
    mockTrackJourneyEvent.mockResolvedValue(undefined)
  })

  // -------------------------------------------------------------------------
  // 1º turno — flipa o sentinel + emite test_done (journeyVersion congelada)
  // -------------------------------------------------------------------------
  it('1º turno: flipa confirmations.testDrive e emite test_done', async () => {
    armResolveThenState(v2StateUntested())

    await autoFlipTestDrive({ projectId: PROJECT_ID, organizationId: ORG_ID })

    const next = writtenConvState()
    expect(next.confirmations.testDrive).toBe(true)

    expect(mockTrackJourneyEvent).toHaveBeenCalledOnce()
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      journeyVersion: 2,
      event: 'test_done',
    })
  })

  it('emite o evento com a journeyVersion CONGELADA do estado lido (não hardcoded)', async () => {
    // Estado legado marcado como v1 — o evento deve carregar a versão lida, não um 2.
    armResolveThenState(
      patchBuilderState(parseBuilderState(undefined), { journeyVersion: 1 }),
    )

    await autoFlipTestDrive({ projectId: PROJECT_ID, organizationId: ORG_ID })

    expect(mockTrackJourneyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ journeyVersion: 1, event: 'test_done' }),
    )
  })

  // -------------------------------------------------------------------------
  // 2º turno — no-op (sentinel já true): nem write nem re-emissão
  // -------------------------------------------------------------------------
  it('2º turno (testDrive já true): NÃO re-grava o estado nem re-emite o evento', async () => {
    armResolveThenState(v2StateTested())

    await autoFlipTestDrive({ projectId: PROJECT_ID, organizationId: ORG_ID })

    // O read in-tx curto-circuita ANTES do write quando o sentinel já é true.
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
    expect(mockTrackJourneyEvent).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Resolução dos dois alvos — org-scoped
  // -------------------------------------------------------------------------
  it('alvo projectId: resolve a conversa pelo projectId, org-scoped', async () => {
    armResolveThenState(v2StateUntested())

    await autoFlipTestDrive({ projectId: PROJECT_ID, organizationId: ORG_ID })

    expect(mockConvFindFirst).toHaveBeenNthCalledWith(1, {
      where: { projectId: PROJECT_ID, organizationId: ORG_ID },
      select: { id: true, projectId: true },
    })
  })

  it('alvo agentConfigId: resolve a conversa via project.aiAgentId, org-scoped', async () => {
    armResolveThenState(v2StateUntested())

    await autoFlipTestDrive({ agentConfigId: AGENT_ID, organizationId: ORG_ID })

    expect(mockConvFindFirst).toHaveBeenNthCalledWith(1, {
      where: { organizationId: ORG_ID, project: { aiAgentId: AGENT_ID } },
      select: { id: true, projectId: true },
    })
  })

  it('write atômico do flip é sempre org-scoped', async () => {
    armResolveThenState(v2StateUntested())

    await autoFlipTestDrive({ projectId: PROJECT_ID, organizationId: ORG_ID })

    const call = mockConvUpdateMany.mock.calls[0]![0] as {
      where: { id: string; organizationId: string }
    }
    expect(call.where).toEqual({ id: CONV_ID, organizationId: ORG_ID })
  })

  // -------------------------------------------------------------------------
  // Conversa inexistente — no-op silencioso
  // -------------------------------------------------------------------------
  it('conversa inexistente (resolução vazia): no-op, sem write nem evento', async () => {
    mockConvFindFirst.mockResolvedValueOnce(null)

    await autoFlipTestDrive({ projectId: PROJECT_ID, organizationId: ORG_ID })

    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
    expect(mockTrackJourneyEvent).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // FAIL-OPEN total — erro de DB NUNCA propaga (não quebra o stream)
  // -------------------------------------------------------------------------
  it('fail-open: erro na resolução da conversa NÃO lança (não quebra o stream)', async () => {
    mockConvFindFirst.mockRejectedValueOnce(new Error('DB down'))

    await expect(
      autoFlipTestDrive({ projectId: PROJECT_ID, organizationId: ORG_ID }),
    ).resolves.toBeUndefined()

    expect(mockConvUpdateMany).not.toHaveBeenCalled()
    expect(mockTrackJourneyEvent).not.toHaveBeenCalled()
  })

  it('fail-open: erro na transação do flip NÃO lança', async () => {
    mockConvFindFirst.mockResolvedValueOnce({ id: CONV_ID, projectId: PROJECT_ID })
    mockTransaction.mockRejectedValueOnce(new Error('write failed'))

    await expect(
      autoFlipTestDrive({ projectId: PROJECT_ID, organizationId: ORG_ID }),
    ).resolves.toBeUndefined()

    expect(mockTrackJourneyEvent).not.toHaveBeenCalled()
  })

  it('fail-open: o write persistiu mas o evento de funil falhou → ainda NÃO lança', async () => {
    armResolveThenState(v2StateUntested())
    mockTrackJourneyEvent.mockRejectedValueOnce(new Error('telemetry down'))

    await expect(
      autoFlipTestDrive({ projectId: PROJECT_ID, organizationId: ORG_ID }),
    ).resolves.toBeUndefined()

    // O flip chegou a persistir antes da telemetria falhar.
    expect(mockConvUpdateMany).toHaveBeenCalledOnce()
  })
})
