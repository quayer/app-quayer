/**
 * T71 — Unit: `visibleWhen` v2 (revelação progressiva) vs locked v1 (regressão).
 *
 * Cobre os DOIS regimes de `getTabsForProjectWithLocked` (tab-registry.tsx,
 * FR-19, plan §4.4), selecionados por `readiness.journey`:
 *
 *   - **v2** (`journey` presente): cada tab consulta seu `visibleWhen` e as
 *     não-acionáveis são FILTRADAS (invisíveis) — nunca "visível-porém-travada".
 *     Toda tab visível volta sempre destravada (`locked: false`).
 *   - **v1** (sem `journey`): comportamento legado intocado (NFR-03) — tabs
 *     aparecem na strip travadas até o agente existir/publicar; `visibleWhen`
 *     é IGNORADO.
 *
 * Mora em `test/unit/react/builder/` (e não co-localizado em `src`) porque
 * `npm run test:react` só varre os `.test.tsx` sob `test/unit/react` — é onde os
 * demais testes do Builder vivem (ver `preview-tabs-whatsapp.test.tsx`).
 */

import { describe, expect, it, vi } from 'vitest'

// O `tab-registry.tsx` importa estaticamente os 9 componentes de tab para os
// `render`. Vários deles puxam o cliente Igniter (`@/igniter.client`), que no
// browser dá `require('./igniter.schema')` — arquivo auto-gerado ausente no
// ambiente de teste. As funções sob teste (`getTabsForProjectWithLocked`,
// `isProjectPublished`) são lógica PURA e nunca chamam `render`, então um stub
// deep-proxy do cliente quebra a cadeia de import sem tocar no registry.
vi.mock('@/igniter.client', () => {
  const noopQuery = { data: undefined, isLoading: false, error: null, refetch: () => {} }
  const noopMutation = {
    mutate: () => {},
    mutateAsync: async () => ({}),
    isPending: false,
    error: null,
  }
  const makeActionStub = (): unknown => {
    const fn = () => noopQuery
    Object.assign(fn, {
      useQuery: () => noopQuery,
      useMutation: () => noopMutation,
      query: async () => noopQuery,
      mutate: () => noopQuery,
    })
    return new Proxy(fn, {
      get(target: Record<string, unknown>, prop: string) {
        if (prop in target) return target[prop]
        return makeActionStub()
      },
    })
  }
  const api = new Proxy({} as Record<string, unknown>, {
    get: () =>
      new Proxy({} as Record<string, unknown>, { get: () => makeActionStub() }),
  })
  return {
    api,
    useIgniterQueryClient: () => ({ invalidate: () => {}, invalidateQuery: () => {} }),
    getAuthToken: () => null,
    getAuthHeaders: () => ({}),
  }
})

import type { WorkspaceProject } from '@/client/components/projetos/types'
import {
  getTabsForProjectWithLocked,
  isProjectPublished,
} from '@/client/components/projetos/preview/tab-registry'
import type { PhaseId, Readiness } from '@/server/ai-module/builder/state/readiness.types'
import { DEFAULT_AGENT_RUNTIME_SETTINGS } from '@/lib/agent-runtime-settings'

function makeProject(overrides: Partial<WorkspaceProject> = {}): WorkspaceProject {
  return {
    id: 'proj-1',
    name: 'Assistente WhatsApp',
    type: 'ai_agent',
    status: 'draft',
    aiAgentId: null,
    aiAgent: null,
    runtimeSettings: DEFAULT_AGENT_RUNTIME_SETTINGS,
    hasWhatsAppConnection: false,
    ...overrides,
  }
}

const AGENT = {
  id: 'agent-1',
  name: 'Suporte',
  provider: 'openai',
  model: 'gpt-4o-mini',
  systemPrompt:
    'Voce e um assistente de atendimento via WhatsApp para responder clientes com clareza.',
}

