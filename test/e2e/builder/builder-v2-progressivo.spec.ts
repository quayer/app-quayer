import { test, expect, type Page } from '@playwright/test'
import {
  generateTestEmail,
  getLatestOtp,
  waitForRedirect,
} from '../auth/helpers'

/**
 * T72 — E2E: UI progressiva (+ reduced-motion FR-32).
 *
 * specs/jornada-builder-v2/tasks.md T72 (Onda 6, depende de T54/T55/T101):
 *
 *   Fixture org seedada + cookie `builder-v2-override=on`. Cobre, em projetos v2:
 *     • A PRIMEIRA tela do projeto mostra só a CONVERSA (fullscreen na fase
 *       Conhecer) — o painel de tabs (preview) NÃO monta enquanto
 *       `readiness.journey.activePhaseId === 'conhecer'` (T55, FR-19).
 *     • As TABS aparecem por FASE: ao entrar em Revisar (confirmando o card
 *       `business_identity`), o split revela e o tab strip surge com as tabs da
 *       fase — filtradas por `visibleWhen`, não travadas (T53/T54, FR-19).
 *     • NENHUMA tab visível-porém-bloqueada em v2 (spec §8 item 12 / FR-19): a
 *       jornada FILTRA tabs não-acionáveis em vez de mostrá-las locked — a UI de
 *       lock (`button[aria-disabled="true"]` com ícone de cadeado) é exclusiva da
 *       v1 (assert de AUSÊNCIA, espelho do `assertV1WorkspaceShell` da regressão).
 *     • Com `prefers-reduced-motion` emulado, a transição Conhecer→Revisar roda
 *       SEM animações (FR-32 / spec §8 item 32-13): as 3 animações da revelação
 *       (`builder-chat-column`, `builder-reveal-panel`, `builder-tab-pulse`) vivem
 *       em globals.css e são zeradas pelo bloco `@media (prefers-reduced-motion:
 *       reduce)` (duration → 0.01ms) — o elemento salta direto pro estado final.
 *
 * ── Sinais canônicos (load-bearing) ──────────────────────────────────────────
 * A revelação progressiva é puramente CLIENT — o workspace.tsx escolhe o layout a
 * partir de `readiness.journey.activePhaseId` (fonte única içada, FR-18). Por isso
 * os asserts ancoram em DOM ESTÁVEL que o workspace v2 sempre renderiza:
 *
 *  (A) FULLSCREEN Conhecer (T55): na 1ª fase o `WorkspaceContent` renderiza só o
 *      `ChatPanel` (sem o `<section>` do preview) — a coluna do chat tem a classe
 *      `.builder-chat-column` e `md:max-w-full`, e NÃO existe `role="tablist"`.
 *      O composer ("Continue a conversa com o Builder…") é a prova da conversa.
 *
 *  (B) SPLIT Revisar (T55/T53): ao entrar em Revisar o preview monta (classe
 *      `.builder-reveal-panel`) e o `role="tablist"` aparece com a tab "Visão
 *      geral" (visibleWhen: phaseAtLeast 'revisar') — tabs reveladas por fase.
 *
 *  (C) ZERO lock em v2 (T53/T54, §8 item 12): `getTabsForProjectWithLocked` no
 *      branch `readiness.journey` retorna SEMPRE `locked: false` e filtra o resto
 *      — então `button[aria-disabled="true"]` (a assinatura de lock da v1) NUNCA
 *      aparece. Esse é o assert canônico de "nenhuma tab visível-porém-bloqueada".
 *
 *  (D) READINESS v2 — GET /api/v1/builder/projects/:id/readiness (resolver:
 *      src/server/ai-module/builder/state/readiness-resolver.ts) expõe `journey`
 *      (4 fases + activePhaseId). É a fonte única do layout; lido para confirmar a
 *      transição de fase de forma determinística (sem depender do turno LLM). O
 *      flip do card `business_identity` é committado por `applyCardSubmit` ANTES do
 *      ACK SSE, então a leitura logo após reflete o avanço de fase.
 *
 * ── prefers-reduced-motion (FR-32) ───────────────────────────────────────────
 * Playwright emula via `test.use({ reducedMotion: 'reduce' })` (Emulation.
 * setEmulatedMedia) — o bloco `@media (prefers-reduced-motion: reduce)` de
 * globals.css então força `animation-duration`/`transition-duration` a 0.01ms em
 * TODO elemento. O cenário reduced-motion executa a MESMA transição Conhecer→
 * Revisar e prova que (a) ela acontece (o split revela) e (b) as classes de
 * animação resolvem para duração ~0 em `getComputedStyle` — i.e. sem movimento.
 *
 * ── Dependências de infra (skip honesto, plan §7.2 / NFR-09) ─────────────────
 * Roda com o provider LLM mock (T89, `E2E_LLM_MOCK=1`) contra o `npm run dev`
 * local com o test DB exposto (TEST_DATABASE_URL/DATABASE_URL). Os toggles de
 * estado (card-submit) e o layout NÃO dependem de modelo — o avanço de fase é
 * determinístico. Quando o login/OTP não é alcançável o cenário faz `test.skip`
 * honesto (corpo completo e funcional preservado). O `npx playwright test --list`
 * reconhece a spec independente de qualquer env.
 *
 *   E2E_LLM_MOCK=1      → provider mock ativo (NFR-09).
 *   E2E_SIGNUP_ENABLED  → 'false' pula o login (sem signup no ambiente).
 */

