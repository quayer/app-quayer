/**
 * deploy-flow.orchestrator — test skeleton.
 *
 * Covers the happy path plus 3 failure-with-rollback paths. Use Vitest mocks
 * for Prisma + external services (uazapi) when filling these in — the saga
 * is pure TypeScript so full DB isn't required for unit coverage.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest'

const databaseMock = vi.hoisted(() => ({
  builderProject: {
    findUnique: vi.fn(),
  },
  builderProjectConversation: {
    findFirst: vi.fn(),
  },
  builderDeployment: {
    create: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/server/services/database', () => ({
  database: databaseMock,
  getDatabase: () => databaseMock,
}))

vi.mock('@/server/services/journey-events', () => ({
  trackJourneyEvent: vi.fn(),
}))

vi.mock('../sources/builder-state-db', () => ({
  readBuilderStateByProject: vi.fn(),
}))

vi.mock('./publish-version.handler', () => ({
  publishVersion: vi.fn(),
  unpublishVersion: vi.fn(),
}))

vi.mock('./materialize-pricing.handler', () => ({
  materializePricing: vi.fn(),
  compensateMaterializePricing: vi.fn(),
}))

vi.mock('./materialize-team.handler', () => ({
  materializeTeam: vi.fn(),
  compensateMaterializeTeam: vi.fn(),
}))

vi.mock('./materialize-media.handler', () => ({
  materializeMedia: vi.fn(),
  compensateMaterializeMedia: vi.fn(),
}))

vi.mock('./materialize-knowledge.handler', () => ({
  materializeKnowledge: vi.fn(),
  compensateMaterializeKnowledge: vi.fn(),
}))

vi.mock('./create-instance.handler', () => ({
  createDeployInstance: vi.fn(),
  deleteDeployInstance: vi.fn(),
}))

vi.mock('./attach-connection.handler', () => ({
  attachConnection: vi.fn(),
  detachConnection: vi.fn(),
}))

vi.mock('./rollback.handler', () => ({
  rollbackDeployment: vi.fn(),
}))

import {
  executeDeployFlow,
  getCriticalRefinementPublishBlockerMessage,
  readCriticalRefinementPublishBlockerMessage,
} from './deploy-flow.orchestrator'
import { getRefinementPublishGateMessage } from '../refinement/refinement-gate'
import { trackJourneyEvent } from '@/server/services/journey-events'
import { readBuilderStateByProject } from '../sources/builder-state-db'
import { publishVersion } from './publish-version.handler'
import { materializePricing } from './materialize-pricing.handler'
import { materializeTeam } from './materialize-team.handler'
import { materializeMedia } from './materialize-media.handler'
import { materializeKnowledge } from './materialize-knowledge.handler'
import { createDeployInstance } from './create-instance.handler'
import { attachConnection } from './attach-connection.handler'
import { rollbackDeployment } from './rollback.handler'

const PROJECT_ID = 'project-1'
const PROMPT_VERSION_ID = 'prompt-version-1'
const USER_ID = 'user-1'
const ORG_ID = 'org-1'
const AGENT_ID = 'agent-1'
const DEPLOYMENT_ID = 'deployment-1'
const PUBLISHED_AT = new Date('2026-06-12T12:00:00.000Z')

function deployInput() {
  return {
    projectId: PROJECT_ID,
    promptVersionId: PROMPT_VERSION_ID,
    userId: USER_ID,
    organizationId: ORG_ID,
  }
}

function passedRefinementState() {
  return {
    journeyVersion: 2,
    refinement: {
      status: 'passed',
      blockers: [],
      checks: [],
      material: { promptVersionId: PROMPT_VERSION_ID },
    },
  }
}

describe('executeDeployFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    databaseMock.builderProject.findUnique.mockResolvedValue({
      id: PROJECT_ID,
      organizationId: ORG_ID,
      aiAgentId: AGENT_ID,
    })
    databaseMock.builderProjectConversation.findFirst.mockResolvedValue({
      builderState: passedRefinementState(),
    })
    databaseMock.builderDeployment.create.mockResolvedValue({ id: DEPLOYMENT_ID })
    databaseMock.builderDeployment.update.mockResolvedValue({})

    vi.mocked(publishVersion).mockResolvedValue({
      publishedAt: PUBLISHED_AT,
      versionNumber: 7,
    })
    vi.mocked(materializePricing).mockResolvedValue({
      listId: 'pricing-list-1',
      upserted: 0,
      deactivated: 0,
    })
    vi.mocked(materializeTeam).mockResolvedValue({
      departmentId: 'department-1',
      upserted: 0,
      deactivated: 0,
    })
    vi.mocked(materializeMedia).mockResolvedValue({
      collectionId: 'media-collection-1',
      upserted: 0,
      deactivated: 0,
    })
    vi.mocked(materializeKnowledge).mockResolvedValue({
      collectionId: 'knowledge-collection-1',
      linked: true,
    })
    vi.mocked(createDeployInstance).mockResolvedValue({
      instanceId: 'connection-1',
      qrCodeBase64: 'qr',
      shareLink: 'https://example.test/share',
      reused: false,
    })
    vi.mocked(attachConnection).mockResolvedValue({
      connectionId: 'connection-1',
      agentDeploymentId: 'agent-deployment-1',
      reused: false,
    })
    vi.mocked(readBuilderStateByProject).mockResolvedValue({
      journeyVersion: 2,
    })
    vi.mocked(trackJourneyEvent).mockResolvedValue(undefined)
    vi.mocked(rollbackDeployment).mockResolvedValue({
      deploymentId: DEPLOYMENT_ID,
      rolledBack: true,
      compensations: [],
    })
  })

  describe('refinement publish gate', () => {
    it('blocks critical refinement blockers', () => {
      const message = getCriticalRefinementPublishBlockerMessage({
        journeyVersion: 2,
        refinement: {
          status: 'failed',
          blockers: [
            {
              checkId: 'safety',
              severity: 'critical',
              message: 'Não publicar sem corrigir consentimento.',
            },
          ],
          checks: [],
        },
      })

      expect(message).toBe(
        'Publicação bloqueada pelo refinamento: Não publicar sem corrigir consentimento.',
      )
    })

    it('blocks critical failed checks', () => {
      expect(
        getCriticalRefinementPublishBlockerMessage({
          journeyVersion: 2,
          refinement: {
            checks: [
              {
                checkId: 'route',
                status: 'fail',
                severity: 'critical',
                recommendation: 'Revise o roteiro antes de publicar.',
              },
            ],
            blockers: [],
          },
        }),
      ).toContain('Revise o roteiro antes de publicar.')

      expect(
        getCriticalRefinementPublishBlockerMessage({
          journeyVersion: 2,
          refinement: {
            checks: [
              {
                checkId: 'knowledge',
                status: 'fail',
                severity: 'critical',
                evidence: 'O agente inventou política de troca.',
              },
            ],
            blockers: [],
          },
        }),
      ).toContain('O agente inventou política de troca.')
    })

    it('does not block v1 projects without refinement', () => {
      expect(getCriticalRefinementPublishBlockerMessage({})).toBeNull()
    })

    it('blocks v2 publish when refinement has not run yet', () => {
      expect(
        getCriticalRefinementPublishBlockerMessage({ journeyVersion: 2 }),
      ).toBe(
        'Publicação bloqueada pelo refinamento: Rode o refinamento antes de publicar.',
      )
    })

    it('blocks v2 publish while refinement is running', () => {
      expect(
        getCriticalRefinementPublishBlockerMessage({
          journeyVersion: 2,
          refinement: { status: 'running' },
        }),
      ).toBe(
        'Publicação bloqueada pelo refinamento: Aguarde o refinamento terminar antes de publicar.',
      )
    })

    it('blocks v2 publish when refinement needs user decision', () => {
      expect(
        getCriticalRefinementPublishBlockerMessage({
          journeyVersion: 2,
          refinement: {
            status: 'needs_user_decision',
            blockers: [],
            checks: [
              {
                checkId: 'ux',
                status: 'fail',
                severity: 'medium',
                recommendation: 'Encurtar resposta.',
              },
            ],
          },
        }),
      ).toBe(
        'Publicação bloqueada pelo refinamento: Revise as decisões pendentes do refinamento antes de publicar.',
      )
    })

    it('does not block passed refinement warnings', () => {
      const message = getCriticalRefinementPublishBlockerMessage({
        journeyVersion: 2,
        refinement: {
          status: 'passed',
          blockers: [
            {
              checkId: 'copy',
              severity: 'high',
              message: 'Resposta longa demais.',
            },
          ],
          checks: [
            {
              checkId: 'ux',
              status: 'warning',
              severity: 'critical',
              recommendation: 'Melhorar clareza.',
            },
          ],
        },
      })

      expect(message).toBeNull()
    })

    it('blocks passed refinement when publishing a different prompt version', () => {
      const message = getRefinementPublishGateMessage(
        {
          journeyVersion: 2,
          refinement: {
            status: 'passed',
            blockers: [],
            checks: [],
            material: { promptVersionId: 'version-1' },
          },
        },
        { promptVersionId: 'version-2' },
      )

      expect(message).toContain('versão do prompt mudou')
    })

    it('reads builderState through BuilderProjectConversation scoped by projectId and organizationId', async () => {
      databaseMock.builderProjectConversation.findFirst.mockResolvedValueOnce({
        builderState: {
          journeyVersion: 2,
          refinement: {
            blockers: [
              {
                checkId: 'route',
                severity: 'critical',
                message: 'Ajuste o roteiro antes de publicar.',
              },
            ],
          },
        },
      })

      const message = await readCriticalRefinementPublishBlockerMessage({
        projectId: 'project-1',
        organizationId: 'org-1',
      })

      expect(
        databaseMock.builderProjectConversation.findFirst,
      ).toHaveBeenCalledWith({
        where: { projectId: 'project-1', organizationId: 'org-1' },
        select: { builderState: true },
      })
      expect(message).toContain('Ajuste o roteiro antes de publicar.')
    })
  })

  describe('published telemetry (T36)', () => {
    it('emite evento published quando a saga chega a live', async () => {
      const result = await executeDeployFlow(deployInput())

      expect(result).toMatchObject({
        deploymentId: DEPLOYMENT_ID,
        status: 'live',
        projectId: PROJECT_ID,
        promptVersionId: PROMPT_VERSION_ID,
        instanceId: 'connection-1',
        connectionId: 'connection-1',
        publishedAt: PUBLISHED_AT,
        versionNumber: 7,
      })
      expect(trackJourneyEvent).toHaveBeenCalledOnce()
      expect(trackJourneyEvent).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        journeyVersion: 2,
        event: 'published',
      })
    })

    it('fail-open: falha de telemetria published não derruba a saga nem aciona rollback', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(trackJourneyEvent).mockRejectedValueOnce(
        new Error('telemetry down'),
      )

      await expect(executeDeployFlow(deployInput())).resolves.toMatchObject({
        status: 'live',
        deploymentId: DEPLOYMENT_ID,
      })

      expect(trackJourneyEvent).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        journeyVersion: 2,
        event: 'published',
      })
      expect(rollbackDeployment).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })

  describe('happy path', () => {
    it.todo(
      'creates BuilderDeployment, runs publish → instance → attach, marks status=live',
    )
    it.todo('persists versionNumber, publishedAt, instanceId, connectionId')
    it.todo(
      'executes in memory when BuilderDeployment delegate is missing (degrade gracefully)',
    )
  })

  describe('failure: publish_version throws', () => {
    it.todo('marks deployment status=failed with failureStep=publish_version')
    it.todo('invokes rollbackDeployment automatically')
    it.todo('does not call createDeployInstance or attachConnection')
  })

  describe('failure: create_instance throws', () => {
    it.todo('marks deployment status=failed with failureStep=create_instance')
    it.todo('invokes rollbackDeployment which runs unpublishVersion compensation')
    it.todo('does not call attachConnection')
  })

  describe('failure: attach_connection throws', () => {
    it.todo('marks deployment status=failed with failureStep=attach_connection')
    it.todo(
      'invokes rollbackDeployment which deletes Connection AND unsets publishedAt',
    )
  })

  describe('validation', () => {
    it.todo('throws when project is not found')
    it.todo('throws when project.aiAgentId is null (no agent bound yet)')
  })
})
