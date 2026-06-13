import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ChatMessage, WorkspaceProject } from '@/client/components/projetos/types'
import { ActivityTab } from '@/client/components/projetos/preview/tabs/_core/activity/activity-tab'
import { deriveChecklist } from '@/client/components/projetos/preview/tabs/deploy/connection-step'
import {
  journeyToPhases,
  stepsToStages,
} from '@/client/components/projetos/preview/tabs/overview/helpers/readiness-adapters'
import { PhaseList } from '@/client/components/projetos/preview/tabs/overview/components/phase-list'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import type { Readiness } from '@/server/ai-module/builder/state/readiness.types'
import { DEFAULT_AGENT_RUNTIME_SETTINGS } from '@/lib/agent-runtime-settings'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

function makeProject(overrides: Partial<WorkspaceProject> = {}): WorkspaceProject {
  return {
    id: 'proj-1',
    name: 'Assistente WhatsApp',
    type: 'ai_agent',
    status: 'draft',
    journeyVersion: 2,
    aiAgentId: 'agent-1',
    aiAgent: {
      id: 'agent-1',
      name: 'Suporte',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt:
        'Voce e um assistente de atendimento via WhatsApp para responder clientes com clareza.',
    },
    runtimeSettings: DEFAULT_AGENT_RUNTIME_SETTINGS,
    hasWhatsAppConnection: false,
    ...overrides,
  }
}

describe('Builder preview WhatsApp UX', () => {
  it('marks the deploy WhatsApp requirement from project.hasWhatsAppConnection', () => {
    const disconnected = deriveChecklist(makeProject())
    expect(disconnected.find((item) => item.key === 'whatsapp')).toMatchObject({
      label: 'Canal WhatsApp conectado',
      met: false,
    })

    const connected = deriveChecklist(
      makeProject({ hasWhatsAppConnection: true }),
    )
    expect(connected.find((item) => item.key === 'whatsapp')).toMatchObject({
      label: 'Canal WhatsApp conectado',
      met: true,
    })
  })

  it('renders WhatsApp tool calls in the activity timeline', () => {
    const messages: ChatMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        createdAt: '2026-05-04T12:00:00.000Z',
        toolCalls: [
          {
            toolName: 'list_whatsapp_instances',
            args: { organizationId: 'org-1' },
            result: [{ id: 'conn-1', name: 'Suporte', status: 'connected' }],
          },
          {
            toolName: 'create_whatsapp_instance',
            args: { name: 'Suporte' },
          },
        ],
      },
    ]

    render(<ActivityTab project={makeProject()} messages={messages} />)

    expect(screen.getByText('Atividade do agente')).toBeTruthy()
    expect(screen.getByText('2 ações')).toBeTruthy()
    expect(screen.getByText('Listou instâncias WhatsApp')).toBeTruthy()
    expect(screen.getByText('Criou instância WhatsApp')).toBeTruthy()
    expect(screen.getByText('list_whatsapp_instances')).toBeTruthy()
    expect(screen.getByText('create_whatsapp_instance')).toBeTruthy()
    expect(screen.getByText('ok')).toBeTruthy()
    expect(screen.getByText('pending')).toBeTruthy()
  })
})

// ── T37: Overview adapters — fases (Journey v2) vs lista plana (v1) ──────────

function makeReadiness(overrides: Partial<Readiness> = {}): Readiness {
  return {
    step: { id: 'agent_review', title: 'Revisar agente', ask: 'Confira o agente' },
    requiredMissing: [],
    completenessPct: 40,
    isDeployReady: false,
    blockers: [],
    fieldOwnership: {},
    steps: [
      { id: 'business_identity', title: 'Identidade do negócio', done: true },
      { id: 'agent_review', title: 'Revisar agente', done: false },
      { id: 'test_drive', title: 'Testar', done: false },
      { id: 'activation', title: 'Ativar', done: false },
    ],
    ...overrides,
  }
}

