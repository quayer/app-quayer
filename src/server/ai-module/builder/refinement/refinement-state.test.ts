import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const conversationFindFirst = vi.fn()
  const conversationUpdateMany = vi.fn()
  const projectFindFirst = vi.fn()
  const deploymentUpdateMany = vi.fn()
  const tx = {
    builderProjectConversation: {
      findFirst: conversationFindFirst,
      updateMany: conversationUpdateMany,
    },
    builderProject: {
      findFirst: projectFindFirst,
    },
    agentDeployment: {
      updateMany: deploymentUpdateMany,
    },
  }
  const transaction = vi.fn()
  return {
    conversationFindFirst,
    conversationUpdateMany,
    projectFindFirst,
    deploymentUpdateMany,
    transaction,
    tx,
  }
})

vi.mock('@/server/services/database', () => ({
  database: {
    $transaction: mocks.transaction,
  },
}))

import {
  DEFAULT_BUILDER_STATE,
  type BuilderState,
} from '../cards/builder-state'
import { invalidateProjectRefinement } from './refinement-state'

const ORG_ID = 'org-1'
const PROJECT_ID = 'project-1'
const AGENT_ID = 'agent-1'

const material = {
  promptVersionId: 'version-1',
  promptVersionNumber: 1,
  promptHash: 'prompt-hash',
  blueprintHash: 'blueprint-hash',
  contextHash: 'context-hash',
}

const passedRefinement = {
  status: 'passed',
  checks: [
    {
      checkId: 'script-quality',
      status: 'pass',
      severity: 'high',
      autoFixable: false,
    },
  ],
  blockers: [],
  material,
} satisfies NonNullable<BuilderState['refinement']>

function builderStateV2(refinement?: BuilderState['refinement']): BuilderState {
  return {
    ...DEFAULT_BUILDER_STATE,
    journeyVersion: 2,
    refinement,
  }
}

describe('invalidateProjectRefinement', () => {
  beforeEach(() => {
    mocks.conversationFindFirst.mockReset()
    mocks.conversationUpdateMany.mockReset()
    mocks.projectFindFirst.mockReset()
    mocks.deploymentUpdateMany.mockReset()
    mocks.transaction.mockReset()
    mocks.transaction.mockImplementation(
      async (
        fn: (tx: typeof mocks.tx) => Promise<unknown> | unknown,
      ): Promise<unknown> => fn(mocks.tx),
    )
  })

  it('invalidates a passed refinement and pauses active deployments', async () => {
    mocks.conversationFindFirst.mockResolvedValue({
      id: 'conversation-1',
      builderState: builderStateV2(passedRefinement),
    })
    mocks.projectFindFirst.mockResolvedValue({ aiAgentId: AGENT_ID })

    await invalidateProjectRefinement({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      reason: 'O prompt mudou.',
    })

    expect(mocks.conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: 'conversation-1', organizationId: ORG_ID },
      data: {
        builderState: expect.objectContaining({
          refinement: expect.objectContaining({
            status: 'idle',
            checks: [],
            blockers: [],
            material,
            invalidationReason: 'O prompt mudou.',
          }),
        }),
      },
    })
    expect(mocks.deploymentUpdateMany).toHaveBeenCalledWith({
      where: { agentConfigId: AGENT_ID, status: 'ACTIVE' },
      data: { status: 'PAUSED', updatedAt: expect.any(Date) },
    })
  })

  it('pauses active deployments for v2 material changes even without a prior refinement object', async () => {
    mocks.conversationFindFirst.mockResolvedValue({
      id: 'conversation-1',
      builderState: builderStateV2(),
    })
    mocks.projectFindFirst.mockResolvedValue({ aiAgentId: AGENT_ID })

    await invalidateProjectRefinement({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      reason: 'O conhecimento mudou.',
    })

    expect(mocks.conversationUpdateMany).not.toHaveBeenCalled()
    expect(mocks.deploymentUpdateMany).toHaveBeenCalledWith({
      where: { agentConfigId: AGENT_ID, status: 'ACTIVE' },
      data: { status: 'PAUSED', updatedAt: expect.any(Date) },
    })
  })

  it('does nothing for journey v1 projects', async () => {
    mocks.conversationFindFirst.mockResolvedValue({
      id: 'conversation-1',
      builderState: {
        ...DEFAULT_BUILDER_STATE,
        journeyVersion: 1,
        refinement: passedRefinement,
      },
    })

    await invalidateProjectRefinement({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      reason: 'Mudanca irrelevante para v1.',
    })

    expect(mocks.projectFindFirst).not.toHaveBeenCalled()
    expect(mocks.conversationUpdateMany).not.toHaveBeenCalled()
    expect(mocks.deploymentUpdateMany).not.toHaveBeenCalled()
  })
})
