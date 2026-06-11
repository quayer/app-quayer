import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ActivationModeCard } from '@/client/components/projetos/chat/cards/activation-mode-card'
import { PreviewSummaryCard } from '@/client/components/projetos/chat/cards/preview-summary-card'
import {
  deriveActiveCapabilities,
  JOURNEY_V2_PHASE_TITLES,
} from '@/client/components/projetos/chat/cards/preview-summary-helpers'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import {
  parseBuilderState,
  patchBuilderState,
  type BuilderState,
} from '@/server/ai-module/builder/cards/builder-state'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A fully-defaulted v1 state (journeyVersion: 1, everything pending). */
function v1State(): BuilderState {
  return parseBuilderState({})
}

/**
 * A v2 state. Defaults to handoff OFF (`nenhum`) and no pricing so the summary
 * must NOT surface a mandatory transfer/pricing section (the FR-31 contrast).
 */
function v2State(overrides: Partial<BuilderState> = {}): BuilderState {
  const base = patchBuilderState(parseBuilderState({}), {
    journeyVersion: 2,
    persona: { name: 'Aurora', tone: 'amigável' },
    services: { offered: ['Corte', 'Coloração'], notOffered: [] },
    handoff: { mode: 'nenhum' },
  })
  return { ...base, ...overrides }
}

// ── Harness that supplies the real design tokens ─────────────────────────────

function ActivationHarness({ value }: { value: BuilderState }) {
  const { tokens } = useAppTokens()
  return (
    <ActivationModeCard
      projectId="proj-1"
      cardKey="activation_mode"
      value={value}
      onSubmit={() => {}}
      tokens={tokens}
    />
  )
}

function SummaryHarness({ value }: { value: BuilderState }) {
  const { tokens } = useAppTokens()
  return (
    <PreviewSummaryCard
      projectId="proj-1"
      cardKey="preview_summary"
      value={value}
      onSubmit={() => {}}
      tokens={tokens}
    />
  )
}

// ── T52 — activation default "responder todas" (FR-14) ───────────────────────

describe('ActivationModeCard default (T52, FR-14)', () => {
  it('opens with "Toda mensagem" (mode=all) pre-selected on a fresh state', () => {
    render(<ActivationHarness value={v1State()} />)

    const allOption = screen.getByRole('radio', { name: /Toda mensagem/ })
    expect(allOption).toHaveAttribute('aria-checked', 'true')
  })

  it('ignores any captured activation proposal — FR-14 default still wins', () => {
    const proposed = patchBuilderState(parseBuilderState({}), {
      capturedProposals: { activation: { mode: 'keyword_trigger' } },
    })
    render(<ActivationHarness value={proposed} />)

    const allOption = screen.getByRole('radio', { name: /Toda mensagem/ })
    expect(allOption).toHaveAttribute('aria-checked', 'true')
  })

  it('respects an OWNED confirmed mode (persisted) over the default', () => {
    const persisted = patchBuilderState(parseBuilderState({}), {
      activation: { mode: 'keyword_trigger', keywords: ['orçamento'] },
    })
    render(<ActivationHarness value={persisted} />)

    const allOption = screen.getByRole('radio', { name: /Toda mensagem/ })
    expect(allOption).toHaveAttribute('aria-checked', 'false')
  })
})

// ── T98 — summary v2-aware (FR-31) ───────────────────────────────────────────

describe('deriveActiveCapabilities (T98, FR-31)', () => {
  it('lists ONLY Conhecimento when handoff/pricing/calendar are off', () => {
    const caps = deriveActiveCapabilities(v2State())
    expect(caps.map((c) => c.key)).toEqual(['knowledge'])
  })

  it('adds Transferir when handoff mode is active', () => {
    const caps = deriveActiveCapabilities(v2State({ handoff: { ...v2State().handoff, mode: 'solo' } }))
    expect(caps.map((c) => c.key)).toContain('handoff')
  })

  it('adds Preços when there is a priced catalog with disclosure', () => {
    const withPricing = v2State({
      pricing: {
        items: [{ name: 'Corte', priceCents: 5000 }],
        currency: 'BRL',
        disclosureStyle: 'exact',
      },
    })
    const caps = deriveActiveCapabilities(withPricing)
    expect(caps.map((c) => c.key)).toContain('pricing')
  })

  it('omits Preços when disclosureStyle is none', () => {
    const muted = v2State({
      pricing: {
        items: [{ name: 'Corte', priceCents: 5000 }],
        currency: 'BRL',
        disclosureStyle: 'none',
      },
    })
    expect(deriveActiveCapabilities(muted).map((c) => c.key)).not.toContain('pricing')
  })
})

describe('PreviewSummaryCard v2 branch render (T98, FR-31)', () => {
  it('renders the 4 phase chips instead of the fixed v1 sections', () => {
    render(<SummaryHarness value={v2State()} />)

    const total = JOURNEY_V2_PHASE_TITLES.length
    JOURNEY_V2_PHASE_TITLES.forEach((title, index) => {
      expect(
        screen.getByText(`Fase ${index + 1} de ${total} — ${title}`),
      ).toBeInTheDocument()
    })
  })

  it('with handoff OFF, shows NO mandatory transfer section', () => {
    render(<SummaryHarness value={v2State()} />)

    // The v1 fixed section title for handoff must NOT appear in the v2 branch.
    expect(screen.queryByText('Passagem para humano')).not.toBeInTheDocument()
    // Conhecimento is always active and surfaces as a capability.
    expect(screen.getByText('Conhecimento')).toBeInTheDocument()
    // Confirm button keeps the same submit affordance as v1.
    expect(
      screen.getByRole('button', { name: /Tudo certo, publicar/ }),
    ).toBeInTheDocument()
  })

  it('surfaces an active capability section when handoff is on', () => {
    render(
      <SummaryHarness value={v2State({ handoff: { ...v2State().handoff, mode: 'roleta' } })} />,
    )
    expect(screen.getByText('Transferir para humano')).toBeInTheDocument()
  })
})

// ── T98 — v1 render stays byte-intact (NFR-03) ───────────────────────────────

describe('PreviewSummaryCard v1 path unchanged (T98, NFR-03)', () => {
  it('still renders the 6 fixed v1 sections for a journeyVersion:1 project', () => {
    render(<SummaryHarness value={v1State()} />)

    expect(screen.getByText('Personalidade')).toBeInTheDocument()
    expect(screen.getByText('Serviços')).toBeInTheDocument()
    expect(screen.getByText('Horários')).toBeInTheDocument()
    expect(screen.getByText('Preços')).toBeInTheDocument()
    expect(screen.getByText('Passagem para humano')).toBeInTheDocument()
    expect(screen.getByText('Ativação')).toBeInTheDocument()
  })
})
