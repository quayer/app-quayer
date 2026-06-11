import { test, expect } from '@playwright/test'
import {
  startFixture,
  setIntegrationOverrideCookie,
  loginAndResolveOrg,
  seedPublishedProject,
  createIntegration,
  setCredentials,
  testIntegration,
  activateIntegration,
  pauseIntegration,
  runtimeVisibleToolNames,
  GENERIC_WEBHOOK_SLUG,
  GENERIC_WEBHOOK_TOOL_NAME,
  type SeededSession,
  type SeededProject,
} from './integration-e2e.helpers'
import type { IntegrationFixtureServer } from '../fixtures/integration-fixture-server'

/**
 * T56 — E2E fluxo 4: PARIDADE playground ⇄ produção (FR-08).
 *
 * specs/integration-builder/tasks.md T56 (Onda 4, depende de T33/T53):
 *   Uma integração ATIVA aparece na lista de tools do playground; uma PAUSADA NÃO
 *   aparece — mesmo `getCustomTools` em playground e produção.
 *
 * ── Sinal canônico (load-bearing) ─────────────────────────────────────────────
 * `getCustomTools(enabledTools, ctx)` (custom-tools.ts) é a ÚNICA função que monta
 * o catálogo de tools CUSTOM do runtime — chamada IDÊNTICA pelo playground
 * (processPlaygroundStream) e pela produção (prepare-agent-call.ts). Seu filtro:
 *   AgentTool CUSTOM, `isActive: true`, nome em `enabledTools`, E backing
 *   (`webhookUrl != null` OU `customIntegration.status='active' & deletedAt=null`).
 * Ativar uma integração espelha `AgentTool.isActive=true` + insere o nome em
 * `enabledTools`; pausar espelha `isActive=false` (NÃO remove de enabledTools, mas
 * o filtro `isActive` já a esconde). Logo, "o que o runtime expõe" = o resultado
 * dessa MESMA query.
 *   {@link runtimeVisibleToolNames} reproduz EXATAMENTE esse WHERE contra o test DB,
 * então a asserção é sobre o conjunto que AMBAS as superfícies veriam — provando a
 * paridade por construção (sem precisar do LLM nem de dois streams).
 *
 * ── COMO RODAR (CI-gated) ──────────────────────────────────────────────────────
 *   dev server: NODE_ENV=test + INTEGRATION_TEST_ALLOWED_HOSTS=127.0.0.1
 *   specs: TEST_DATABASE_URL exposto (login + seed + leitura de paridade).
 *   `npx playwright test --grep @integration test/e2e/builder/integration-parity.spec.ts`
 *
 * A ativação exige um teste OK; usamos o generic-webhook apontado ao fixture (URL
 * controlável) — alcançável quando 127.0.0.1 está na allowlist. Sem isso a spec
 * pula a perna de ativação (sem falha dura). `--list` sem env. Zero `any`.
 */

test.describe.configure({ mode: 'serial' })

let fixture: IntegrationFixtureServer
let session: SeededSession
let seeded: SeededProject

test.beforeAll(async () => {
  fixture = await startFixture()
})

test.afterAll(async () => {
  if (fixture) await fixture.close()
})

test.describe('Integration Builder — paridade playground/produção (T56)', () => {
  test('ativa aparece no catálogo do runtime; pausada NÃO (mesmo getCustomTools) @integration', async ({
    page,
  }) => {
    await setIntegrationOverrideCookie(page, 'on')
    session = await loginAndResolveOrg(page)
    seeded = await seedPublishedProject(session)

    // Baseline: antes de qualquer integração, o nome da tool de integração NÃO está
    // no catálogo que o runtime exporia (só o baseline `think` do agente seedado).
    const baseline = await runtimeVisibleToolNames(
      session.organizationId,
      seeded.agentConfigId
    )
    expect(
      baseline.has(GENERIC_WEBHOOK_TOOL_NAME),
      'tool de integração ainda não existe no catálogo do runtime'
    ).toBe(false)

    // Cria + valida + ativa uma integração de webhook genérico (URL → fixture).
    const integration = await createIntegration(
      page,
      seeded.projectId,
      GENERIC_WEBHOOK_SLUG,
      'Webhook paridade E2E'
    )
    await setCredentials(page, integration.id, {
      webhook_url: `${fixture.host}/ok`,
      webhook_secret: '',
    })
    const okTest = await testIntegration(page, integration.id)

    const reachable = okTest.outcome === 'success'
    test.skip(
      !reachable,
      'ativação requer teste OK contra o fixture: app server precisa de ' +
        'NODE_ENV=test + INTEGRATION_TEST_ALLOWED_HOSTS cobrindo 127.0.0.1.'
    )

    const activation = await activateIntegration(page, integration.id)
    expect(
      activation.ok,
      `ativação após teste OK (status ${activation.status})`
    ).toBeTruthy()

    // ── ATIVA: o nome da tool ENTRA no catálogo que o runtime exporia. ──────────
    const afterActivate = await runtimeVisibleToolNames(
      session.organizationId,
      seeded.agentConfigId
    )
    expect(
      afterActivate.has(GENERIC_WEBHOOK_TOOL_NAME),
      'integração ATIVA aparece no catálogo do runtime (playground = produção)'
    ).toBe(true)

    // ── PAUSADA: o mesmo getCustomTools deixa de expor a tool (isActive=false). ──
    await pauseIntegration(page, integration.id)
    const afterPause = await runtimeVisibleToolNames(
      session.organizationId,
      seeded.agentConfigId
    )
    expect(
      afterPause.has(GENERIC_WEBHOOK_TOOL_NAME),
      'integração PAUSADA NÃO aparece no catálogo do runtime (mesmo filtro isActive)'
    ).toBe(false)
  })
})
