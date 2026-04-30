/**
 * Tests for deployRunnerSubAgent.
 *
 * The DB accessor, the validator, and the deploy saga are all mocked so
 * the unit tests stay hermetic. Covers:
 *   - Pre-check blockers (every variant + accumulation)
 *   - Happy-path mapping from saga success → status:'deployed'
 *   - Saga failure mapping → status:'rolled_back' (retryable + non-retryable)
 *   - Zod input validation and missing-project handling
 *   - Timing envelope on every path
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SubAgentContext } from '../types'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockBuilderProjectFindUnique = vi.hoisted(() => vi.fn())
const mockBuilderPromptVersionFindFirst = vi.hoisted(() => vi.fn())
const mockWhatsAppInstanceFindFirst = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => ({
  database: {
    builderProject: {
      findUnique: mockBuilderProjectFindUnique,
    },
    builderPromptVersion: {
      findFirst: mockBuilderPromptVersionFindFirst,
    },
    whatsAppInstance: {
      findFirst: mockWhatsAppInstanceFindFirst,
    },
  },
  getDatabase: () => ({}),
}))

const mockValidatePrompt = vi.hoisted(() => vi.fn())
vi.mock('../../validators', () => ({
  validatePrompt: mockValidatePrompt,
}))

const mockExecuteDeployFlow = vi.hoisted(() => vi.fn())
vi.mock('../../deploy/deploy-flow.orchestrator', () => ({
  executeDeployFlow: mockExecuteDeployFlow,
}))

// Imported AFTER vi.mock so the mocked modules take effect.
import { deployRunnerSubAgent } from './deploy-runner.sub-agent'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// cuid() accepts strings starting with 'c' and length >= 25 of lowercase/digits.
const VALID_PROJECT_ID = 'cjld2cjxh0000qzrmn831i7rn'
const VALID_PROMPT_VERSION_ID = 'cjld2cyuq0000t3rmniod1foy'

const BASE_CONTEXT: SubAgentContext = {
  organizationId: 'org-test',
  userId: 'user-test',
  projectId: VALID_PROJECT_ID,
}

const LONG_PROMPT =
  'Você é um assistente virtual que atende clientes com cordialidade e objetividade em conversas sobre agendamento.'

function passingValidation() {
  return { pass: true, issues: [] }
}

function failingValidation(message = 'Seção Formato ausente') {
  return {
    pass: false,
    issues: [
      {
        validator: 'anatomy' as const,
        severity: 'error' as const,
        message,
      },
    ],
  }
}

function baseProjectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_PROJECT_ID,
    organizationId: 'org-test',
    aiAgentId: 'agent-1',
    aiAgent: {
      systemPrompt: LONG_PROMPT,
      enabledTools: [],
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockValidatePrompt.mockReturnValue(passingValidation())
  mockBuilderPromptVersionFindFirst.mockResolvedValue({ id: VALID_PROMPT_VERSION_ID })
  mockWhatsAppInstanceFindFirst.mockResolvedValue({ id: 'wa-1' })
})

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('deployRunnerSubAgent', () => {
  it('exposes the expected static metadata', () => {
    expect(deployRunnerSubAgent.metadata).toEqual({
      name: 'deploy-runner',
      isReadOnly: false,
      isConcurrencySafe: false,
      timeoutMs: 180_000,
    })
  })

  // 1. Blocked — no agent
  it('blocks with check=agent when project has no aiAgentId', async () => {
    mockBuilderProjectFindUnique.mockResolvedValue(
      baseProjectRow({ aiAgentId: null, aiAgent: null }),
    )

    const result = await deployRunnerSubAgent.run(
      { projectId: VALID_PROJECT_ID, promptVersionId: VALID_PROMPT_VERSION_ID },
      BASE_CONTEXT,
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('blocked')
    if (result.data.status !== 'blocked') return
    expect(result.data.blockers[0]?.check).toBe('agent')
    expect(mockExecuteDeployFlow).not.toHaveBeenCalled()
    expect(typeof result.durationMs).toBe('number')
  })

  // 2. Blocked — no prompt
  it('blocks with check=prompt when the agent prompt is missing', async () => {
    mockBuilderProjectFindUnique.mockResolvedValue(
      baseProjectRow({
        aiAgent: { systemPrompt: '', enabledTools: [] },
      }),
    )

    const result = await deployRunnerSubAgent.run(
      { projectId: VALID_PROJECT_ID, promptVersionId: VALID_PROMPT_VERSION_ID },
      BASE_CONTEXT,
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    if (result.data.status !== 'blocked') throw new Error('expected blocked')
    expect(result.data.blockers[0]?.check).toBe('prompt')
    expect(mockExecuteDeployFlow).not.toHaveBeenCalled()
  })

  // 3. Blocked — prompt fails validator
  it('blocks with check=prompt when validatePrompt fails', async () => {
    mockBuilderProjectFindUnique.mockResolvedValue(baseProjectRow())
    mockValidatePrompt.mockReturnValue(
      failingValidation('Seção Formato ausente'),
    )

    const result = await deployRunnerSubAgent.run(
      { projectId: VALID_PROJECT_ID, promptVersionId: VALID_PROMPT_VERSION_ID },
      BASE_CONTEXT,
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    if (result.data.status !== 'blocked') throw new Error('expected blocked')
    const promptBlockers = result.data.blockers.filter(
      (b) => b.check === 'prompt',
    )
    expect(promptBlockers.length).toBeGreaterThanOrEqual(1)
    expect(promptBlockers[0]?.message).toContain('Seção Formato ausente')
    expect(mockExecuteDeployFlow).not.toHaveBeenCalled()
  })

  // 4. Blocked — collects ALL blockers (prompt short + no version + no channel)
  it('collects every blocker (prompt short + no version + no channel) without short-circuiting', async () => {
    mockBuilderProjectFindUnique.mockResolvedValue(
      baseProjectRow({
        aiAgent: { systemPrompt: 'muito curto', enabledTools: [] },
      }),
    )
    mockBuilderPromptVersionFindFirst.mockResolvedValue(null)
    mockWhatsAppInstanceFindFirst.mockResolvedValue(null)

    const result = await deployRunnerSubAgent.run(
      { projectId: VALID_PROJECT_ID, promptVersionId: VALID_PROMPT_VERSION_ID },
      BASE_CONTEXT,
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    if (result.data.status !== 'blocked') throw new Error('expected blocked')
    expect(result.data.blockers).toHaveLength(3)
    const checks = result.data.blockers.map((b) => b.check).sort()
    expect(checks).toEqual(['channel', 'prompt', 'version'])
    expect(mockExecuteDeployFlow).not.toHaveBeenCalled()
  })

  // 5. Happy path
  it('returns status=deployed when all checks pass and the saga succeeds', async () => {
    mockBuilderProjectFindUnique.mockResolvedValue(baseProjectRow())
    mockExecuteDeployFlow.mockResolvedValue({
      deploymentId: 'dep-1',
      status: 'live',
      projectId: VALID_PROJECT_ID,
      promptVersionId: VALID_PROMPT_VERSION_ID,
      instanceId: 'inst-42',
      connectionId: 'conn-7',
      startedAt: new Date(),
      completedAt: new Date(),
    })

    const result = await deployRunnerSubAgent.run(
      { projectId: VALID_PROJECT_ID, promptVersionId: VALID_PROMPT_VERSION_ID },
      BASE_CONTEXT,
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    if (result.data.status !== 'deployed') throw new Error('expected deployed')
    expect(result.data.deploymentId).toBe('dep-1')
    expect(result.data.instanceId).toBe('inst-42')
    expect(mockExecuteDeployFlow).toHaveBeenCalledWith({
      projectId: VALID_PROJECT_ID,
      promptVersionId: VALID_PROMPT_VERSION_ID,
      userId: 'user-test',
    })
    expect(typeof result.durationMs).toBe('number')
  })

  // 6. Rolled back — retryable (timeout at step 2)
  it('maps saga timeout at step 2 to rolled_back with retryable=true', async () => {
    mockBuilderProjectFindUnique.mockResolvedValue(baseProjectRow())
    mockExecuteDeployFlow.mockRejectedValue(
      new Error(
        "Deploy falhou em 'create_instance': upstream ETIMEDOUT contacting uazapi",
      ),
    )

    const result = await deployRunnerSubAgent.run(
      { projectId: VALID_PROJECT_ID, promptVersionId: VALID_PROMPT_VERSION_ID },
      BASE_CONTEXT,
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    if (result.data.status !== 'rolled_back') {
      throw new Error('expected rolled_back')
    }
    expect(result.data.failedStep).toBe('createDeployInstance')
    expect(result.data.retryable).toBe(true)
    expect(result.data.error).toContain('ETIMEDOUT')
  })

  // 7. Rolled back — non-retryable (programmatic error)
  it('maps programmatic saga failure to rolled_back with retryable=false', async () => {
    mockBuilderProjectFindUnique.mockResolvedValue(baseProjectRow())
    mockExecuteDeployFlow.mockRejectedValue(
      new Error(
        "Deploy falhou em 'attach_connection': Connection not found for organization",
      ),
    )

    const result = await deployRunnerSubAgent.run(
      { projectId: VALID_PROJECT_ID, promptVersionId: VALID_PROMPT_VERSION_ID },
      BASE_CONTEXT,
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    if (result.data.status !== 'rolled_back') {
      throw new Error('expected rolled_back')
    }
    expect(result.data.failedStep).toBe('attachConnection')
    expect(result.data.retryable).toBe(false)
  })

  // 8. Project not found
  it('returns success=false with code=INVALID_INPUT when project does not exist', async () => {
    mockBuilderProjectFindUnique.mockResolvedValue(null)

    const result = await deployRunnerSubAgent.run(
      { projectId: VALID_PROJECT_ID, promptVersionId: VALID_PROMPT_VERSION_ID },
      BASE_CONTEXT,
    )

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
    expect(mockExecuteDeployFlow).not.toHaveBeenCalled()
    expect(typeof result.durationMs).toBe('number')
  })

  // 9. Input schema — non-cuid projectId
  it('returns INVALID_INPUT for non-cuid projectId', async () => {
    const result = await deployRunnerSubAgent.run(
      // Intentionally malformed input — cast through unknown.
      {
        projectId: 'not-a-cuid',
        promptVersionId: VALID_PROMPT_VERSION_ID,
      } as unknown as Parameters<typeof deployRunnerSubAgent.run>[0],
      BASE_CONTEXT,
    )

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
    expect(mockBuilderProjectFindUnique).not.toHaveBeenCalled()
    expect(mockExecuteDeployFlow).not.toHaveBeenCalled()
  })

  // 10. Timing — durationMs present on every path
  it('populates durationMs on every outcome (blocked / deployed / rolled_back / invalid)', async () => {
    // deployed
    mockBuilderProjectFindUnique.mockResolvedValue(baseProjectRow())
    mockExecuteDeployFlow.mockResolvedValue({
      deploymentId: null,
      status: 'live',
      projectId: VALID_PROJECT_ID,
      promptVersionId: VALID_PROMPT_VERSION_ID,
      instanceId: null,
      startedAt: new Date(),
    })
    const deployed = await deployRunnerSubAgent.run(
      { projectId: VALID_PROJECT_ID, promptVersionId: VALID_PROMPT_VERSION_ID },
      BASE_CONTEXT,
    )
    expect(typeof deployed.durationMs).toBe('number')

    // blocked
    mockBuilderProjectFindUnique.mockResolvedValueOnce(
      baseProjectRow({ aiAgentId: null, aiAgent: null }),
    )
    const blocked = await deployRunnerSubAgent.run(
      { projectId: VALID_PROJECT_ID, promptVersionId: VALID_PROMPT_VERSION_ID },
      BASE_CONTEXT,
    )
    expect(typeof blocked.durationMs).toBe('number')

    // rolled_back
    mockBuilderProjectFindUnique.mockResolvedValueOnce(baseProjectRow())
    mockExecuteDeployFlow.mockRejectedValueOnce(
      new Error("Deploy falhou em 'publish_version': boom"),
    )
    const rolledBack = await deployRunnerSubAgent.run(
      { projectId: VALID_PROJECT_ID, promptVersionId: VALID_PROMPT_VERSION_ID },
      BASE_CONTEXT,
    )
    expect(typeof rolledBack.durationMs).toBe('number')

    // invalid input
    const invalid = await deployRunnerSubAgent.run(
      {
        projectId: 'nope',
        promptVersionId: VALID_PROMPT_VERSION_ID,
      } as unknown as Parameters<typeof deployRunnerSubAgent.run>[0],
      BASE_CONTEXT,
    )
    expect(typeof invalid.durationMs).toBe('number')
  })
})
