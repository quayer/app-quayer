import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useAppTokens } from '@/client/hooks/use-app-tokens'
import { RefinementCard } from '@/client/components/projetos/chat/cards/refinement-card'
import {
  parseBuilderState,
  type BuilderState,
} from '@/server/ai-module/builder/cards/builder-state'
import type { ConversationBlueprint } from '@/server/ai-module/builder/playbook/blueprint.schema'
import type { Readiness } from '@/server/ai-module/builder/state/readiness.types'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

vi.mock('@/client/components/projetos/chat/cards/card-registry', () => ({
  getCardDescriptor: () => undefined,
  getCardForStep: (stepId: string) =>
    stepId === 'refinement'
      ? {
          cardKey: 'refinement',
          stepId: 'refinement',
          title: 'Refinando',
          icon: null,
          component: RefinementCard,
        }
      : undefined,
}))

import { ActiveStepCard } from '@/client/components/projetos/chat/active-step-card'

const approvedBlueprint: ConversationBlueprint = {
  status: 'approved',
  objective: 'Qualificar leads.',
  niche: 'servico local',
  stages: [],
  questions: [],
  variables: [],
  skipRules: [],
  successCriteria: [],
  handoffTriggers: [],
  toolTriggers: [],
  objectionRules: [],
  doRules: [],
  dontRules: [],
  sourceRefs: [],
}

function builderState(): BuilderState {
  return {
    ...parseBuilderState({ journeyVersion: 2 }),
    conversationBlueprint: approvedBlueprint,
    refinement: {
      status: 'idle',
      checks: [],
      blockers: [],
    },
  }
}

function readiness(state: BuilderState): Readiness {
  return {
    step: {
      id: 'refinement',
      title: 'Refinar antes de lançar',
      ask: 'Rode o refinamento.',
    },
    requiredMissing: ['refinement.status'],
    completenessPct: 60,
    isDeployReady: false,
    blockers: [
      {
        check: 'refinement',
        message: 'Rode o refinamento antes de publicar.',
      },
    ],
    fieldOwnership: {},
    steps: [{ id: 'refinement', title: 'Refinar antes de lançar', done: false }],
    builderState: state,
    journey: {
      version: 2,
      activePhaseId: 'testar',
      phases: [
        { id: 'conhecer', title: 'Conhecer', status: 'done', steps: [] },
        { id: 'revisar', title: 'Revisar', status: 'done', steps: [] },
        {
          id: 'testar',
          title: 'Testar',
          status: 'active',
          steps: [
            { id: 'refinement', title: 'Refinar antes de lançar', done: false },
          ],
        },
        { id: 'lancar', title: 'Lançar', status: 'pending', steps: [] },
      ],
    },
  }
}

function Harness({
  onSubmit,
}: {
  onSubmit: (cardKey: string, payload: Record<string, unknown>) => void
}) {
  const { tokens } = useAppTokens()
  const state = builderState()

  return (
    <ActiveStepCard
      projectId="proj-1"
      readiness={readiness(state)}
      disabled={false}
      onSubmit={onSubmit}
      onDismiss={() => {}}
      reopenedCardKey={null}
      onAdjust={() => {}}
      onCloseReopened={() => {}}
      tokens={tokens}
    />
  )
}

describe('ActiveStepCard — refinement step', () => {
  it('renders refinement as an actionable active-step card', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<Harness onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Rodar refinamento' }))

    expect(onSubmit).toHaveBeenCalledWith('refinement', { action: 'run' })
  })
})
