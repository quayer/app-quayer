import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  BuildModeCard,
  type BuildModePayload,
} from '@/client/components/projetos/chat/cards/build-mode-card'
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

function stateWithMode(buildMode: BuilderState['buildMode']): BuilderState {
  return patchBuilderState(parseBuilderState({ missionFirst: true }), {
    buildMode,
  })
}

function Harness({
  value,
  disabled = false,
  onSubmit,
}: {
  value: BuilderState
  disabled?: boolean
  onSubmit: (payload: BuildModePayload) => void
}) {
  const { tokens } = useAppTokens()

  return (
    <BuildModeCard
      projectId="proj-1"
      cardKey="build_mode"
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
  onSubmit?: (payload: BuildModePayload) => void
} = {}) {
  render(<Harness value={value} disabled={disabled} onSubmit={onSubmit} />)
  return { onSubmit }
}

describe('BuildModeCard', () => {
  it('renders the 3 build modes in business language', () => {
    renderCard()

    expect(
      screen.getByText('Quanto você quer que eu assuma?'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Montar direto com boas práticas'),
    ).toBeInTheDocument()
    expect(screen.getByText('Pesquisar antes de sugerir')).toBeInTheDocument()
    expect(screen.getByText('Quero orientar a montagem')).toBeInTheDocument()
  })

  it('pre-selects "recomendado" by default and submits it', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCard()

    expect(
      screen.getByRole('radio', { name: /Montar direto com boas práticas/i }),
    ).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('button', { name: /^Confirmar$/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toEqual({
      cardKey: 'build_mode',
      mode: 'recomendado',
    })
  })

  it('submits the selected mode when the user changes it', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderCard()

    await user.click(screen.getByText('Pesquisar antes de sugerir'))
    await user.click(screen.getByRole('button', { name: /^Confirmar$/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toEqual({
      cardKey: 'build_mode',
      mode: 'pesquisa',
    })
  })

  it('pre-selects the persisted mode from value.buildMode', () => {
    renderCard({ value: stateWithMode('livre') })

    expect(
      screen.getByRole('radio', { name: /Quero orientar a montagem/i }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('radio', { name: /Montar direto com boas práticas/i }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  it('disables every option and confirm while the chat is streaming', () => {
    renderCard({ disabled: true })

    expect(
      screen.getByRole('radio', { name: /Pesquisar antes de sugerir/i }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Confirmar$/i })).toBeDisabled()
  })
})
