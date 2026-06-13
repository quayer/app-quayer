import { describe, expect, it } from 'vitest'

import { shouldUseChatOnlyLayout } from '@/client/components/projetos/workspace-layout'
import type { Readiness } from '@/server/ai-module/builder/state/readiness.types'

const AGENT = {
  id: 'agent-1',
  name: 'Suporte',
  provider: 'openai',
  model: 'gpt-4o-mini',
  systemPrompt: 'Voce e um assistente de atendimento via WhatsApp.',
}

function readiness(activePhaseId: 'conhecer' | 'revisar'): Pick<Readiness, 'journey'> {
  return {
    journey: {
      version: 2,
      activePhaseId,
      phases: [],
    },
  }
}

describe('shouldUseChatOnlyLayout', () => {
  it('keeps a fresh v2 project chat-only before the first readiness snapshot', () => {
    expect(
      shouldUseChatOnlyLayout({
        project: { journeyVersion: 2, aiAgent: null },
        readiness: undefined,
      }),
    ).toBe(true)
  })

  it('keeps the layout chat-only while v2 is in Conhecer', () => {
    expect(
      shouldUseChatOnlyLayout({
        project: { journeyVersion: 2, aiAgent: null },
        readiness: readiness('conhecer'),
      }),
    ).toBe(true)
  })

  it('allows split layout once v2 reaches Revisar', () => {
    expect(
      shouldUseChatOnlyLayout({
        project: { journeyVersion: 2, aiAgent: null },
        readiness: readiness('revisar'),
      }),
    ).toBe(false)
  })

  it('preserves the v1 split layout while readiness is still loading', () => {
    expect(
      shouldUseChatOnlyLayout({
        project: { journeyVersion: 1, aiAgent: null },
        readiness: undefined,
      }),
    ).toBe(false)
  })

  it('lets v2 projects with an agent show the preview loading shell', () => {
    expect(
      shouldUseChatOnlyLayout({
        project: { journeyVersion: 2, aiAgent: AGENT },
        readiness: undefined,
      }),
    ).toBe(false)
  })
})
