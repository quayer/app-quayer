import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  RestrictionsCard,
  type RestrictionsPayload,
} from '@/client/components/projetos/chat/cards/restrictions-card'
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

function stateWithRestrictions(
  restrictions: BuilderState['restrictions'],
): BuilderState {
  return patchBuilderState(parseBuilderState({ missionFirst: true }), {
    restrictions,
  })
}

function Harness({
  value,
  disabled = false,
  onSubmit,
}: {
  value: BuilderState
  disabled?: boolean
  onSubmit: (payload: RestrictionsPayload) => void
}) {
  const { tokens } = useAppTokens()

  return (
    <RestrictionsCard
      projectId="proj-1"
      cardKey="restrictions"
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
  onSubmit?: (payload: RestrictionsPayload) => void
} = {}) {
  render(<Harness value={value} disabled={disabled} onSubmit={onSubmit} />)
  return { onSubmit }
}

describe('RestrictionsCard', () => {
  it('renders the 3 sold-out strategies', () => {
    renderCard()

    expect(screen.getByText('Restrições comerciais')).toBeInTheDocument()
    expect(screen.getByText('Lista de interesse')).toBeInTheDocument()
    expect(screen.getByText('Confirmar com consultor')).toBeInTheDocument()
    expect(screen.getByText('Tenho disponibilidade')).toBeInTheDocument()
  })

  it('keeps confirm disabled until a strategy is selected', () => {
    renderCard()

    expect(
      screen.getByRole('button', { name: /Confirmar restrição/i }),
    ).toBeDisabled()
  })

  it('submits the selected strategy without a note when empty', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCard()

    await user.click(screen.getByText('Lista de interesse'))
    await user.click(
      screen.getByRole('button', { name: /Confirmar restrição/i }),
    )

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toEqual({
      cardKey: 'restrictions',
      soldOutStrategy: 'interest_list',
    })
  })

  it('submits the strategy together with a trimmed note', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCard()

    await user.click(screen.getByText('Confirmar com consultor'))
    await user.type(
      screen.getByLabelText(/Observação/i),
      'Temos uma fase nova em pré-lançamento.',
    )
    await user.click(
      screen.getByRole('button', { name: /Confirmar restrição/i }),
    )

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toEqual({
      cardKey: 'restrictions',
      soldOutStrategy: 'human_confirm',
      note: 'Temos uma fase nova em pré-lançamento.',
    })
  })

  it('pre-selects the persisted strategy and note', () => {
    renderCard({
      value: stateWithRestrictions({
        soldOutStrategy: 'available_confirmed',
        note: 'Confirmado por telefone.',
      }),
    })

    expect(
      screen.getByRole('radio', { name: /Tenho disponibilidade/i }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByDisplayValue('Confirmado por telefone.')).toBeInTheDocument()
  })

  it('disables every option and confirm while the chat is streaming', () => {
    renderCard({ disabled: true })

    expect(
      screen.getByRole('radio', { name: /Lista de interesse/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /Confirmar restrição/i }),
    ).toBeDisabled()
  })
})
