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
  listIntegrations,
  GENERIC_WEBHOOK_SLUG,
  type SeededSession,
  type SeededProject,
} from './integration-e2e.helpers'
import type { IntegrationFixtureServer } from '../fixtures/integration-fixture-server'

/**
 * T53 — E2E fluxo 1: integração por TEMPLATE pelo painel (AdvancedTab).
 *
 * specs/integration-builder/tasks.md T53 (Onda 4, depende de T33/T38):
 *   "+ Integração" → escolhe um template → credenciais com instruções → teste
 *   FALHA (chave inválida no fixture) → diagnóstico leigo + permanece RASCUNHO →
 *   chave VÁLIDA → VALIDADA → ativar → badge "ativa" → pausar → some do agente.
 *
 * ── Por que o caminho declarativo bate no fixture (decisão load-bearing) ───────
 * O template RD Station tem `requestSpec.url` FIXO em `https://api.rd.services`
 * (rd-station.template.ts). O executor faz `fetch` SERVER-SIDE; não dá para
 * apontar a URL fixa do RD Station para o fixture sem um override que o código real
 * não expõe. O template `generic-webhook` modela a URL como a CREDENCIAL
 * `webhook_url` (`https://{{credentials.webhook_url}}`) — diretamente controlável
 * pelo usuário. Então esta spec usa o `generic-webhook` apontado para o fixture
 * (host SEM esquema, como o template exige), que é o caminho que o usuário leigo de
 * fato controla. O fluxo de status/gates testado é IDÊNTICO ao do RD Station.
 *   O fixture roteia por `api_key`/path: usamos a CREDENCIAL `webhook_url` para
 * apontar o destino (`<host>/unauthorized` → 401 → auth_error; `<host>/ok` → 200 →
 * success). O `webhook_secret` fica vazio (opcional no template).
 *
 * ── COMO RODAR (CI-gated — precisa do dev server com env de teste) ─────────────
 *   1. Subir o fixture numa porta conhecida e o dev server com o host liberado:
 *        # terminal 1 — dev server com NODE_ENV=test + allowlist do fixture
 *        $env:NODE_ENV='test'; $env:INTEGRATION_TEST_ALLOWED_HOSTS='127.0.0.1'; `
 *          $env:NEXT_PUBLIC_INTEGRATION_BUILDER='on'; npm run dev
 *        # terminal 2 — os specs (test DB exposto p/ login + seed)
 *        $env:TEST_DATABASE_URL='postgres://...'; `
 *          npx playwright test --project=local --grep @integration `
 *          test/e2e/builder/integration-template-painel.spec.ts
 *   - `INTEGRATION_TEST_ALLOWED_HOSTS=127.0.0.1` (bare host) libera o fixture em
 *     QUALQUER porta efêmera — sem isso o teste de chamada vira `blocked` e a spec
 *     pula a perna que exige round-trip real (sem falha dura).
 *   - `NEXT_PUBLIC_INTEGRATION_BUILDER=on` só é necessário para a UI da seção
 *     (o backend usa o cookie de override). Esta spec dirige pelo API.
 *
 * O `npx playwright test --list` reconhece a spec sem qualquer env. Zero `any`.
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

test.describe('Integration Builder — template pelo painel (T53)', () => {
  test('template → credenciais → teste falha (rascunho) → válida (validada) → ativa → pausa @integration', async ({
    page,
  }) => {
    await setIntegrationOverrideCookie(page, 'on')
    session = await loginAndResolveOrg(page)
    seeded = await seedPublishedProject(session)

    // ── "+ Integração" → escolhe template (generic-webhook apontado ao fixture). ─
    const integration = await createIntegration(
      page,
      seeded.projectId,
      GENERIC_WEBHOOK_SLUG,
      'Webhook de teste E2E'
    )
    expect(integration.status, 'recém-criada é rascunho').toBe('draft')
    expect(integration.templateSlug).toBe(GENERIC_WEBHOOK_SLUG)
    // O template expõe a metadata de credenciais (sem valores) com o "onde pegar".
    const webhookField = integration.credentialFields.find(
      (f) => f.key === 'webhook_url'
    )
    expect(webhookField, 'campo webhook_url ofertado').toBeTruthy()

    // ── Chave INVÁLIDA: aponta o webhook_url ao path 401 do fixture. ────────────
    // `fixture.host` é `127.0.0.1:<port>` (sem esquema) — exatamente o formato que
    // o template `generic-webhook` exige para `webhook_url`.
    await setCredentials(page, integration.id, {
      webhook_url: `${fixture.host}/unauthorized`,
      webhook_secret: '',
    })
    const invalidTest = await testIntegration(page, integration.id)

    // Se o app server NÃO foi iniciado com NODE_ENV=test + allowlist, o executor
    // bloqueia o http do fixture (`blocked`) e não há round-trip real — pula a
    // perna que depende do fixture (contrato honesto fora do gate).
    const reachable = invalidTest.outcome !== 'blocked'
    test.skip(
      !reachable,
      'fixture inalcançável: o app server precisa de NODE_ENV=test + ' +
        'INTEGRATION_TEST_ALLOWED_HOSTS cobrindo 127.0.0.1 (ver bloco COMO RODAR). ' +
        'A perna de criação/rascunho acima já rodou; o gate de teste é CI-gated.'
    )

    // Chave inválida → diagnóstico leigo + PERMANECE rascunho (não validou).
    expect(invalidTest.outcome, 'chave inválida → auth_error').toBe('auth_error')
    expect(
      invalidTest.diagnosis.trim().length,
      'diagnóstico leigo presente'
    ).toBeGreaterThan(0)
    const afterInvalid = (await listIntegrations(page, seeded.projectId)).find(
      (i) => i.id === integration.id
    )
    expect(afterInvalid?.status, 'falha mantém rascunho').toBe('draft')

    // ── Chave VÁLIDA: aponta ao path 200 do fixture → VALIDADA. ─────────────────
    // Path-driven 200 do fixture (o caminho api_key vale para o RD Station, que
    // injeta `?api_key=` — aqui o generic-webhook usa a URL diretamente, então o
    // path `/ok` já força o success).
    await setCredentials(page, integration.id, {
      webhook_url: `${fixture.host}/ok`,
      webhook_secret: '',
    })
    const validTest = await testIntegration(page, integration.id)
    expect(validTest.outcome, 'chave válida → success').toBe('success')
    const afterValid = (await listIntegrations(page, seeded.projectId)).find(
      (i) => i.id === integration.id
    )
    expect(afterValid?.status, 'sucesso transiciona draft→validated').toBe(
      'validated'
    )

    // ── Ativar: gates (agente publicado + validada + último teste OK) passam. ───
    const activation = await activateIntegration(page, integration.id)
    expect(
      activation.ok,
      `ativação deveria passar os gates (status ${activation.status})`
    ).toBeTruthy()
    const afterActivate = (await listIntegrations(page, seeded.projectId)).find(
      (i) => i.id === integration.id
    )
    expect(afterActivate?.status, 'badge "ativa"').toBe('active')

    // ── Pausar: some do catálogo do agente (status paused). ─────────────────────
    await pauseIntegration(page, integration.id)
    const afterPause = (await listIntegrations(page, seeded.projectId)).find(
      (i) => i.id === integration.id
    )
    expect(afterPause?.status, 'pausada não fica ativa no agente').toBe('paused')
  })
})
