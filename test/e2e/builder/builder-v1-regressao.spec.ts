import { test, expect, type Page } from '@playwright/test'
import {
  generateTestEmail,
  getLatestOtp,
  waitForRedirect,
} from '../auth/helpers'

/**
 * T62 — E2E: regressão v1 (flag off) + kill-switch (NFR-08).
 *
 * specs/jornada-builder-v2/tasks.md T62 (Onda 1, depende de T17/T87/T89):
 *
 *   (1) Com a jornada v1 (flag off / cookie override `builder-v2-override=off`),
 *       o projeto renderiza INTOCADO: nenhum campo `journey` no readiness, layout
 *       split desde o início, tabs LOCKED (não filtradas). Prova de NFR-03.
 *
 *   (2) Kill-switch `BUILDER_V2_FORCE_RENDER_V1` (NFR-08): um projeto v2 (override
 *       `on`) renderiza o engine v1 quando o kill-switch está ligado no servidor —
 *       SEM perder estado (`builderState.journeyVersion` permanece 2) — e volta à
 *       v2 quando desligado. Degrade SÓ de render, zero escrita de estado.
 *
 * ── Sinais load-bearing ──────────────────────────────────────────────────────
 * A UI das FASES v2 (fullscreen na fase Conhecer, tabs filtradas, painel de fases)
 * é entregue por tarefas PARALELAS (T37/T49/T55) que podem ainda não estar no
 * disco quando esta spec roda. Por isso a verificação canônica de v1-vs-v2 aqui é
 * a presença/ausência de `readiness.journey` no endpoint determinístico
 *   GET /api/v1/builder/projects/:id/readiness
 * (resolver: src/server/ai-module/builder/state/readiness-resolver.ts) — que existe
 * desde T17 e é a fonte única de verdade do step-engine. Os asserts de DOM (layout
 * split + tabs locked) cobrem o que a v1 SEMPRE renderiza, independente do roll-out
 * da UI v2.
 *
 * ── Dependências de infra (skip honesto, plan §7.2 / NFR-09) ─────────────────
 * Esta spec roda com o provider LLM mock (T89, `E2E_LLM_MOCK=1`) e contra o
 * `npm run dev` local com o test DB exposto (TEST_DATABASE_URL/DATABASE_URL).
 * O mock e o kill-switch são ENV DE SERVIDOR — não há como uma spec ligá-los/
 * desligá-los num dev server já no ar. A fixture do projeto local do Playwright
 * (gate) seta o ambiente; quando um pré-requisito não está garantido localmente,
 * o cenário faz `test.skip` (corpo completo e funcional preservado) — exatamente
 * o contrato de T62 ("pode ficar como .skip condicional"). O `npx playwright test
 * --list` reconhece a spec independente de qualquer env.
 *
 *   E2E_LLM_MOCK=1                 → provider mock ativo (NFR-09)
 *   E2E_BUILDER_KILL_SWITCH        → 'on' | 'off' espelha o BUILDER_V2_FORCE_RENDER_V1
 *                                    do servidor; o gate roda a spec 2x (uma por
 *                                    valor) para cobrir o round-trip completo.
 *   E2E_SIGNUP_ENABLED             → 'false' pula o login (sem signup no ambiente)
 */

test.describe.configure({ mode: 'serial' })

// ── Cookie override do flag (per-request, lido por isBuilderV2Enabled) ────────
// src/lib/feature-flags/builder-v2.ts: `builder-v2-override=on|off` decide a
// versão CONGELADA no `createWithInitialMessage`. É o único alavanca v1/v2 que uma
// spec pode acionar (kill-switch e mock são env de servidor).
const OVERRIDE_COOKIE = 'builder-v2-override'

interface ReadinessSnapshot {
  journey?: { version: number; activePhaseId: string; phases: unknown[] }
  builderState?: { journeyVersion?: number }
  steps?: unknown[]
}

/**
 * Set the builder-v2 override cookie for the baseURL host BEFORE any navigation
 * that creates a project (the version is frozen at creation time, server-side).
 */
