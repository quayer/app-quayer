import { describe, expect, it } from 'vitest'
import type { ConversationBlueprint } from '../playbook/blueprint.schema'
import { runRefinement } from './run-refinement'
import type { RefinementScenario } from './types'

const blueprint: ConversationBlueprint = {
  status: 'approved',
  objective: 'Qualificar leads.',
  niche: 'serviço local',
  stages: [],
  questions: [],
  variables: [],
  skipRules: [],
  successCriteria: ['Lead qualificado.'],
  handoffTriggers: [],
  toolTriggers: [],
  objectionRules: [],
  doRules: [],
  dontRules: [],
  sourceRefs: [],
}

const scenarios: RefinementScenario[] = [
  {
    id: 'happy',
    label: 'Fluxo feliz',
    userMessages: ['Oi, quero atendimento'],
    tags: ['happy_path'],
  },
]

describe('runRefinement', () => {
  it('aggregates auditor checks into a passed refinement state', async () => {
    const result = await runRefinement({
      projectId: 'proj-1',
      organizationId: 'org-1',
      blueprint,
      scenarios,
      runId: 'run-1',
      now: () => new Date('2026-06-12T00:00:00.000Z'),
      runner: async ({ scenario }) => ({
        scenario,
        transcript: [
          { role: 'user', content: 'Oi' },
          { role: 'assistant', content: 'Olá, como posso ajudar?' },
        ],
        toolCalls: [],
      }),
      auditors: [
        () => [
          {
            checkId: 'route',
            label: 'Plano de atendimento',
            status: 'pass',
            severity: 'low',
            evidence: 'Seguiu a primeira etapa.',
            recommendation: 'Nenhuma ação.',
            autoFixable: false,
          },
        ],
      ],
      material: {
        promptVersionId: 'version-1',
        promptVersionNumber: 1,
        promptHash: 'prompt-hash',
        blueprintHash: 'blueprint-hash',
        contextHash: 'context-hash',
      },
    })

    expect(result.state).toMatchObject({
      status: 'passed',
      runId: 'run-1',
      score: 100,
      startedAt: '2026-06-12T00:00:00.000Z',
      finishedAt: '2026-06-12T00:00:00.000Z',
      blockers: [],
      material: {
        promptVersionId: 'version-1',
        promptVersionNumber: 1,
        promptHash: 'prompt-hash',
        blueprintHash: 'blueprint-hash',
        contextHash: 'context-hash',
      },
    })
  })

  it('turns critical failed checks into publication blockers', async () => {
    const result = await runRefinement({
      projectId: 'proj-1',
      organizationId: 'org-1',
      blueprint,
      scenarios,
      runner: async ({ scenario }) => ({
        scenario,
        transcript: [],
        toolCalls: [],
      }),
      auditors: [
        () => [
          {
            checkId: 'safety',
            label: 'Segurança',
            status: 'fail',
            severity: 'critical',
            evidence: 'Violou regra de segurança.',
            recommendation: 'Corrigir regra antes de publicar.',
            autoFixable: true,
          },
        ],
      ],
    })

    expect(result.state.status).toBe('failed')
    expect(result.state.score).toBe(0)
    expect(result.state.blockers).toEqual([
      {
        checkId: 'safety',
        severity: 'critical',
        message: 'Corrigir regra antes de publicar.',
        recommendation: 'Corrigir regra antes de publicar.',
      },
    ])
  })

  it('keeps non-critical failures as user-decision state without blockers', async () => {
    const result = await runRefinement({
      projectId: 'proj-1',
      organizationId: 'org-1',
      blueprint,
      scenarios,
      runner: async ({ scenario }) => ({
        scenario,
        transcript: [],
        toolCalls: [],
      }),
      auditors: [
        () => [
          {
            checkId: 'ux',
            label: 'UX',
            status: 'fail',
            severity: 'medium',
            evidence: 'Mensagem longa.',
            recommendation: 'Encurtar resposta.',
            autoFixable: true,
          },
        ],
      ],
    })

    expect(result.state.status).toBe('needs_user_decision')
    expect(result.state.blockers).toEqual([])
  })

  it('records runner errors as critical checks', async () => {
    const result = await runRefinement({
      projectId: 'proj-1',
      organizationId: 'org-1',
      blueprint,
      scenarios,
      runner: async ({ scenario }) => ({
        scenario,
        transcript: [],
        toolCalls: [],
        error: 'Preview indisponível',
      }),
      auditors: [],
    })

    expect(result.state.status).toBe('failed')
    expect(result.state.checks[0]).toMatchObject({
      checkId: 'runner.happy',
      status: 'fail',
      severity: 'critical',
      evidence: 'Preview indisponível',
    })
  })
})