/** Readiness v2 com a fase ativa em `activePhaseId` — `journey` presente. */
function makeJourneyReadiness(activePhaseId: PhaseId): Readiness {
  return {
    step: { id: 'agent_review', title: 'Revisar agente', ask: 'Confira o agente' },
    requiredMissing: [],
    completenessPct: 40,
    isDeployReady: false,
    blockers: [],
    fieldOwnership: {},
    steps: [],
    journey: {
      version: 2,
      activePhaseId,
      phases: [
        { id: 'conhecer', title: 'Conhecer', status: 'pending', steps: [] },
        { id: 'revisar', title: 'Revisar', status: 'pending', steps: [] },
        { id: 'testar', title: 'Testar', status: 'pending', steps: [] },
        { id: 'lancar', title: 'Lançar', status: 'pending', steps: [] },
      ],
    },
  }
}

function tabValues(tabs: { value: string }[]): string[] {
  return tabs.map((t) => t.value)
}

// ──────────────────────────────────────────────────────────────────────────
// v2 — revelação progressiva: tabs não-acionáveis FILTRADAS (invisíveis)
// ──────────────────────────────────────────────────────────────────────────

describe('getTabsForProjectWithLocked — v2 (journey presente)', () => {
  it('fase "conhecer" sem agente: NENHUMA tab acionável aparece (todas filtradas)', () => {
    const tabs = getTabsForProjectWithLocked(
      makeProject(),
      makeJourneyReadiness('conhecer'),
    )
    // overview/knowledge/media/credentials/advanced exigem fase >= revisar;
    // prompt/playground/deploy exigem agente; activity exige publicado.
    expect(tabs).toHaveLength(0)
  })

  it('fase "revisar" sem agente: surgem só as tabs por-fase (sem as que exigem agente)', () => {
    const tabs = getTabsForProjectWithLocked(
      makeProject(),
      makeJourneyReadiness('revisar'),
    )
    // overview/knowledge/media/credentials/advanced abrem na fase Revisar.
    // prompt/playground/deploy ainda NÃO (sem agente). activity NÃO (não publicado).
    expect(tabValues(tabs)).toEqual([
      'overview',
      'knowledge',
      'media',
      'credentials',
      'advanced',
    ])
  })

  it('fase "revisar" COM agente: prompt/playground/deploy também aparecem', () => {
    const tabs = getTabsForProjectWithLocked(
      makeProject({ aiAgentId: 'agent-1', aiAgent: AGENT }),
      makeJourneyReadiness('revisar'),
    )
    // Ordem segue o TAB_REGISTRY: overview → prompt → knowledge → media →
    // playground → (activity ausente) → deploy → credentials → advanced.
    expect(tabValues(tabs)).toEqual([
      'overview',
      'prompt',
      'knowledge',
      'media',
      'playground',
      'deploy',
      'credentials',
      'advanced',
    ])
    expect(tabValues(tabs)).not.toContain('activity')
  })

  it('agente publicado: "atividade" passa a ser visível na v2', () => {
    const tabs = getTabsForProjectWithLocked(
      makeProject({
        aiAgentId: 'agent-1',
        aiAgent: AGENT,
        status: 'production',
      }),
      makeJourneyReadiness('lancar'),
    )
    expect(tabValues(tabs)).toContain('activity')
  })

  it('toda tab visível em v2 vem SEMPRE destravada (nunca visível-porém-bloqueada)', () => {
    const tabs = getTabsForProjectWithLocked(
      makeProject({
        aiAgentId: 'agent-1',
        aiAgent: AGENT,
        hasWhatsAppConnection: true,
      }),
      makeJourneyReadiness('lancar'),
    )
    expect(tabs.length).toBeGreaterThan(0)
    for (const tab of tabs) {
      expect(tab.locked).toBe(false)
      expect(tab.lockedReason).toBeNull()
    }
  })

  it('respeita visibleFor por tipo de projeto mesmo no regime v2', () => {
    const tabs = getTabsForProjectWithLocked(
      // type fora de 'ai_agent' → só as tabs _core (overview) são elegíveis.
      makeProject({ type: 'wa_campaign' }),
      makeJourneyReadiness('revisar'),
    )
    // 'overview' não tem visibleFor (todas), as demais são `visibleFor: ['ai_agent']`.
    expect(tabValues(tabs)).toEqual(['overview'])
  })
})

// ──────────────────────────────────────────────────────────────────────────
// v1 — comportamento locked legado intocado (regressão, NFR-03)
// ──────────────────────────────────────────────────────────────────────────