async function setOverrideCookie(
  page: Page,
  value: 'on' | 'off',
): Promise<void> {
  const base = test.info().project.use.baseURL ?? 'http://localhost:3000'
  const host = new URL(base).hostname
  await page.context().addCookies([
    {
      name: OVERRIDE_COOKIE,
      value,
      domain: host,
      path: '/',
      httpOnly: false,
      secure: base.startsWith('https'),
      sameSite: 'Lax',
    },
  ])
}

/**
 * Log in via the OTP happy path (same primitive the auth E2E uses). Skips the
 * whole test when the test DB / OTP is not reachable from the runner — never a
 * hard failure outside the gate environment.
 */
async function loginViaOtp(page: Page): Promise<void> {
  test.skip(
    process.env.E2E_SIGNUP_ENABLED === 'false',
    'login indisponível neste ambiente (E2E_SIGNUP_ENABLED=false)',
  )
  const email = generateTestEmail()

  await page.goto('/login')
  const emailField = page.locator('#email-input')
  await emailField.waitFor({ state: 'visible' })
  await emailField.fill(email)
  await page
    .getByRole('button', { name: /continuar|entrar|login/i })
    .first()
    .click()
  await waitForRedirect(page, /\/login\/verify/)

  let otp: string
  try {
    otp = await getLatestOtp(email)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    test.skip(true, 'OTP capture not reachable: ' + message)
    return
  }
  expect(otp).toMatch(/^\d{6}$/)

  const otpField = page.locator('input[autocomplete="one-time-code"]').first()
  await otpField.waitFor({ state: 'attached' })
  await otpField.fill(otp)

  // Login lands on `/` (home Builder) or a deep-linked /projetos route.
  await waitForRedirect(page, /\/(?:$|\?|projetos)/)
}

/**
 * Create a Builder project through the home composer and return its id.
 * Mirrors src/client/components/home/home-page.tsx (`#builder-home-input` →
 * createProject → redirect to /projetos/<id>).
 */
async function createProjectViaHome(page: Page): Promise<string> {
  await page.goto('/')
  const input = page.locator('#builder-home-input')
  await input.waitFor({ state: 'visible' })
  await input.fill(
    'Crie um agente de atendimento para uma clínica de estética em São Paulo',
  )
  // sendOnEnter is enabled on the home MessageInput; Enter submits.
  await input.press('Enter')

  await waitForRedirect(page, /\/projetos\/[0-9a-f-]{36}/i, 20_000)
  const match = page.url().match(/\/projetos\/([0-9a-f-]{36})/i)
  expect(match, 'esperado redirect para /projetos/<uuid>').not.toBeNull()
  return match![1]
}

/**
 * Read the deterministic readiness snapshot for a project via the API the UI
 * itself consumes. Carries the session cookies of `page` (same-origin fetch).
 */
