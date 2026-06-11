/**
 * Tests for buildJourneyBanner (PURE renderer).
 *
 * We construct fake `Readiness` snapshots structurally (the engine that owns the
 * real type lives in `state/readiness.types.ts`, created by a sibling). The
 * banner only reads a small, documented surface of `Readiness`, so a structural
 * literal cast through `unknown` keeps these tests decoupled from the engine's
 * exact type while still exercising the real rendering paths.
 */

import { describe, it, expect } from 'vitest'
import { buildJourneyBanner } from './build-journey-banner'
import { BUILDER_JOURNEY_RULES } from '../../prompts/journey-rules'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface FakeBlocker {
  check: string
  message: string
  cta?: string
  redirect?: string
}

interface FakePhase {
  id: string
  title: string
  steps: Array<{ id: string; title: string; done: boolean }>
  status: 'done' | 'active' | 'pending'
}

interface FakeReadiness {
  step?: { id?: string; title?: string; ask?: string }
  requiredMissing?: string[]
  completenessPct?: number
  isDeployReady?: boolean
  blockers?: FakeBlocker[]
  fieldOwnership?: Record<string, 'card' | 'livre'>
  steps?: Array<{ id: string; title: string; done: boolean }>
  journey?: {
    version: 2
    activePhaseId: string
    phases: FakePhase[]
  }
}

/** Cast helper — the banner accepts `Readiness | undefined`. */
function asReadiness(fake: FakeReadiness): Parameters<typeof buildJourneyBanner>[0] {
  return fake as unknown as Parameters<typeof buildJourneyBanner>[0]
}

const FULL: FakeReadiness = {
  step: {
    id: 'persona',
    title: 'Definir a persona do agente',
    ask: 'Qual o nome e o tom de voz do seu agente?',
  },
  requiredMissing: ['persona.name', 'persona.tone'],
  completenessPct: 42,
  isDeployReady: false,
  blockers: [
    { check: 'channel', message: 'Nenhum canal WhatsApp configurado.', cta: 'Use create_whatsapp_instance' },
    { check: 'plan', message: 'Plano inativo.' },
  ],
  fieldOwnership: {
    persona: 'card',
    'project.objective': 'livre',
  },
  steps: [
    { id: 'persona', title: 'Persona', done: false },
    { id: 'services', title: 'Serviços', done: false },
  ],
}

// ---------------------------------------------------------------------------
// NEXT STEP
// ---------------------------------------------------------------------------

describe('buildJourneyBanner — PRÓXIMO PASSO', () => {
  it('renders the next step title and ask from readiness', () => {
    const out = buildJourneyBanner(asReadiness(FULL), 'estado x')
    expect(out).toContain('# PRÓXIMO PASSO')
    expect(out).toContain('Definir a persona do agente')
    expect(out).toContain('Qual o nome e o tom de voz do seu agente?')
  })

  it('falls back to a generic step title when title is missing', () => {
    const out = buildJourneyBanner(
      asReadiness({ ...FULL, step: { id: 'x' } }),
      'estado x',
    )
    expect(out).toContain('# PRÓXIMO PASSO')
    expect(out).toContain('Definir próximo passo')
  })

  it('surfaces requiredMissing field paths for the active step', () => {
    const out = buildJourneyBanner(asReadiness(FULL), 'estado x')
    expect(out).toContain('Campos obrigatórios faltando:')
    expect(out).toContain('`persona.name`')
    expect(out).toContain('`persona.tone`')
  })

  it('omits the missing-fields list when requiredMissing is empty', () => {
    const out = buildJourneyBanner(
      asReadiness({ ...FULL, requiredMissing: [] }),
      'estado x',
    )
    expect(out).not.toContain('Campos obrigatórios faltando:')
  })
})

// ---------------------------------------------------------------------------
// PRÓXIMO PASSO — v2-aware active phase line ("Fase 2 de 4 — Revisar")
// ---------------------------------------------------------------------------

const PHASES: FakePhase[] = [
  { id: 'conhecer', title: 'Conhecer', steps: [], status: 'done' },
  { id: 'revisar', title: 'Revisar', steps: [], status: 'active' },
  { id: 'testar', title: 'Testar', steps: [], status: 'pending' },
  { id: 'lancar', title: 'Lançar', steps: [], status: 'pending' },
]

const V2: FakeReadiness = {
  ...FULL,
  journey: { version: 2, activePhaseId: 'revisar', phases: PHASES },
}

describe('buildJourneyBanner — PRÓXIMO PASSO (journey v2)', () => {
  it('prepends the active phase line under the header when journey is present', () => {
    const out = buildJourneyBanner(asReadiness(V2), 'estado x')
    expect(out).toContain('# PRÓXIMO PASSO')
    expect(out).toContain('Fase 2 de 4 — Revisar')
    // The phase line sits between the header and the step title.
    const header = out.indexOf('# PRÓXIMO PASSO')
    const phase = out.indexOf('Fase 2 de 4 — Revisar')
    const title = out.indexOf('Definir a persona do agente')
    expect(header).toBeLessThan(phase)
    expect(phase).toBeLessThan(title)
  })

  it('still renders the step title and ask alongside the phase line', () => {
    const out = buildJourneyBanner(asReadiness(V2), 'estado x')
    expect(out).toContain('Definir a persona do agente')
    expect(out).toContain('Qual o nome e o tom de voz do seu agente?')
  })

  it('renders the v1 banner verbatim when journey is absent (no phase line)', () => {
    const out = buildJourneyBanner(asReadiness(FULL), 'estado x')
    expect(out).not.toContain('Fase ')
    expect(out).not.toContain('— Revisar')
  })

  it('reflects a different active phase index', () => {
    const out = buildJourneyBanner(
      asReadiness({
        ...FULL,
        journey: { version: 2, activePhaseId: 'lancar', phases: PHASES },
      }),
      'estado x',
    )
    expect(out).toContain('Fase 4 de 4 — Lançar')
  })

  it('omits the phase line when the active phase id is unknown', () => {
    const out = buildJourneyBanner(
      asReadiness({
        ...FULL,
        journey: { version: 2, activePhaseId: 'inexistente', phases: PHASES },
      }),
      'estado x',
    )
    expect(out).toContain('# PRÓXIMO PASSO')
    expect(out).not.toContain('Fase ')
  })

  it('omits the phase line when there are no phases', () => {
    const out = buildJourneyBanner(
      asReadiness({
        ...FULL,
        journey: { version: 2, activePhaseId: 'revisar', phases: [] },
      }),
      'estado x',
    )
    expect(out).not.toContain('Fase ')
  })
})