const JOURNEY_FIXTURE: NonNullable<Readiness['journey']> = {
  version: 2,
  activePhaseId: 'revisar',
  phases: [
    {
      id: 'conhecer',
      title: 'Conhecer',
      status: 'done',
      steps: [{ id: 'business_identity', title: 'Identidade do negócio', done: true }],
    },
    {
      id: 'revisar',
      title: 'Revisar',
      status: 'active',
      steps: [{ id: 'agent_review', title: 'Revisar agente', done: false }],
    },
    {
      id: 'testar',
      title: 'Testar',
      status: 'pending',
      steps: [{ id: 'test_drive', title: 'Testar', done: false }],
    },
    {
      id: 'lancar',
      title: 'Lançar',
      status: 'pending',
      steps: [{ id: 'activation', title: 'Ativar', done: false }],
    },
  ],
}

describe('Overview readiness adapters (T37)', () => {
  it('returns null for v1 readiness (no journey) — flat stage list stays canonical', () => {
    const v1 = makeReadiness()
    expect(journeyToPhases(v1)).toBeNull()
    // v1 render path is unchanged: stepsToStages keeps surfacing the flat list.
    const stages = stepsToStages(v1)
    expect(stages).toHaveLength(4)
    expect(stages[0]).toMatchObject({ title: 'Identidade do negócio', status: 'done' })
    expect(stages[1]).toMatchObject({ title: 'Revisar agente', status: 'active' })
  })

  it('exposes the 4 journey phases with their steps when journey is present', () => {
    const v2 = makeReadiness({ journey: JOURNEY_FIXTURE })
    const phases = journeyToPhases(v2)
    expect(phases).not.toBeNull()
    expect(phases).toHaveLength(4)
    expect(phases?.map((p) => p.id)).toEqual([
      'conhecer',
      'revisar',
      'testar',
      'lancar',
    ])
    expect(phases?.map((p) => p.status)).toEqual([
      'done',
      'active',
      'pending',
      'pending',
    ])
  })

  it('marks the active step inside its phase and numbers steps per phase', () => {
    const v2 = makeReadiness({ journey: JOURNEY_FIXTURE })
    const phases = journeyToPhases(v2)
    const revisar = phases?.find((p) => p.id === 'revisar')
    // The active step (readiness.step.id === 'agent_review') resolves to "active".
    expect(revisar?.stages).toEqual([
      { number: 1, title: 'Revisar agente', status: 'active' },
    ])
    const conhecer = phases?.find((p) => p.id === 'conhecer')
    expect(conhecer?.stages).toEqual([
      { number: 1, title: 'Identidade do negócio', status: 'done' },
    ])
  })
})

function PhaseListHarness() {
  const { tokens } = useAppTokens()
  const phases = journeyToPhases(makeReadiness({ journey: JOURNEY_FIXTURE }))
  return <PhaseList phases={phases ?? []} tokens={tokens} />
}

describe('Overview PhaseList render (T37)', () => {
  it('renders the 4 phase headers with their per-phase status + step rows', () => {
    render(<PhaseListHarness />)

    expect(screen.getByText('Fase 1 de 4 — Conhecer')).toBeTruthy()
    expect(screen.getByText('Fase 2 de 4 — Revisar')).toBeTruthy()
    expect(screen.getByText('Fase 3 de 4 — Testar')).toBeTruthy()
    expect(screen.getByText('Fase 4 de 4 — Lançar')).toBeTruthy()

    // Phase-level status labels (done/active/pending) come straight from the
    // server's journey payload — the adapter never re-derives them.
    expect(screen.getByText('Concluída')).toBeTruthy()
    expect(screen.getAllByText('Pendente').length).toBeGreaterThanOrEqual(2)

    // The active journey step surfaces inside the Revisar phase.
    expect(screen.getByText('Revisar agente')).toBeTruthy()
    expect(screen.getByText('Identidade do negócio')).toBeTruthy()
  })
})
