import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  AgentReviewCard,
  type AgentReviewPayload,
  type AgentReviewSectionErrors,
} from '@/client/components/projetos/chat/cards/agent-review-card'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import {
  parseBuilderState,
  type BuilderState,
} from '@/server/ai-module/builder/cards/builder-state'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

function makeState(
  capturedProposals?: BuilderState['capturedProposals'],
  overrides?: Record<string, unknown>,
) {
  return parseBuilderState({
    journeyVersion: 2,
    project: {
      name: 'Clinica Orayon',
      objective: 'Qualificar pacientes e agendar consulta.',
    },
    proposal: {
      description: 'Atendimento consultivo para leads de saude.',
    },
    persona: {
      name: 'Assistente inicial',
      tone: 'consultivo',
      style: 'respostas curtas',
      greeting: 'Ola, posso ajudar?',
      speechMode: 'assistant',
    },
    services: {
      offered: ['Consulta inicial'],
      notOffered: ['Diagnostico garantido'],
    },
    hours: {
      preset: 'commercial',
      timezone: 'America/Sao_Paulo',
      outOfHours: 'reply_notice',
    },
    confirmations: {
      persona: true,
      services: true,
      hours: true,
    },
    capturedProposals,
    ...overrides,
  })
}

function Harness({
  value,
  reviewErrors,
  onSubmit,
}: {
  value: BuilderState
  reviewErrors?: AgentReviewSectionErrors
  onSubmit: (payload: AgentReviewPayload) => void
}) {
  const { tokens } = useAppTokens()

  return (
    <AgentReviewCard
      projectId="proj-1"
      cardKey="agent_review"
      value={value}
      reviewErrors={reviewErrors}
      onSubmit={onSubmit}
      tokens={tokens}
    />
  )
}

function openVoiceEditor(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getAllByRole('button', { name: 'Editar' })[0])
}

describe('AgentReviewCard', () => {
  it('preserves valid local state when a granular section error arrives', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { rerender } = render(
      <Harness value={makeState()} onSubmit={onSubmit} />,
    )

    await openVoiceEditor(user)
    await user.clear(screen.getByLabelText('Nome exibido no atendimento'))
    await user.type(
      screen.getByLabelText('Nome exibido no atendimento'),
      'Nome local valido',
    )

    rerender(
      <Harness
        value={makeState()}
        reviewErrors={{ hours: 'Horario invalido.' }}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Horario invalido.')

    await user.click(screen.getByRole('button', { name: 'Criar agente' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].persona.name).toBe('Nome local valido')
  })

  it('keeps typing when a late suggestion arrives and applies only the clicked field', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { rerender } = render(
      <Harness value={makeState()} onSubmit={onSubmit} />,
    )

    await openVoiceEditor(user)
    const nameInput = screen.getByLabelText('Nome exibido no atendimento')
    const toneInput = screen.getByLabelText('Tom comercial')
    await user.clear(nameInput)
    await user.type(nameInput, 'Nome digitado')
    await user.clear(toneInput)
    await user.type(toneInput, 'Tom digitado')

    rerender(
      <Harness
        value={makeState({
          persona: {
            name: 'Nome sugerido',
            tone: 'Tom sugerido',
          },
        })}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByLabelText('Nome exibido no atendimento')).toHaveValue(
      'Nome digitado',
    )
    expect(screen.getByLabelText('Tom comercial')).toHaveValue('Tom digitado')

    await user.click(
      screen.getByRole('button', { name: 'Usar sugestão: "Nome sugerido"' }),
    )

    expect(screen.getByLabelText('Nome exibido no atendimento')).toHaveValue(
      'Nome sugerido',
    )
    expect(screen.getByLabelText('Tom comercial')).toHaveValue('Tom digitado')
    expect(
      screen.queryByRole('button', { name: 'Usar sugestão: "Nome sugerido"' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Usar sugestão: "Tom sugerido"' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Criar agente' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].persona).toMatchObject({
      name: 'Nome sugerido',
      tone: 'Tom digitado',
    })
  })

  it('omits the read-only portrait when the state has no business decisions', () => {
    render(
      <Harness
        value={makeState(undefined, {
          services: { offered: ['Consulta inicial'], notOffered: [] },
        })}
        onSubmit={vi.fn()}
      />,
    )

    // No mission/capabilities/qualification/restrictions and no notOffered limits,
    // so the read-only portrait renders nothing — only the editable blocks remain.
    expect(screen.queryByLabelText('Resumo do agente')).toBeNull()
    expect(screen.queryByText('Capacidades ativas')).toBeNull()
    expect(screen.queryByText('Missão')).toBeNull()
    expect(
      screen.queryByText('O que o agente nunca pode prometer'),
    ).toBeNull()
  })

  it('renders the read-only business portrait derived from the state (FR-53)', () => {
    render(
      <Harness
        value={makeState(undefined, {
          mission: { key: 'sdr_qualificar', label: 'SDR — Qualificar leads' },
          handoff: { mode: 'roleta', alsoSchedule: true, steps: [], members: [] },
          pricing: {
            items: [{ name: 'Consulta', priceCents: 20000 }],
            currency: 'BRL',
            disclosureStyle: 'exact',
          },
          proactive: {
            followUp: true,
            reminders: false,
            importantDates: false,
          },
          qualification: { fields: ['Prazo de compra', 'Faixa de orcamento'] },
          restrictions: { soldOutStrategy: 'human_confirm' },
          services: {
            offered: ['Consulta inicial'],
            notOffered: ['Diagnostico garantido'],
          },
        })}
        onSubmit={vi.fn()}
      />,
    )

    // Mission + all active-capability + qualification + restriction sections show.
    expect(screen.getByText('SDR — Qualificar leads')).toBeInTheDocument()
    expect(screen.getByText('Capacidades ativas')).toBeInTheDocument()
    expect(
      screen.getByText(/Transferir para humano:/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Agenda:/)).toBeInTheDocument()
    expect(screen.getByText(/Mensagens proativas:/)).toBeInTheDocument()
    expect(screen.getByText('Critérios de qualificação')).toBeInTheDocument()
    expect(screen.getByText('Prazo de compra')).toBeInTheDocument()
    expect(screen.getByText('Restrições comerciais')).toBeInTheDocument()

    // "Never promise" derives from human_confirm restriction + notOffered service.
    expect(
      screen.getByText('O que o agente nunca pode prometer'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/sem um consultor validar antes/),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Não oferecer/prometer: Diagnostico garantido.'),
    ).toBeInTheDocument()
  })
})