test.describe.configure({ mode: 'serial' })

// ── Cookie override do flag (per-request, lido por isBuilderV2Enabled) ────────
// src/lib/feature-flags/builder-v2.ts: `builder-v2-override=on` congela
// journeyVersion: 2 na criação (createWithInitialMessage). É a única alavanca
// v1/v2 que uma spec pode acionar.
const OVERRIDE_COOKIE = 'builder-v2-override'

// Identidade do negócio confirmada no card business_identity — o submit avança a
// fase Conhecer→Revisar (objective já vem do composer da home; identity é o gate
// restante da 1ª fase, journey-v2.ts CONHECER_STEPS).
const BUSINESS_NAME = 'Barbearia Lisboa'
const BUSINESS_ADDRESS = 'Av. Paulista, 900 — Bela Vista, São Paulo/SP'
const BUSINESS_DESCRIPTION =
  'Barbearia clássica com atendimento sob agendamento para corte e barba.'

interface ReadinessSnapshot {
  journey?: {
    version: number
    activePhaseId: string
    phases: Array<{ id?: string; status?: string; steps?: unknown[] }>
  }
  builderState?: {
    journeyVersion?: number
    confirmations?: { businessIdentity?: boolean }
  }
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
 * Create a Builder project through the home composer and return its id. Mirrors
 * src/client/components/home/home-page.tsx (`#builder-home-input` →
 * createProject → redirect to /projetos/<id>). With the override cookie `on`, the
 * project is frozen at journeyVersion: 2 and the composer text seeds
 * `project.objective` (the `objective` step of the Conhecer phase).
 */
async function createProjectViaHome(page: Page): Promise<string> {
  await page.goto('/')
  const input = page.locator('#builder-home-input')
  await input.waitFor({ state: 'visible' })
  await input.fill(
    'Crie um agente de atendimento para uma barbearia que atende sob agendamento',
  )
  // sendOnEnter is enabled on the home MessageInput; Enter submits.
  await input.press('Enter')

  await waitForRedirect(page, /\/projetos\/[0-9a-f-]{36}/i, 20_000)
  const match = page.url().match(/\/projetos\/([0-9a-f-]{36})/i)
  expect(match, 'esperado redirect para /projetos/<uuid>').not.toBeNull()
  return match![1]
}

/**
 * Read the deterministic readiness snapshot via the API the UI itself consumes.
 * Carries the session cookies of `page` (same-origin fetch).
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
 * Submit the `business_identity` card through the SAME endpoint the chat-panel
 * uses (POST /cards/business_identity/submit). The flip (identity.* + sentinel) is
 * committed by `applyCardSubmit` BEFORE the ACK turn streams over SSE — so we only
 * need the request to be accepted; this is what advances Conhecer→Revisar.
 */
async function submitBusinessIdentity(
  page: Page,
  projectId: string,
): Promise<void> {
  const res = await page.request.post(
    `/api/v1/builder/projects/${projectId}/cards/business_identity/submit`,
    {
      data: {
        cardKey: 'business_identity',
        name: BUSINESS_NAME,
        address: BUSINESS_ADDRESS,
        description: BUSINESS_DESCRIPTION,
      },
    },
  )
  expect(
    res.ok(),
    `card-submit business_identity falhou (${res.status()})`,
  ).toBeTruthy()
}

/**
 * The chat composer present in BOTH layouts (fullscreen Conhecer and split). Its
 * presence is the canonical "the conversation is on screen" signal.
 * src/client/components/projetos/chat/chat-panel.tsx → MessageInput placeholder.
 */
function chatComposer(page: Page) {
  return page.getByPlaceholder(/Continue a conversa com o Builder/i)
}

test.describe('Builder v2 — UI progressiva (FR-19 / §8 item 12) + reduced-motion (FR-32)', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // §8 item 12 (FR-19): a 1ª tela só conversa (fullscreen Conhecer); as tabs
  //   aparecem por fase ao entrar em Revisar; NENHUMA tab visível-porém-bloqueada.
  // ───────────────────────────────────────────────────────────────────────────
  test('1ª tela só conversa (fullscreen Conhecer) → tabs surgem por fase (Revisar), sem tab bloqueada', async ({
    page,
  }) => {
    await setOverrideCookie(page, 'on')
    await loginViaOtp(page)

    // Projeto v2 (override on congela journeyVersion: 2 na criação).
    const projectId = await createProjectViaHome(page)

    // Sanidade v2 (fonte única do layout): o readiness expõe a jornada de 4 fases
    // e começa na fase Conhecer (objective vem do composer; identity é o gate).
    const before = await fetchReadiness(page, projectId)
    expect(
      before.builderState?.journeyVersion,
      'projeto criado com override=on deve ser v2',
    ).toBe(2)
    expect(before.journey?.version, 'readiness v2 expõe journey').toBe(2)
    expect(before.journey?.phases.length, 'jornada v2 tem 4 fases').toBe(4)
    expect(
      before.journey?.activePhaseId,
      'projeto recém-criado começa na fase Conhecer',
    ).toBe('conhecer')

    // ── FULLSCREEN Conhecer (T55): só a conversa; o painel de tabs NÃO monta. ────
    await page.goto(`/projetos/${projectId}`)
    await expect(
      chatComposer(page),
      'a 1ª tela do projeto v2 mostra a conversa (composer do Builder)',
    ).toBeVisible({ timeout: 15_000 })

    // Nenhuma tab/painel na fase Conhecer — o preview não monta (chat fullscreen).
    await expect(
      page.getByRole('tablist'),
      'na fase Conhecer NÃO há tab strip (revelação progressiva, FR-19)',
    ).toHaveCount(0)
    await expect(
      page.getByRole('tab', { name: 'Visão geral' }),
      'nenhuma tab visível antes de a fase Revisar começar',
    ).toHaveCount(0)

    // A coluna do chat ocupa a largura toda na fase Conhecer (md:max-w-full +
    // a classe da animação de revelação aplicada SÓ no branch v2).
    const chatColumn = page.locator('.builder-chat-column')
    await expect(
      chatColumn,
      'a coluna do chat (v2) está montada com a classe de revelação',
    ).toBeVisible()
    await expect(
      chatColumn,
      'na fase Conhecer a coluna do chat é fullscreen (md:max-w-full)',
    ).toHaveClass(/md:max-w-full/)

    // ── Transição Conhecer→Revisar: confirmar o card business_identity. ─────────
    await submitBusinessIdentity(page, projectId)

    // O readiness reflete o avanço de fase de forma determinística (committado
    // antes do ACK SSE) — agora a fase ativa é Revisar.
    const after = await fetchReadiness(page, projectId)
    expect(
      after.builderState?.confirmations?.businessIdentity,
      'sentinel businessIdentity flipado server-side',
    ).toBe(true)
    expect(
      after.journey?.activePhaseId,
      'confirmar a identidade avança a jornada para a fase Revisar',
    ).toBe('revisar')

    // ── SPLIT Revisar (T53/T55): o preview monta e o tab strip surge por fase. ──
    // Recarrega o workspace para o layout refletir a fase atual (o readiness é a
    // fonte única; o reload garante o snapshot v2 já em Revisar, sem corrida com o
    // polling). A conversa CONTINUA visível (o split é chat + preview).
    await page.goto(`/projetos/${projectId}?tab=overview`)
    await expect(
      page.getByRole('tablist'),
      'ao entrar em Revisar o painel revela o tab strip (split layout)',
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole('tab', { name: 'Visão geral' }),
      'a tab "Visão geral" aparece na fase Revisar (visibleWhen: revisar+)',
    ).toBeVisible()
    await expect(
      chatComposer(page),
      'no split a conversa permanece à esquerda (chat + preview)',
    ).toBeVisible()

    // ── §8 item 12: ZERO tab visível-porém-bloqueada em v2. ─────────────────────
    // A v1 mostra tabs travadas como `button[aria-disabled="true"]` (ícone de
    // cadeado); a v2 FILTRA tabs não-acionáveis por fase (locked: false sempre).
    // A AUSÊNCIA desse controle é a prova canônica de FR-19 / §8 item 12.
    await expect(
      page.locator('button[aria-disabled="true"]'),
      'em v2 nenhuma tab é visível-porém-bloqueada (filtradas por fase, não locked)',
    ).toHaveCount(0)

    // Sanidade de contraste com a v1: as tabs reveladas são triggers REAIS
    // (role="tab"), não botões de lock — pelo menos a "Visão geral" da fase atual.
    const visibleTabs = page.getByRole('tab')
    expect(
      await visibleTabs.count(),
      'a fase Revisar revela ao menos uma tab acionável',
    ).toBeGreaterThan(0)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // FR-32 / §8 (reduced-motion): com `prefers-reduced-motion: reduce` emulado, a
  //   transição Conhecer→Revisar acontece SEM animações — as classes de revelação
  //   resolvem para duração ~0 (o bloco @media de globals.css zera tudo).
  // ───────────────────────────────────────────────────────────────────────────
  test.describe('reduced-motion (FR-32) — transição Conhecer→Revisar sem animações', () => {
    // Emula `prefers-reduced-motion: reduce` para todo o contexto deste bloco
    // (Playwright: Emulation.setEmulatedMedia). globals.css então força
    // animation/transition-duration a 0.01ms em TODO elemento — sem movimento.
    test.use({ reducedMotion: 'reduce' })

    test('com prefers-reduced-motion as animações de revelação ficam com duração ~0', async ({
      page,
    }) => {
      await setOverrideCookie(page, 'on')
      await loginViaOtp(page)

      const projectId = await createProjectViaHome(page)

      const before = await fetchReadiness(page, projectId)
      expect(before.journey?.version, 'readiness v2 expõe journey').toBe(2)
      expect(
        before.journey?.activePhaseId,
        'projeto recém-criado começa na fase Conhecer',
      ).toBe('conhecer')

      // ── Fase Conhecer (fullscreen): a coluna do chat tem a transição de largura,
      //    mas com reduced-motion a duração resolve para ~0 (globals.css @media). ─
      await page.goto(`/projetos/${projectId}`)
      const chatColumn = page.locator('.builder-chat-column')
      await expect(chatColumn).toBeVisible({ timeout: 15_000 })

      // O bloco `@media (prefers-reduced-motion: reduce)` zera a transition-duration
      // (→ 0.01ms !important): a coluna do chat NÃO anima a mudança de largura.
      const chatTransitionMs = await chatColumn.evaluate((el) => {
        const value = getComputedStyle(el).transitionDuration
        // "0.01ms, 0.01ms" → pega o maior em ms; "0s" / "0.5s" → segundos.
        return Math.max(
          ...value.split(',').map((part) => {
            const trimmed = part.trim()
            const num = parseFloat(trimmed)
            if (Number.isNaN(num)) return 0
            return trimmed.endsWith('ms') ? num : num * 1000
          }),
        )
      })
      expect(
        chatTransitionMs,
        'reduced-motion: a coluna do chat não anima a largura (duration ~0)',
      ).toBeLessThanOrEqual(1)

      // ── Transição Conhecer→Revisar (determinística via card-submit). ───────────
      await submitBusinessIdentity(page, projectId)
      const after = await fetchReadiness(page, projectId)
      expect(
        after.journey?.activePhaseId,
        'a transição para Revisar aconteceu (revelação acontece, sem animar)',
      ).toBe('revisar')

      // ── Fase Revisar: o painel revela (split) MAS sem a animação de entrada. ───
      await page.goto(`/projetos/${projectId}?tab=overview`)
      await expect(page.getByRole('tablist')).toBeVisible({ timeout: 15_000 })

      // O painel revelado carrega `.builder-reveal-panel` (animation: slide-in-
      // right 0.5s). Com reduced-motion o @media força animation-duration a 0.01ms.
      const revealPanel = page.locator('.builder-reveal-panel')
      await expect(
        revealPanel,
        'o painel da fase Revisar montou (split revelado)',
      ).toBeVisible()
      const panelAnimationMs = await revealPanel.evaluate((el) => {
        const value = getComputedStyle(el).animationDuration
        return Math.max(
          ...value.split(',').map((part) => {
            const trimmed = part.trim()
            const num = parseFloat(trimmed)
            if (Number.isNaN(num)) return 0
            return trimmed.endsWith('ms') ? num : num * 1000
          }),
        )
      })
      expect(
        panelAnimationMs,
        'reduced-motion: o painel salta pro estado final (animation-duration ~0)',
      ).toBeLessThanOrEqual(1)

      // A revelação progressiva (mostrar as tabs por fase) continua funcionando —
      // só o MOVIMENTO some. A "Visão geral" está visível e nenhuma tab é locked.
      await expect(
        page.getByRole('tab', { name: 'Visão geral' }),
        'reduced-motion não quebra a revelação por fase — a tab aparece',
      ).toBeVisible()
      await expect(
        page.locator('button[aria-disabled="true"]'),
        'reduced-motion: ainda zero tab visível-porém-bloqueada (FR-19)',
      ).toHaveCount(0)
    })
  })
})
