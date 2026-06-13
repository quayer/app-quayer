import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  MissionCard,
  type MissionPayload,
} from '@/client/components/projetos/chat/cards/mission-card'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import {
  parseBuilderState,
  patchBuilderState,
  type BuilderState,
} from '@/server/ai-module/builder/cards/builder-state'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

function emptyState(): BuilderState {
  return parseBuilderState({ missionFirst: true })
}

function stateWithMission(mission: BuilderState['mission']): BuilderState {
  return patchBuilderState(parseBuilderState({ missionFirst: true }), {
    mission,
  })
}

function Harness({
  value,
  disabled = false,
  onSubmit,
}: {
  value: BuilderState
  disabled?: boolean
  onSubmit: (payload: MissionPayload) => void
}) {
  const { tokens } = useAppTokens()

  return (
    <MissionCard
      projectId="proj-1"
      cardKey="mission"
      value={value}
      disabled={disabled}
      onSubmit={onSubmit}
      tokens={tokens}
    />
  )
}

function renderCard({
  value = emptyState(),
  disabled,
  onSubmit = vi.fn(),
}: {
  value?: BuilderState
  disabled?: boolean
  onSubmit?: (payload: MissionPayload) => void
} = {}) {
  render(<Harness value={value} disabled={disabled} onSubmit={onSubmit} />)
  return { onSubmit }
}

describe('MissionCard', () => {
  it('renders the mission presets and the "montar do zero" option', () => {
    renderCard()

    expect(screen.getByText('Qual a missão do agente?')).toBeInTheDocument()
    expect(screen.getByText('Captar e qualificar (SDR)')).toBeInTheDocument()
    expect(screen.getByText('Agendar visita')).toBeInTheDocument()
    expect(screen.getByText('Montar do zero')).toBeInTheDocument()
  })

  it('keeps confirm disabled until a mission is selected', () => {
    renderCard()

    expect(
      screen.getByRole('button', { name: /Confirmar missão/i }),
    ).toBeDisabled()
  })

  it('submits the typed preset payload with the internal resolution', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCard()

    await user.click(screen.getByText('Agendar visita'))
    await user.click(screen.getByRole('button', { name: /Confirmar missão/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toEqual({
      cardKey: 'mission',
      key: 'agendar_visita',
      label: 'Agendar visita',
      role: 'secretaria',
      objective: 'agendar',
      addons: ['agenda'],
      custom: false,
    })
  })

  it('submits a custom mission with the typed name and custom flag', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCard()

    await user.click(screen.getByText('Montar do zero'))
    // Confirm stays disabled until the custom name is filled.
    expect(
      screen.getByRole('button', { name: /Confirmar missão/i }),
    ).toBeDisabled()

    await user.type(
      screen.getByPlaceholderText(/Receber pedidos/i),
      'Receber pedidos do cardápio',
    )
    await user.click(screen.getByRole('button', { name: /Confirmar missão/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toEqual({
      cardKey: 'mission',
      key: 'Receber pedidos do cardápio',
      label: 'Receber pedidos do cardápio',
      custom: true,
    })
  })

  it('pre-selects the persisted preset mission', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCard({
      value: stateWithMission({
        key: 'tirar_duvidas',
        label: 'Tirar dúvidas',
        role: 'suporte',
        objective: 'suportar',
        addons: [],
        custom: false,
      }),
    })

    const option = screen.getByRole('radio', { name: /Tirar dúvidas/i })
    expect(option).toHaveAttribute('aria-checked', 'true')

    // Confirm is already enabled from the pre-selection.
    await user.click(screen.getByRole('button', { name: /Confirmar missão/i }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].key).toBe('tirar_duvidas')
  })

  it('pre-fills the custom path when the persisted mission is custom', () => {
    renderCard({
      value: stateWithMission({
        key: 'Atendimento de cobrança',
        label: 'Atendimento de cobrança',
        addons: [],
        custom: true,
      }),
    })

    const customRadio = screen.getByRole('radio', { name: /Montar do zero/i })
    expect(customRadio).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByDisplayValue('Atendimento de cobrança'),
    ).toBeInTheDocument()
  })

  it('disables every option and confirm while the chat is streaming', () => {
    renderCard({ disabled: true })

    expect(
      screen.getByRole('radio', { name: /Captar e qualificar/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /Confirmar missão/i }),
    ).toBeDisabled()
  })
})
