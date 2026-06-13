import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  ConversationBlueprintCard,
  type ConversationBlueprintPayload,
} from '@/client/components/projetos/chat/cards/conversation-blueprint-card'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import {
  parseBuilderState,
  patchBuilderState,
  type BuilderState,
} from '@/server/ai-module/builder/cards/builder-state'
import type { ConversationBlueprint } from '@/server/ai-module/builder/playbook/blueprint.schema'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

const blueprint: ConversationBlueprint = {
  status: 'proposed',
  objective: 'Qualificar lead e sugerir agendamento',
  niche: 'Salao de beleza',
  stages: [
    {
      id: 'stage-discovery',
      title: 'Entender necessidade',
      goal: 'Mapear o servico desejado e o contexto do cliente.',
      order: 0,
    },
    {
      id: 'stage-booking',
      title: 'Direcionar proximo passo',
      goal: 'Coletar horario preferido e acionar agenda quando fizer sentido.',
      order: 1,
    },
  ],
  questions: [
    {
      id: 'q-service',
      stageId: 'stage-discovery',
      text: 'Qual servico voce procura?',
      purpose: 'servico de interesse',
      variableKey: 'service',
      skipWhenKnown: 'servico ja informado',
      required: true,
      order: 0,
    },
    {
      id: 'q-when',
      stageId: 'stage-booking',
      text: 'Tem algum horario de preferencia?',
      purpose: 'janela de agendamento',
      variableKey: 'preferred_time',
      skipWhenKnown: 'horario ja informado',
      required: true,
      order: 1,
    },
  ],
  variables: [],
  skipRules: [],
  successCriteria: ['Lead qualificado com proximo passo claro'],
  handoffTriggers: ['pedido urgente', 'cliente frustrado'],
  toolTriggers: [
    {
      capability: 'agenda',
      toolKey: 'calendar',
      when: 'cliente pede para marcar horario',
      requiredVariables: ['preferred_time'],
      fallback: 'oferecer atendimento humano',
      active: true,
    },
  ],
  objectionRules: [],
  doRules: [],
  dontRules: [],
  sourceRefs: [],
}

function stateWithBlueprint(
  conversationBlueprint: ConversationBlueprint = blueprint,
): BuilderState {
  return patchBuilderState(parseBuilderState({}), {
    conversationBlueprint,
  })
}

function soldOutState(): BuilderState {
  return patchBuilderState(stateWithBlueprint(), {
    sourceIngestion: {
      proposed: {
        businessName: 'Vibra Butantã',
        differentiators: ['pronto e 100% vendido'],
      },
    },
  })
}

function soldOutStateWithoutBlueprint(): BuilderState {
  return patchBuilderState(parseBuilderState({}), {
    project: {
      objective: 'Criar SDR imobiliário para o Vibra Butantã.',
    },
    sourceIngestion: {
      proposed: {
        businessName: 'Vibra Butantã',
        differentiators: ['pronto e 100% vendido'],
      },
    },
  })
}

function stateWithPhoneQuestion(): BuilderState {
  return stateWithBlueprint({
    ...blueprint,
    questions: [
      ...blueprint.questions,
      {
        id: 'q-phone',
        stageId: 'stage-booking',
        text: 'Qual é o melhor telefone para contato?',
        purpose: 'Capturar telefone do lead',
        variableKey: 'telefone',
        skipWhenKnown: 'Pular se telefone já estiver disponível.',
        required: true,
        order: 2,
      },
    ],
  })
}

function Harness({
  value,
  disabled = false,
  onSubmit,
}: {
  value: BuilderState
  disabled?: boolean
  onSubmit: (payload: ConversationBlueprintPayload) => void
}) {
  const { tokens } = useAppTokens()

  return (
    <ConversationBlueprintCard
      projectId="proj-1"
      cardKey="conversation_blueprint"
      value={value}
      disabled={disabled}
      onSubmit={onSubmit}
      tokens={tokens}
    />
  )
}

function renderCard({
  value = stateWithBlueprint(),
  disabled,
  onSubmit = vi.fn(),
}: {
  value?: BuilderState
  disabled?: boolean
  onSubmit?: (payload: ConversationBlueprintPayload) => void
} = {}) {
  render(<Harness value={value} disabled={disabled} onSubmit={onSubmit} />)
  return { onSubmit }
}

