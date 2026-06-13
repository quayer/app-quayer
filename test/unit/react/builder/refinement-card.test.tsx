import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  RefinementCard,
  type RefinementCardProps,
} from '@/client/components/projetos/chat/cards/refinement-card'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import {
  parseBuilderState,
  type BuilderState,
  type RefinementState,
} from '@/server/ai-module/builder/cards/builder-state'
import type { ConversationBlueprint } from '@/server/ai-module/builder/playbook/blueprint.schema'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

const approvedBlueprint: ConversationBlueprint = {
  status: 'approved',
  objective: 'Qualificar leads e sugerir proximo passo.',
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

const failedRefinement: RefinementState = {
  status: 'failed',
  runId: 'refine-test',
  score: 50,
  startedAt: '2026-06-12T00:00:00.000Z',
  finishedAt: '2026-06-12T00:01:00.000Z',
  checks: [
    {
      checkId: 'route.stage',
      label: 'Plano de atendimento',
      status: 'pass',
      severity: 'low',
      evidence: 'Seguiu a etapa inicial.',
      recommendation: 'Nenhuma acao.',
      autoFixable: false,
    },
    {
      checkId: 'safety.identity',
      label: 'Seguranca',
      status: 'fail',
      severity: 'critical',
      evidence: 'Prometeu resultado garantido.',
      recommendation: 'Remover promessa absoluta antes de publicar.',
      autoFixable: true,
    },
  ],
  blockers: [
    {
      checkId: 'safety.identity',
      severity: 'critical',
      message: 'Remover promessa absoluta antes de publicar.',
      recommendation: 'Ajuste o limite de seguranca do agente.',
    },
  ],
}

function makeState({
  refinement,
  approved = true,
}: {
  refinement?: RefinementState
  approved?: boolean
} = {}): BuilderState {
  return {
    ...parseBuilderState({}),
    conversationBlueprint: approved ? approvedBlueprint : undefined,
    refinement,
  }
}

function Harness({
  value,
  onRun,
  toolSummary,
}: {
  value: BuilderState
  onRun?: () => void
  toolSummary?: RefinementCardProps['toolSummary']
}) {
  const { tokens } = useAppTokens()

  return (
    <RefinementCard
      projectId="proj-1"
      cardKey="refinement"
      value={value}
      onSubmit={() => {}}
      onRun={onRun}
      toolSummary={toolSummary}
      tokens={tokens}
    />
  )
}

describe('RefinementCard', () => {
  it('renders failed refinement summary with checks and blockers', () => {
    render(<Harness value={makeState({ refinement: failedRefinement })} />)

    expect(screen.getByText('Corrigir antes de publicar')).toBeInTheDocument()
    expect(screen.getByText('50/100')).toBeInTheDocument()
    expect(screen.getByText('Bloqueado')).toBeInTheDocument()
    expect(screen.getByText(/1 bloqueio crítico/)).toBeInTheDocument()

    expect(screen.getByText('Plano de atendimento')).toBeInTheDocument()
    expect(screen.getByText('Segurança')).toBeInTheDocument()
    expect(screen.getByText('falhou')).toBeInTheDocument()
    expect(
      screen.getAllByText('Remover promessa absoluta antes de publicar.'),
    ).toHaveLength(2)
    expect(
      screen.getByText('Ajuste o limite de seguranca do agente.'),
    ).toBeInTheDocument()
  })

  it('allows requesting a refinement run when the blueprint is approved', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    render(<Harness value={makeState()} onRun={onRun} />)

    await user.click(screen.getByRole('button', { name: 'Rodar refinamento' }))

    expect(onRun).toHaveBeenCalledTimes(1)
  })

  it('keeps the run action disabled until the blueprint is approved', () => {
    render(<Harness value={makeState({ approved: false })} onRun={vi.fn()} />)

    expect(
      screen.getByRole('button', { name: 'Rodar refinamento' }),
    ).toBeDisabled()
    expect(
      screen.getByText('Aprove o plano de atendimento antes de rodar o refinamento.'),
    ).toBeInTheDocument()
  })
})