describe('getTabsForProjectWithLocked — v1 (sem journey)', () => {
  it('sem agente: tabs requiresAgent APARECEM na strip porém travadas (não filtradas)', () => {
    const tabs = getTabsForProjectWithLocked(makeProject())
    const byValue = new Map(tabs.map((t) => [t.value, t]))

    // requiresAgent → presente, mas locked com a copy de agente.
    for (const value of ['prompt', 'playground', 'deploy', 'advanced']) {
      const tab = byValue.get(value)
      expect(tab, `tab ${value} deve existir na v1`).toBeDefined()
      expect(tab?.locked).toBe(true)
      expect(tab?.lockedReason).toBeTruthy()
    }

    // overview/knowledge/media/credentials não exigem agente → destravadas.
    for (const value of ['overview', 'knowledge', 'media', 'credentials']) {
      const tab = byValue.get(value)
      expect(tab?.locked).toBe(false)
      expect(tab?.lockedReason).toBeNull()
    }

    // requiresPublished (atividade) é removida da strip até publicar — v1.
    expect(byValue.has('activity')).toBe(false)
  })

  it('com agente: tabs requiresAgent destravam (deploy via gate compartilhado)', () => {
    const tabs = getTabsForProjectWithLocked(
      makeProject({ aiAgentId: 'agent-1', aiAgent: AGENT }),
    )
    const byValue = new Map(tabs.map((t) => [t.value, t]))

    for (const value of ['prompt', 'playground', 'deploy', 'advanced']) {
      const tab = byValue.get(value)
      expect(tab?.locked, `tab ${value} deve destravar com agente`).toBe(false)
      expect(tab?.lockedReason).toBeNull()
    }
  })

  it('publicado: "atividade" entra na strip (e a strip não usa visibleWhen)', () => {
    const tabs = getTabsForProjectWithLocked(
      makeProject({
        aiAgentId: 'agent-1',
        aiAgent: AGENT,
        hasWhatsAppConnection: true,
      }),
    )
    expect(tabValues(tabs)).toContain('activity')
  })

  it('v1 NUNCA filtra por fase: a strip independe de readiness.journey', () => {
    // Mesmo passando um readiness SEM journey, o conjunto de tabs é o legado
    // completo (todas elegíveis por tipo), não o subconjunto por fase da v2.
    const v1Readiness: Readiness = {
      step: { id: 'objective', title: 'Objetivo', ask: 'Qual o objetivo?' },
      requiredMissing: [],
      completenessPct: 0,
      isDeployReady: false,
      blockers: [],
      fieldOwnership: {},
      steps: [],
      // sem `journey` → v1
    }
    const tabs = getTabsForProjectWithLocked(makeProject(), v1Readiness)
    // overview presente + as 4 sempre-elegíveis-sem-agente, e prompt etc. travadas.
    expect(tabValues(tabs)).toContain('overview')
    expect(tabValues(tabs)).toContain('prompt') // presente porém locked
    expect(tabs.find((t) => t.value === 'prompt')?.locked).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// Contraste direto v1 vs v2 — o ponto central de T71
// ──────────────────────────────────────────────────────────────────────────

describe('v1 locked vs v2 filtrado — mesmo projeto, dois regimes', () => {
  it('mesma "prompt" sem agente: v1 mostra travada, v2 esconde', () => {
    const project = makeProject() // sem agente

    const v1 = getTabsForProjectWithLocked(project)
    const v1Prompt = v1.find((t) => t.value === 'prompt')
    expect(v1Prompt).toBeDefined()
    expect(v1Prompt?.locked).toBe(true)

    const v2 = getTabsForProjectWithLocked(project, makeJourneyReadiness('revisar'))
    expect(v2.find((t) => t.value === 'prompt')).toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// isProjectPublished — predicado compartilhado por ambos os regimes
// ──────────────────────────────────────────────────────────────────────────

describe('isProjectPublished', () => {
  it('true com conexão WhatsApp viva OU status production', () => {
    expect(isProjectPublished(makeProject({ hasWhatsAppConnection: true }))).toBe(true)
    expect(isProjectPublished(makeProject({ status: 'production' }))).toBe(true)
  })

  it('false em draft sem conexão (aiAgentId sozinho não publica)', () => {
    expect(
      isProjectPublished(makeProject({ aiAgentId: 'agent-1', aiAgent: AGENT })),
    ).toBe(false)
  })
})