describe('ConversationBlueprintCard (T58)', () => {
  it('renders summary, stages, questions, and triggers', () => {
    renderCard()

    expect(screen.getByText('Plano de atendimento')).toBeInTheDocument()
    expect(screen.getByText('Resumo')).toBeInTheDocument()
    expect(screen.getByText(blueprint.objective!)).toBeInTheDocument()
    expect(
      screen.getByText(/2 etapa\(s\).*2 pergunta\(s\).*1 capacidade\(s\)/),
    ).toBeInTheDocument()

    expect(screen.getByText('Etapas')).toBeInTheDocument()
    expect(screen.getByText('Entender necessidade')).toBeInTheDocument()
    expect(
      screen.getByText('Mapear o servico desejado e o contexto do cliente.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Direcionar proximo passo')).toBeInTheDocument()

    expect(screen.getByText('Perguntas')).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('Qual servico voce procura?'),
    ).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('Tem algum horario de preferencia?'),
    ).toBeInTheDocument()
    expect(screen.getByText('Descobre: servico de interesse')).toBeInTheDocument()
    expect(screen.getByText('Pular quando: servico ja informado')).toBeInTheDocument()

    expect(screen.getByText('Gatilhos')).toBeInTheDocument()
    expect(
      screen.getByText(/Humano:.*pedido urgente.*cliente frustrado/),
    ).toBeInTheDocument()
    expect(screen.getByText('Ferramentas: agenda')).toBeInTheDocument()
  })

  it('edits and removes a question before submitting a payload without cardKey', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderCard({ onSubmit })

    const [firstQuestion] = screen.getAllByRole('textbox')
    await user.clear(firstQuestion)
    await user.type(firstQuestion, 'Qual horario prefere?')

    await user.click(screen.getAllByRole('button', { name: 'Remover pergunta' })[1])
    expect(
      screen.queryByDisplayValue('Tem algum horario de preferencia?'),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Aprovar plano' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0][0]
    expect(payload).not.toHaveProperty('cardKey')
    expect(payload.action).toBe('approve')
    expect(payload.blueprint.objective).toBe(blueprint.objective)
    expect(payload.blueprint.questions).toHaveLength(1)
    expect(payload.blueprint.questions[0]).toMatchObject({
      id: 'q-service',
      text: 'Qual horario prefere?',
    })
  })

  it('allows regenerating a proposed blueprint before approval', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderCard({ onSubmit })

    await user.click(screen.getByRole('button', { name: 'Gerar de novo' }))

    expect(onSubmit).toHaveBeenCalledWith({ action: 'generate' })
  })

  it('warns when source context says the project is sold out', () => {
    renderCard({ value: soldOutState() })

    expect(screen.getByText(/100% vendido ou esgotado/i)).toBeInTheDocument()
    expect(screen.getByText(/defina como o SDR deve tratar/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lista de interesse/i })).toBeInTheDocument()
  })

  it('requires a sold-out strategy before generating a blueprint', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCard({ value: soldOutStateWithoutBlueprint() })

    const generateButton = screen.getByRole('button', { name: 'Gerar plano' })
    expect(generateButton).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /Lista de interesse/i }))
    expect(generateButton).toBeEnabled()

    await user.click(generateButton)
    expect(onSubmit).toHaveBeenCalledWith({
      action: 'generate',
      contextDecision: {
        kind: 'sold_out',
        strategy: 'interest_list',
      },
    })
  })

  it('warns when the proposed script asks for phone in a WhatsApp flow', () => {
    renderCard({ value: stateWithPhoneQuestion() })

    expect(screen.getByText(/pergunta telefone/i)).toBeInTheDocument()
    expect(screen.getByText(/já vem do próprio canal/i)).toBeInTheDocument()
  })

  it('disables approval when the blueprint is already approved', async () => {
    const user = userEvent.setup()
    const approvedBlueprint: ConversationBlueprint = {
      ...blueprint,
      status: 'approved',
      approvedAt: '2026-06-12T00:00:00.000Z',
    }
    const { onSubmit } = renderCard({
      value: stateWithBlueprint(approvedBlueprint),
    })

    const button = screen.getByRole('button', { name: 'Plano aprovado' })
    expect(button).toBeDisabled()

    await user.click(button)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('generates a blueprint when there is no proposal yet', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCard({ value: parseBuilderState({}) })

    expect(screen.queryByText('Resumo')).not.toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Gerar plano' })
    expect(button).toBeEnabled()

    await user.click(button)
    expect(onSubmit).toHaveBeenCalledWith({ action: 'generate' })
  })

  it('seeds the draft when a blueprint arrives after the card first mounts', () => {
    const onSubmit = vi.fn()
    const { rerender } = render(
      <Harness value={parseBuilderState({})} onSubmit={onSubmit} />,
    )

    expect(screen.queryByText('Resumo')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Gerar plano' }),
    ).toBeEnabled()

    rerender(<Harness value={stateWithBlueprint()} onSubmit={onSubmit} />)

    expect(screen.getByText('Resumo')).toBeInTheDocument()
    expect(screen.getByText(blueprint.objective!)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprovar plano' })).toBeEnabled()
  })

  it('clears the old draft while a regenerated blueprint is arriving', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { rerender } = render(
      <Harness value={stateWithBlueprint()} onSubmit={onSubmit} />,
    )
    const regenerated: ConversationBlueprint = {
      ...blueprint,
      objective: 'Qualificar interessados em lista de espera',
      questions: [
        {
          ...blueprint.questions[0],
          id: 'q-lista',
          text: 'Você quer entrar na lista de interesse?',
        },
      ],
    }

    await user.click(screen.getByRole('button', { name: 'Gerar de novo' }))

    expect(onSubmit).toHaveBeenCalledWith({ action: 'generate' })
    expect(
      screen.queryByDisplayValue('Qual servico voce procura?'),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/O plano de atendimento ainda não foi criado/i)).toBeInTheDocument()

    rerender(<Harness value={stateWithBlueprint(regenerated)} onSubmit={onSubmit} />)

    expect(
      await screen.findByText('Qualificar interessados em lista de espera'),
    ).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('Você quer entrar na lista de interesse?'),
    ).toBeInTheDocument()
  })
})
