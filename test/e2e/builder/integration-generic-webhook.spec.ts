import { test, expect } from '@playwright/test'
import {
  startFixture,
  setIntegrationOverrideCookie,
  loginAndResolveOrg,
  seedPublishedProject,
  submitCard,
  listIntegrations,
  setCredentials,
  testIntegration,
  activateIntegration,
  GENERIC_WEBHOOK_SLUG,
  type SeededSession,
  type SeededProject,
} from './integration-e2e.helpers'
import type { IntegrationFixtureServer } from '../fixtures/integration-fixture-server'

/**
 * T55 — E2E fluxo 3: WEBHOOK GENÉRICO (FR-11) — plataforma desconhecida sem docs.
 *
 * specs/integration-builder/tasks.md T55 (Onda 4, depende de T30/T33):
 *   Plataforma desconhecida sem documentação → caminho ASSISTIDO de URL (o usuário
 *   informa a URL de destino) → MESMO gate de teste → ATIVAÇÃO.
 *
 * ── Por que esta é a perna E2E mais forte (URL controlável pelo usuário) ───────
 * Quando o investigador (T27/T30) não acha docs públicas, a proposta DEGRADA para
 * o template `generic-webhook` SEM fontes fabricadas (FR-11). Esse template modela
 * o destino como a CREDENCIAL `webhook_url` (`https://{{credentials.webhook_url}}`)
 * — diretamente controlável pelo usuário. Então o teste real bate no FIXTURE sem
 * precisar liberar nenhum host externo: basta `INTEGRATION_TEST_ALLOWED_HOSTS`
 * cobrir `127.0.0.1` no app server (NODE_ENV=test). É o MESMO gate de teste dos
 * outros fluxos (FR-06/FR-08).
 *
 * Modelamos a "plataforma desconhecida sem docs" pré-semeando a proposta DEGRADADA
 * (generic-webhook, sem `sources`) — exatamente o que `buildDegradedWebhookProposal`
 * grava — e dirigindo o MESMO submit de confirmação que o chat usa. O draft criado é
 * o webhook genérico; o usuário então informa a URL (credencial `webhook_url`).
 *
 * ── COMO RODAR (CI-gated) ──────────────────────────────────────────────────────
 *   dev server: NODE_ENV=test + INTEGRATION_TEST_ALLOWED_HOSTS=127.0.0.1 +
 *               (UI opcional) NEXT_PUBLIC_INTEGRATION_BUILDER=on
 *   specs: TEST_DATABASE_URL exposto (login + seed); cookie de override (auto).
 *   `npx playwright test --grep @integration test/e2e/builder/integration-generic-webhook.spec.ts`
 *
 * Como `webhook_url` é controlável, esta spec alcança o fixture e asserta o gate
 * REAL (invalid→rascunho, valid→validada→ativa) quando o app server libera
 * 127.0.0.1; senão pula a perna de teste (sem falha dura). `--list` sem env. Zero `any`.
 */

test.describe.configure({ mode: 'serial' })

let fixture: IntegrationFixtureServer
let session: SeededSession
let seeded: SeededProject

// Proposta DEGRADADA que `propose_integration` gravaria para uma plataforma sem
// docs públicas: aponta ao generic-webhook, SEM fontes (FR-11 proíbe citações
// fabricadas no caminho degradado).
const DEGRADED_PROPOSAL = {
  platform: 'MeuCRMObscuro',
  templateSlug: GENERIC_WEBHOOK_SLUG,
  triggerDescription:
    'Quando o lead informar nome e contato e demonstrar interesse no produto/serviço.',
  whatDataSent:
    'Não encontrei documentação pública. Vamos conectar via webhook: você informa a URL de destino.',
  // Sem `sources`.
}

test.beforeAll(async () => {
  fixture = await startFixture()
})

test.afterAll(async () => {
  if (fixture) await fixture.close()
})

test.describe('Integration Builder — webhook genérico FR-11 (T55)', () => {
  test('plataforma desconhecida → caminho assistido de URL → mesmo gate de teste → ativa @integration', async ({
    page,
  }) => {
    await setIntegrationOverrideCookie(page, 'on')
    session = await loginAndResolveOrg(page)
    // Pré-semeia a proposta degradada (sem fontes) — saída do investigador vazio.
    seeded = await seedPublishedProject(session, {
      builderState: { integration: { proposed: DEGRADED_PROPOSAL } },
    })

    // ── Confirma a proposta degradada → cria o draft de webhook genérico. ───────
    await submitCard(page, seeded.projectId, 'integration_proposal', {
      action: 'confirm',
    })
    const draft = (await listIntegrations(page, seeded.projectId)).find(
      (i) => i.templateSlug === GENERIC_WEBHOOK_SLUG
    )
    expect(
      draft,
      'confirmar a proposta degradada cria o rascunho de webhook genérico'
    ).toBeTruthy()
    expect(draft?.status).toBe('draft')
    // O caminho assistido oferta o campo `webhook_url` (URL que o usuário informa).
    const webhookField = draft?.credentialFields.find(
      (f) => f.key === 'webhook_url'
    )
    expect(webhookField, 'campo webhook_url ofertado no caminho assistido').toBeTruthy()

    // ── URL INVÁLIDA: aponta ao path 401 do fixture (host SEM esquema). ─────────
    await setCredentials(page, draft!.id, {
      webhook_url: `${fixture.host}/unauthorized`,
      webhook_secret: '',
    })
    const invalidTest = await testIntegration(page, draft!.id)

    const reachable = invalidTest.outcome !== 'blocked'
    test.skip(
      !reachable,
      'fixture inalcançável: app server precisa de NODE_ENV=test + ' +
        'INTEGRATION_TEST_ALLOWED_HOSTS cobrindo 127.0.0.1. ' +
        'O caminho assistido (proposta degradada → draft → campo de URL) já rodou.'
    )
    expect(invalidTest.outcome, 'URL com 401 → auth_error').toBe('auth_error')
    const afterInvalid = (await listIntegrations(page, seeded.projectId)).find(
      (i) => i.id === draft!.id
    )
    expect(afterInvalid?.status, 'falha mantém rascunho').toBe('draft')

    // ── URL VÁLIDA: aponta ao path 200 do fixture → VALIDADA → ATIVA. ───────────
    await setCredentials(page, draft!.id, {
      webhook_url: `${fixture.host}/ok`,
      webhook_secret: '',
    })
    const validTest = await testIntegration(page, draft!.id)
    expect(validTest.outcome, 'URL com 200 → success').toBe('success')
    const validated = (await listIntegrations(page, seeded.projectId)).find(
      (i) => i.id === draft!.id
    )
    expect(validated?.status, 'sucesso → validada').toBe('validated')

    const activation = await activateIntegration(page, draft!.id)
    expect(
      activation.ok,
      `ativação após teste OK (status ${activation.status})`
    ).toBeTruthy()
    const active = (await listIntegrations(page, seeded.projectId)).find(
      (i) => i.id === draft!.id
    )
    expect(active?.status, 'webhook genérico ativado pelo mesmo gate').toBe(
      'active'
    )
  })
})