// ---------------------------------------------------------------------------
// PRONTIDÃO — blockers + finalize-ready phrasing flip
// ---------------------------------------------------------------------------

describe('buildJourneyBanner — PRONTIDÃO', () => {
  it('surfaces completeness and required/missing blockers', () => {
    const out = buildJourneyBanner(asReadiness(FULL), 'estado x')
    expect(out).toContain('# PRONTIDÃO')
    expect(out).toContain('Completude: 42%')
    expect(out).toContain('Bloqueadores:')
    expect(out).toContain('[channel] Nenhum canal WhatsApp configurado.')
    expect(out).toContain('Use create_whatsapp_instance')
    expect(out).toContain('[plan] Plano inativo.')
  })

  it('flips the deploy-ready phrasing and drops blockers when finalize-ready', () => {
    const ready: FakeReadiness = {
      ...FULL,
      completenessPct: 100,
      isDeployReady: true,
      blockers: [],
    }
    const out = buildJourneyBanner(asReadiness(ready), 'estado x')
    expect(out).toContain('Completude: 100%')
    expect(out).toContain('Pronto para publicar: SIM')
    expect(out).not.toContain('Pronto para publicar: NÃO')
    expect(out).not.toContain('Bloqueadores:')
  })

  it('clamps out-of-range / non-finite completeness to 0..100', () => {
    expect(
      buildJourneyBanner(asReadiness({ ...FULL, completenessPct: 150 }), 's'),
    ).toContain('Completude: 100%')
    expect(
      buildJourneyBanner(asReadiness({ ...FULL, completenessPct: -10 }), 's'),
    ).toContain('Completude: 0%')
    expect(
      buildJourneyBanner(
        asReadiness({ ...FULL, completenessPct: Number.NaN }),
        's',
      ),
    ).toContain('Completude: 0%')
  })
})

// ---------------------------------------------------------------------------
// CAMPOS: card vs livre
// ---------------------------------------------------------------------------

describe('buildJourneyBanner — field ownership', () => {
  it('lists card and livre fields under the ownership section', () => {
    const out = buildJourneyBanner(asReadiness(FULL), 'estado x')
    expect(out).toContain('# CAMPOS: card vs livre')
    expect(out).toContain('Card (usar a interface):')
    expect(out).toContain('`persona`')
    expect(out).toContain('Livre (texto no chat):')
    expect(out).toContain('`project.objective`')
  })

  it('renders a placeholder when there are no mapped fields', () => {
    const out = buildJourneyBanner(
      asReadiness({ ...FULL, fieldOwnership: {} }),
      'estado x',
    )
    expect(out).toContain('# CAMPOS: card vs livre')
    expect(out).toContain('sem campos mapeados')
  })
})

// ---------------------------------------------------------------------------
// REGRAS DE JORNADA
// ---------------------------------------------------------------------------

describe('buildJourneyBanner — journey rules', () => {
  it('embeds the BUILDER_JOURNEY_RULES block', () => {
    const out = buildJourneyBanner(asReadiness(FULL), 'estado x')
    expect(out).toContain('# REGRAS DE JORNADA (livre)')
    expect(out).toContain(BUILDER_JOURNEY_RULES)
  })
})

// ---------------------------------------------------------------------------
// ESTADO ATUAL + undefined readiness fallback
// ---------------------------------------------------------------------------

describe('buildJourneyBanner — ESTADO ATUAL + fallback', () => {
  it('includes the passed stateSummary verbatim', () => {
    const out = buildJourneyBanner(asReadiness(FULL), 'Nome: Bot; Objetivo: vendas')
    expect(out).toContain('# ESTADO ATUAL')
    expect(out).toContain('Nome: Bot; Objetivo: vendas')
  })

  it('undefined readiness -> ESTADO ATUAL only, no throw, no other sections', () => {
    const out = buildJourneyBanner(undefined, 'somente estado')
    expect(out).toContain('# ESTADO ATUAL')
    expect(out).toContain('somente estado')
    expect(out).not.toContain('# PRÓXIMO PASSO')
    expect(out).not.toContain('# PRONTIDÃO')
    expect(out).not.toContain('# CAMPOS: card vs livre')
    expect(out).not.toContain('# REGRAS DE JORNADA')
  })

  it('undefined readiness AND no stateSummary -> placeholder, never throws', () => {
    expect(() => buildJourneyBanner(undefined)).not.toThrow()
    const out = buildJourneyBanner(undefined)
    expect(out).toContain('# ESTADO ATUAL')
    expect(out).toContain('sem estado registrado')
  })
})
