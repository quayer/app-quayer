import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  QualificationCard,
  type QualificationPayload,
} from '@/client/components/projetos/chat/cards/qualification-card'
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

function stateWithFields(fields: string[]): BuilderState {
  return patchBuilderState(parseBuilderState({ missionFirst: true }), {
    qualification: { fields },
  })
}

function Harness({
  value,
  disabled = false,
  onSubmit,
}: {
  value: BuilderState
  disabled?: boolean
  onSubmit: (payload: QualificationPayload) => void
}) {
  const { tokens } = useAppTokens()

  return (
    <QualificationCard
      projectId="proj-1"
      cardKey="qualification"
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
  onSubmit?: (payload: QualificationPayload) => void
} = {}) {
  render(<Harness value={value} disabled={disabled} onSubmit={onSubmit} />)
  return { onSubmit }
}

describe('QualificationCard', () => {
  it('renders the default qualification criteria', () => {
    renderCard()

    expect(
      screen.getByText('O que torna um atendimento bom?'),
    ).toBeInTheDocument()
    expect(screen.getByText('Nome do contato')).toBeInTheDocument()
    expect(screen.getByText('Prazo de compra')).toBeInTheDocument()
    expect(screen.getByText('Faixa de orçamento')).toBeInTheDocument()
  })

  it('submits the checked fields in the default-set order', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCard()

    // Click out of order; the payload must preserve the DEFAULT-set order.
    await user.click(screen.getByRole('checkbox', { name: /Prazo de compra/i }))
    await user.click(screen.getByRole('checkbox', { name: /Nome do contato/i }))

    await user.click(
      screen.getByRole('button', { name: /Confirmar critérios/i }),
    )

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toEqual({
      cardKey: 'qualification',
      fields: ['Nome do contato', 'Prazo de compra'],
    })
  })

  it('confirms with an empty list when nothing is checked', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCard()

    // Confirm is always enabled (the list may be empty).
    expect(
      screen.getByRole('button', { name: /Confirmar critérios/i }),
    ).toBeEnabled()

    await user.click(
      screen.getByRole('button', { name: /Confirmar critérios/i }),
    )

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toEqual({
      cardKey: 'qualification',
      fields: [],
    })
  })

  it('pre-checks fields persisted in value.qualification.fields', () => {
    renderCard({
      value: stateWithFields(['Faixa de orçamento', 'Região de interesse']),
    })

    expect(
      screen.getByRole('checkbox', { name: /Faixa de orçamento/i }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('checkbox', { name: /Região de interesse/i }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('checkbox', { name: /Nome do contato/i }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  it('toggles a pre-checked field off before submitting', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCard({
      value: stateWithFields(['Faixa de orçamento', 'Prazo de compra']),
    })

    await user.click(
      screen.getByRole('checkbox', { name: /Faixa de orçamento/i }),
    )
    await user.click(
      screen.getByRole('button', { name: /Confirmar critérios/i }),
    )

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toEqual({
      cardKey: 'qualification',
      fields: ['Prazo de compra'],
    })
  })

  it('disables every option and confirm while the chat is streaming', () => {
    renderCard({ disabled: true })

    expect(
      screen.getByRole('checkbox', { name: /Nome do contato/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /Confirmar critérios/i }),
    ).toBeDisabled()
  })
})