async function fetchReadiness(
  page: Page,
  projectId: string,
): Promise<ReadinessSnapshot> {
  const res = await page.request.get(
    `/api/v1/builder/projects/${projectId}/readiness`,
  )
  expect(res.ok(), `readiness ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data?: ReadinessSnapshot }
  expect(body.data, 'readiness.data ausente').toBeTruthy()
  return body.data as ReadinessSnapshot
}

/**
 * Open the workspace and assert the v1 split layout is present (both panels) and
 * the tab strip carries LOCKED tabs (aria-disabled), not filtered-away tabs.
 * This is exactly what v1 always renders — the NFR-03 invariant.
 */
async function assertV1WorkspaceShell(page: Page, projectId: string): Promise<void> {
  await page.goto(`/projetos/${projectId}`)

  // Split layout from the start: the chat composer AND the preview tab strip are
  // both mounted (v1 never hides the preview behind a "fase Conhecer" fullscreen).
  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('tab', { name: 'Visão geral' })).toBeVisible()

  // A fresh project has no agent yet → `requiresAgent` tabs render LOCKED
  // (aria-disabled button with Lock icon), NOT removed from the strip. The
  // presence of an aria-disabled tab control is the v1 signature; the v2 journey
  // FILTERS non-actionable tabs instead of locking them (T53/T54).
  const lockedTab = page.locator('button[aria-disabled="true"]')
  await expect(lockedTab.first()).toBeVisible()
  // "Prompt"/"Testar"/"Publicar" are requiresAgent → at least one is locked.
  await expect(
    page.getByText(/^(Prompt|Testar|Publicar|Avançado)$/).first(),
  ).toBeVisible()
}

test.describe('Builder v1 regressão + kill-switch (NFR-03 / NFR-08)', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // (1) Flag off → jornada v1 completa, intocada.
  // ───────────────────────────────────────────────────────────────────────────
  test('flag off renderiza a jornada v1 intocada (sem fases)', async ({
    page,
  }) => {
    await setOverrideCookie(page, 'off')
    await loginViaOtp(page)

    const projectId = await createProjectViaHome(page)

    // Canonical signal: v1 readiness NEVER carries a `journey` payload, and the
    // persisted version is 1.
    const readiness = await fetchReadiness(page, projectId)
    expect(readiness.journey, 'v1 não deve expor `journey`').toBeUndefined()
    expect(readiness.builderState?.journeyVersion ?? 1).toBe(1)
    // v1 still exposes the flat step checklist (the 15-step list).
    expect(Array.isArray(readiness.steps)).toBeTruthy()

    // DOM invariant: split layout + LOCKED (not filtered) tabs.
    await assertV1WorkspaceShell(page, projectId)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // (2) Kill-switch round-trip: projeto v2 cai no engine v1 SEM perder estado;
  //     desligando volta v2. O kill-switch (`BUILDER_V2_FORCE_RENDER_V1`) é env
  //     de SERVIDOR — o gate roda a spec 2x (E2E_BUILDER_KILL_SWITCH=on|off)
  //     para cobrir o round-trip completo; cada execução assere a metade que
  //     casa com o env do servidor e prova a INVARIÂNCIA de estado entre elas.
  // ───────────────────────────────────────────────────────────────────────────
  test('kill-switch BUILDER_V2_FORCE_RENDER_V1: round-trip v2↔v1 sem perda de estado', async ({
    page,
  }) => {
    const killSwitch = process.env.E2E_BUILDER_KILL_SWITCH
    test.skip(
      killSwitch !== 'on' && killSwitch !== 'off',
      'kill-switch round-trip requer E2E_BUILDER_KILL_SWITCH=on|off espelhando ' +
        'BUILDER_V2_FORCE_RENDER_V1 no dev server (env de servidor — o gate roda ' +
        'a spec 2x). Corpo completo preservado.',
    )

    await setOverrideCookie(page, 'on')
    await loginViaOtp(page)

    // Projeto v2 (override on congela journeyVersion: 2 na criação).
    const projectId = await createProjectViaHome(page)

    const readiness = await fetchReadiness(page, projectId)

    // INVARIANTE central de NFR-08: o estado persistido NUNCA muda com o
    // kill-switch — a versão congelada continua 2 nos DOIS modos (render-only).
    expect(
      readiness.builderState?.journeyVersion,
      'kill-switch jamais reescreve journeyVersion (degrade só de render)',
    ).toBe(2)

    if (killSwitch === 'on') {
      // Kill-switch LIGADO no servidor: render forçado v1 → SEM `journey`,
      // mesmo com journeyVersion === 2.
      expect(
        readiness.journey,
        'com kill-switch ligado, projeto v2 não expõe `journey` (render v1)',
      ).toBeUndefined()
      // Mesmo no degrade o workspace v1 (split + tabs locked) renderiza.
      await assertV1WorkspaceShell(page, projectId)
    } else {
      // Kill-switch DESLIGADO: projeto v2 volta a render v2 → `journey` com as
      // 4 fases presentes. Estado intacto (journeyVersion ainda 2 acima).
      expect(
        readiness.journey,
        'com kill-switch desligado, projeto v2 expõe `journey`',
      ).toBeTruthy()
      expect(readiness.journey?.version).toBe(2)
      expect(readiness.journey?.phases.length).toBe(4)
    }
  })
})
