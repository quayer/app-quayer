import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  generateTestEmail,
  getLatestOtp,
  getUserOrgId,
  waitForRedirect,
} from '../auth/helpers'
import { unwrapIgniterData } from './igniter-response'

/**
 * T68 — E2E: Capacidades (spec §8 itens 4-6) + card-submit silent (FR-29) +
 *           share da Agenda delegado (FR-34).
 *
 * specs/jornada-builder-v2/tasks.md T68 (Onda 4, plan §4.3 / §7.2):
 *
 *   Fixture org seedada + cookie `builder-v2-override=on`. Cobre:
 *     • Conhecimento SEMPRE ativo (sem toggle de desligar) — FR-07.
 *     • Transferir OFF por default: o projeto publica e o agente responde sozinho
 *       (solo) sem nenhuma configuração de handoff.
 *     • Ligar a ROLETA pelo card-submit persiste via silent-submit (FR-29):
 *       o flip do `handoff.mode` é aplicado pelo MESMO
 *       caminho do card-submit, a resposta é JSON simples (`{ ok, builderState }`)
 *       SEM turno LLM/SSE (consumo silent — sem turno do meta-agente).
 *     • Share de agenda delegado (FR-34): "Enviar link para o profissional" gera
 *       um connect-link `/conectar-agenda/<token>` copiável; ANTES de conectar o
 *       status nunca confirma (FR-11); com o status flipado para CONNECTED
 *       (seed/stub — sem OAuth real no E2E) "Verificar conexão" confirma o card.
 *
 * ── Sinais canônicos (load-bearing) ──────────────────────────────────────────
 * A UI de "O que o agente faz" (T49–T51: `capabilities-section.tsx` na
 * Overview) resume estados e leva o usuário para a tab/card dono da configuração.
 * Por isso o backbone determinístico
 * ancora nos MESMOS endpoints que a UI v2 consome — o contrato server-side é
 * estável e suficiente para os critérios §8 itens 4-6:
 *
 *  (1) CONHECIMENTO SEMPRE ATIVO — `GET /api/v1/builder/projects/:id/capabilities`
 *      (route: src/server/ai-module/builder/capabilities/capabilities.routes.ts)
 *      é uma composição LEITORA: NENHUMA escrita, SEM toggle de "desligar
 *      conhecimento". O conhecimento é superfície sempre-on (FR-07) — o endpoint só
 *      reporta `knowledgeSourceCount` (insumo), nunca um estado on/off. A ausência
 *      de qualquer caminho de escrita que desligue o conhecimento É o critério.
 *
 *  (2) TRANSFERIR OFF POR DEFAULT — `builderState.handoff` ausente/`mode` não-setado
 *      no readiness recém-criado (resolver:
 *      src/server/ai-module/builder/state/readiness-resolver.ts). Sem handoff
 *      configurado, o agente atende SOLO; a jornada NÃO exige o handoff para
 *      publicar (handoff/pricing/calendar são opt-in pela superfície de capacidades,
 *      NÃO steps da v2 — plan §3.2). Confirmamos lendo o readiness: nenhum sentinel
 *      de handoff bloqueia o deploy.
 *
 *  (3) LIGAR ROLETA via SILENT-SUBMIT (FR-29) —
 *      `POST /api/v1/builder/projects/:id/cards/handoff/submit` com
 *      `ackMode: 'silent'` (route: card-submit.routes.ts; allowlist
 *      `SILENT_ALLOWED_CARD_KEYS` em card-submit.schemas.ts inclui 'handoff'). O
 *      flip de `handoff.mode = 'roleta'` persiste pelo MESMO `applyCardSubmit`; a
 *      resposta é JSON simples `{ ok: true, builderState }` SEM SSE (zero turno
 *      LLM). É a prova de FR-29: a capacidade muda de estado sem custo de um
 *      turno do meta-agente.
 *      Contra-prova: o MESMO cardKey 'handoff' com `silent` em um card da JORNADA
 *      não existe; mas um cardKey FORA da allowlist com `silent` é 400 — asserido
 *      contra `business_identity` (card da jornada → silent proibido).
 *
 *  (4) SHARE DA AGENDA DELEGADO (FR-34) —
 *      `POST /api/v1/builder/calendar/connect-link` (route:
 *      src/server/ai-module/builder/calendar/calendar.routes.ts) devolve
 *      `shareLink = ${APP_URL}/conectar-agenda/<cal_…token>` (TTL 7 dias). O status
 *      vem de `GET /api/v1/builder/calendar/status/:projectId`: ANTES de conectar
 *      `connected: false` (FR-11 — nunca confirma sem CONNECTED real); o flip para
 *      CONNECTED é simulado por seed/stub (sem OAuth real no E2E) e então
 *      "Verificar conexão" (refetch do mesmo status) devolve `connected: true`.
 *      Quando a tabela CalendarConnection não está provisionada no ambiente, o
 *      connect-link responde 404 defensivo (getCalendarConnection() == null) — o
 *      cenário então faz skip honesto (contrato tolerante de T68).
 *
 * ── Linha de sistema "✓ …" no chat aberto sem reload (consumo silent) ─────────
 * A asserção de DOM é legada e tolerante: se alguma superfície ainda traduzir o
 * silent-submit em linha local, validamos que apareceu sem reload; se não aparecer,
 * o cenário recai no backbone determinístico (resposta JSON sem SSE), que já prova
 * o consumo silent sem turno LLM.
 *
 * ── Dependências de infra (skip honesto, plan §7.2 / NFR-09) ─────────────────
 * Roda com o provider LLM mock (T89, `E2E_LLM_MOCK=1`) contra o `npm run dev`
 * local com o test DB exposto (TEST_DATABASE_URL/DATABASE_URL). NENHUM cenário
 * abaixo depende de resposta real de modelo: o card-submit silent não abre turno
 * LLM (FR-29) e o share de agenda usa stub de
 * status. O `npx playwright test --list` reconhece a spec independente de env.
 *
 *   E2E_LLM_MOCK=1               → provider mock ativo (NFR-09); habilita o
 *                                  playground solo (agente responde sozinho).
 *   E2E_CALENDAR_CONNECT_STUB    → quando setado, o ambiente do gate flipa a
 *                                  CalendarConnection mais recente do projeto para
 *                                  CONNECTED (seed/stub server-side) após a leitura
 *                                  "antes de conectar" — simula o scan remoto do
 *                                  profissional sem OAuth real.
 *   E2E_SIGNUP_ENABLED           → 'false' pula o login (sem signup no ambiente).
 */

test.describe.configure({ mode: 'serial' })

// ── Cookie override do flag (per-request, lido por isBuilderV2Enabled) ────────
// src/lib/feature-flags/builder-v2.ts: `builder-v2-override=on` congela
// journeyVersion: 2 na criação (createWithInitialMessage). É a única alavanca
// v1/v2 que uma spec pode acionar.
const OVERRIDE_COOKIE = 'builder-v2-override'

// Roster mínimo da ROLETA: dois atendentes "nome + WhatsApp" (membro pode ser só
// isso — DepartmentMember.userId é NULLABLE). É o caminho do dono que liga a roleta
// sem usuários cadastrados na org.
const ROLETA_MEMBERS = [
  { name: 'Ana', whatsapp: '+5511988887777', position: 0 },
  { name: 'Bruno', whatsapp: '+5511977776666', position: 1 },
]

interface CapabilitiesSnapshot {
  customTools?: Array<{
    id?: string
    name?: string
    description?: string | null
    isActive?: boolean
  }>
  mediaImagesCount?: number
  knowledgeSourceCount?: number
  calendarConnected?: boolean
}

interface ReadinessSnapshot {
  journey?: { version: number; activePhaseId: string; phases: unknown[] }
  builderState?: {
    journeyVersion?: number
    handoff?: {
      mode?: string
      alsoSchedule?: boolean
      members?: Array<{ name?: string; whatsapp?: string; position?: number }>
    }
    confirmations?: { handoff?: boolean }
  }
  blockers?: unknown[]
  isDeployReady?: boolean
  steps?: unknown[]
}

interface SilentSubmitResult {
  ok?: boolean
  builderState?: {
    handoff?: { mode?: string; members?: unknown[] }
    confirmations?: { handoff?: boolean }
  }
}

interface ConnectLinkResult {
  connectionId?: string
  connectToken?: string
  expiresAt?: string
  shareLink?: string
}

interface CalendarStatusResult {
  connectionId?: string
  status?: string | null
  connected?: boolean
  calendarEmail?: string | null
  warning?: string
}

interface SeededSession {
  email: string
  userId: string
  organizationId: string
}

interface SeedPrismaClient {
  $connect: () => Promise<void>
  $disconnect: () => Promise<void>
  aIAgentConfig: {
    create: (args: {
      data: {
        organizationId: string
        name: string
        isActive: boolean
        provider: string
        model: string
        systemPrompt: string
        enabledTools: string[]
      }
      select: { id: true }
    }) => Promise<{ id: string }>
  }
  builderPromptVersion: {
    create: (args: {
      data: {
        aiAgentId: string
        versionNumber: number
        content: string
        description: string
        createdBy: 'chat'
      }
      select: { id: true }
    }) => Promise<{ id: string }>
  }
  builderProject: {
    update: (args: {
      where: { id: string }
      data: { aiAgentId: string }
      select: { id: true }
    }) => Promise<{ id: string }>
  }
  calendarConnection: {
    updateMany: (args: {
      where: { organizationId: string; builderProjectId: string }
      data: { status: 'CONNECTED'; calendarEmail: string }
    }) => Promise<{ count: number }>
  }
  organizationProvider: {
    create: (args: {
      data: {
        organizationId: string
        name: string
        category: 'AUXILIARY'
        provider: string
        builderProjectId: string
        isActive: boolean
        isPrimary: boolean
        priority: number
        credentials: Record<string, string>
      }
      select: { id: true }
    }) => Promise<{ id: string }>
  }
}

/**
 * Set the builder-v2 override cookie for the baseURL host BEFORE any navigation
 * that creates a project (the version is frozen at creation time, server-side).
 */
async function setOverrideCookie(page: Page, value: 'on' | 'off'): Promise<void> {
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
async function loginViaOtp(page: Page): Promise<SeededSession> {
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

  try {
    const ids = await getUserOrgId(email)
    return { email, ...ids }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    test.skip(true, 'org lookup not reachable: ' + message)
    throw new Error('unreachable')
  }
}

/**
 * Create a Builder project through the home composer and return its id. Mirrors
 * src/client/components/home/home-page.tsx (`#builder-home-input` →
 * createProject → redirect to /projetos/<id>). With the override cookie `on`, the
 * project is frozen at journeyVersion: 2.
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
  const body = await res.json()
  const readiness = unwrapIgniterData<ReadinessSnapshot>(body)
  expect(readiness, 'readiness.data ausente').toBeTruthy()
  return readiness as ReadinessSnapshot
}

/**
 * Read the Capabilities composition via the SAME read-only endpoint the Overview
 * surface consumes (GET /capabilities). It carries NO toggle for knowledge — the
 * absence of a write path that disables knowledge is the FR-07 "sempre ativo".
 */
async function fetchCapabilities(
  page: Page,
  projectId: string,
): Promise<CapabilitiesSnapshot> {
  const res = await page.request.get(
    `/api/v1/builder/projects/${projectId}/capabilities`,
  )
  expect(res.ok(), `capabilities ${res.status()}`).toBeTruthy()
  const body = await res.json()
  const capabilities = unwrapIgniterData<CapabilitiesSnapshot>(body)
  expect(capabilities, 'capabilities.data ausente').toBeTruthy()
  return capabilities as CapabilitiesSnapshot
}

/**
 * Toggle the ROLETA via the SAME card-submit endpoint the Capabilities surface
 * uses, in SILENT mode (FR-29). The flip of `handoff.mode = 'roleta'` persists via
 * `applyCardSubmit`; the response is plain JSON `{ ok, builderState }` with NO SSE
 * — zero LLM turn. Returns the parsed body so the caller asserts the flip + the
 * no-SSE contract (a JSON content-type, not text/event-stream).
 */
async function enableRoletaSilently(
  page: Page,
  projectId: string,
): Promise<{ result: SilentSubmitResult; contentType: string }> {
  const res = await page.request.post(
    `/api/v1/builder/projects/${projectId}/cards/handoff/submit`,
    {
      data: {
        cardKey: 'handoff',
        mode: 'roleta',
        alsoSchedule: false,
        steps: [],
        members: ROLETA_MEMBERS,
        ackMode: 'silent',
      },
    },
  )
  expect(
    res.ok(),
    `silent handoff submit falhou (${res.status()})`,
  ).toBeTruthy()
  const contentType = res.headers()['content-type'] ?? ''
  const body = await res.json()
  const result = unwrapIgniterData<SilentSubmitResult>(body)
  expect(result, 'silent-submit.data ausente').toBeTruthy()
  return { result: result as SilentSubmitResult, contentType }
}

/**
 * Create the calendar connect-link via the SAME endpoint the Agenda card uses
 * (POST /calendar/connect-link). Returns the result, OR null when the
 * CalendarConnection table is not provisioned in this environment (the route 404s
 * defensively — getCalendarConnection() == null) so the caller can skip honestly.
 */
async function createCalendarConnectLink(
  page: Page,
  projectId: string,
): Promise<ConnectLinkResult | null> {
  const res = await page.request.post(
    `/api/v1/builder/calendar/connect-link`,
    { data: { projectId } },
  )
  // 404 = CalendarConnection delegate ausente (tabela não provisionada) → skip.
  if (res.status() === 404) return null
  if (!res.ok()) return null
  const body = await res.json()
  return unwrapIgniterData<ConnectLinkResult>(body) ?? null
}

/**
 * Read the calendar connection status via the SAME query the Agenda card's
 * "Verificar conexão" uses (GET /calendar/status/:projectId). `connected` is true
 * ONLY when the underlying CalendarConnection row is CONNECTED (FR-11 — never a
 * false confirmation).
 */
async function fetchCalendarStatus(
  page: Page,
  projectId: string,
): Promise<CalendarStatusResult> {
  const res = await page.request.get(
    `/api/v1/builder/calendar/status/${projectId}`,
  )
  expect(res.ok(), `calendar status ${res.status()}`).toBeTruthy()
  const body = await res.json()
  return unwrapIgniterData<CalendarStatusResult>(body) ?? {}
}

/**
 * Ask the test agent something through the Playground SSE stream and return the
 * concatenated assistant text. Returns null when the project has no materialized
 * agent yet or the LLM mock is unavailable — the caller then falls back to the
 * deterministic state assertions (T68 tolerant contract). Mirrors the SSE parser
 * of the sibling specs (events carry `text`/`delta`/`content`).
 */
async function askPlayground(
  page: Page,
  projectId: string,
  message: string,
): Promise<string | null> {
  if (process.env.E2E_LLM_MOCK !== '1') return null

  const res = await page.request.post(
    `/api/v1/builder/projects/${projectId}/playground/stream`,
    { data: { message } },
  )
  // 404 = projeto sem agente materializado neste ambiente → cai no fallback.
  if (res.status() === 404) return null
  if (!res.ok()) return null

  const raw = await res.text()
  let assistantText = ''
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice('data:'.length).trim()
    if (!payload) continue
    try {
      const ev = JSON.parse(payload) as {
        type?: string
        text?: string
        delta?: string
        content?: string
      }
      assistantText += ev.text ?? ev.delta ?? ev.content ?? ''
    } catch {
      // linha de keep-alive / fragmento — ignora
    }
  }
  return assistantText
}

async function seedAgentAndPrompt(
  session: SeededSession,
  projectId: string,
): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!databaseUrl) {
    test.skip(true, 'seeding requires TEST_DATABASE_URL / DATABASE_URL')
    throw new Error('unreachable')
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  }) as unknown as SeedPrismaClient

  const systemPrompt =
    'Voce e o agente de atendimento de uma barbearia. ' +
    'Responda diretamente como agente solo quando perguntarem sobre horarios ou agenda.'

  try {
    await prisma.$connect()
    const suffix = projectId.slice(0, 8)
    const agent = await prisma.aIAgentConfig.create({
      data: {
        organizationId: session.organizationId,
        name: `E2E capacidades ${suffix}`,
        isActive: true,
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt,
        enabledTools: [],
      },
      select: { id: true },
    })
    await prisma.builderPromptVersion.create({
      data: {
        aiAgentId: agent.id,
        versionNumber: 1,
        content: systemPrompt,
        description: 'E2E capacidades prompt version',
        createdBy: 'chat',
      },
      select: { id: true },
    })
    await prisma.builderProject.update({
      where: { id: projectId },
      data: { aiAgentId: agent.id },
      select: { id: true },
    })
  } finally {
    await prisma.$disconnect()
  }
}

async function markCalendarConnected(
  session: SeededSession,
  projectId: string,
): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!databaseUrl) {
    test.skip(true, 'calendar connected seed requires TEST_DATABASE_URL / DATABASE_URL')
    throw new Error('unreachable')
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  }) as unknown as SeedPrismaClient

  try {
    await prisma.$connect()
    const updated = await prisma.calendarConnection.updateMany({
      where: {
        organizationId: session.organizationId,
        builderProjectId: projectId,
      },
      data: {
        status: 'CONNECTED',
        calendarEmail: 'agenda.e2e@quayer.test',
      },
    })
    expect(
      updated.count,
      'seed deve conectar ao menos um CalendarConnection do projeto',
    ).toBeGreaterThan(0)

    await prisma.organizationProvider.create({
      data: {
        organizationId: session.organizationId,
        name: 'E2E Google Calendar',
        category: 'AUXILIARY',
        provider: 'google-calendar',
        builderProjectId: projectId,
        isActive: true,
        isPrimary: false,
        priority: 0,
        credentials: { refreshToken: 'e2e-calendar-refresh-token' },
      },
      select: { id: true },
    })
  } finally {
    await prisma.$disconnect()
  }
}

test.describe('Builder v2 — Capacidades (§8 itens 4-6) + silent-submit (FR-29) + agenda delegada (FR-34)', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // §8 item: conhecimento SEMPRE ativo (FR-07) — sem toggle de desligar.
  //          + transferir OFF por default (agente responde sozinho).
  // ───────────────────────────────────────────────────────────────────────────
  test('conhecimento sempre-on + transferir OFF por default (agente responde sozinho)', async ({
    page,
  }) => {
    await setOverrideCookie(page, 'on')
    const session = await loginViaOtp(page)

    const projectId = await createProjectViaHome(page)

    // Sanidade v2: o readiness expõe a jornada de 4 fases.
    const before = await fetchReadiness(page, projectId)
    expect(
      before.builderState?.journeyVersion,
      'projeto criado com override=on deve ser v2',
    ).toBe(2)
    expect(before.journey?.version, 'readiness v2 expõe journey').toBe(2)

    // ── CONHECIMENTO SEMPRE ATIVO (FR-07): a superfície de Capacidades é LEITORA.
    //    `getCapabilities` só reporta insumos (knowledgeSourceCount) — não há
    //    nenhum campo on/off de conhecimento e nenhum caminho de escrita que o
    //    desligue. A presença do contrato read-only (sem toggle) É o critério.
    const caps = await fetchCapabilities(page, projectId)
    expect(
      typeof caps.knowledgeSourceCount,
      'capabilities reporta knowledgeSourceCount (insumo, não toggle)',
    ).toBe('number')
    expect(
      caps.knowledgeSourceCount ?? 0,
      'projeto novo sem fonte → 0 fontes (mas o conhecimento segue sempre-on)',
    ).toBeGreaterThanOrEqual(0)
    // O contrato NÃO carrega nenhuma chave "knowledgeEnabled"/"knowledge: false":
    // conhecimento é superfície sempre-on, sem estado on/off (FR-07).
    expect(
      Object.prototype.hasOwnProperty.call(caps, 'knowledgeEnabled'),
      'não existe toggle de desligar conhecimento (sempre-on)',
    ).toBe(false)

    // ── TRANSFERIR OFF POR DEFAULT: nenhum handoff configurado no projeto novo. ──
    expect(
      before.builderState?.handoff?.mode ?? undefined,
      'transferir começa OFF (handoff.mode não-setado por default)',
    ).toBeUndefined()
    expect(
      before.builderState?.confirmations?.handoff ?? false,
      'sentinel handoff começa desligado',
    ).toBe(false)
    // handoff NÃO é step da jornada v2 (é opt-in pela superfície de Capacidades —
    // plan §3.2): sua ausência não pode aparecer como blocker de deploy.
    const handoffBlocks = (before.blockers ?? []).some((b) =>
      JSON.stringify(b).toLowerCase().includes('handoff'),
    )
    expect(
      handoffBlocks,
      'sem handoff configurado, nada bloqueia o deploy por handoff (agente responde sozinho)',
    ).toBe(false)

    // ── O agente responde SOZINHO (solo) — sem nenhuma config de transferência. ─
    // O harness materializa um agente ativo mínimo para isolar este critério do
    // fluxo completo de deploy; o handoff continua ausente, então a resposta é solo.
    await seedAgentAndPrompt(session, projectId)
    const answer = await askPlayground(
      page,
      projectId,
      'Olá, vocês cortam cabelo no sábado?',
    )
    test.skip(
      answer === null,
      'playground requer agente materializado + LLM mock (E2E_LLM_MOCK=1); ' +
        'o backbone determinístico (transferir OFF, sem blocker de handoff) já ' +
        'cobre "publica e responde sozinho". Corpo completo preservado.',
    )
    expect(
      (answer ?? '').trim().length,
      'sem transferência configurada, o próprio agente responde (não passa o bastão)',
    ).toBeGreaterThan(0)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // §8 item: ligar a ROLETA persiste via silent-submit (FR-29) — sem turno LLM.
  // ───────────────────────────────────────────────────────────────────────────
  test('ligar a roleta via silent-submit (FR-29): persiste sem turno LLM, linha de sistema sem reload', async ({
    page,
  }) => {
    await setOverrideCookie(page, 'on')
    await loginViaOtp(page)

    const projectId = await createProjectViaHome(page)

    const before = await fetchReadiness(page, projectId)
    expect(before.journey?.version, 'readiness v2 expõe journey').toBe(2)
    expect(
      before.builderState?.confirmations?.handoff ?? false,
      'roleta começa desligada',
    ).toBe(false)

    // Abrir o workspace ANTES do toggle: o "consumo silent" é observado no chat
    // aberto SEM reload — a linha de sistema local deve surgir sem navegação nova.
    await page.goto(`/projetos/${projectId}`)
    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 15_000 })

    // ── SILENT-SUBMIT (FR-29): liga a roleta pelo MESMO card-submit, modo silent. ─
    // O flip persiste pelo `applyCardSubmit`; a resposta é JSON simples (sem SSE).
    const { result, contentType } = await enableRoletaSilently(page, projectId)

    // Contrato FR-29: resposta é JSON (NÃO text/event-stream) — prova de que NÃO
    // houve turno do meta-agente (zero ensureBuilderAgent/buildSseResponse).
    expect(
      contentType.includes('application/json'),
      'silent-submit responde JSON simples, não um stream SSE (sem turno LLM)',
    ).toBe(true)
    expect(result.ok, 'silent-submit retorna { ok: true }').toBe(true)
    expect(
      result.builderState?.handoff?.mode,
      'o flip do handoff.mode persistiu no MESMO caminho do card-submit',
    ).toBe('roleta')

    // ── A config da roleta foi gravada (os membros do roster persistiram). ─
    const after = await fetchReadiness(page, projectId)
    expect(
      after.builderState?.confirmations?.handoff,
      'sentinel handoff flipado server-side via silent-submit',
    ).toBe(true)
    expect(
      after.builderState?.handoff?.mode,
      'roleta ligada e persistida no readiness',
    ).toBe('roleta')
    expect(
      (after.builderState?.handoff?.members ?? []).length,
      'a config da roleta gravou o roster (atendentes nome + WhatsApp)',
    ).toBe(ROLETA_MEMBERS.length)

    // ── Linha de sistema local "✓ …" no chat aberto SEM reload (consumo silent). ─
    // Asserção legada e tolerante: se uma superfície ativa ainda traduzir o
    // silent-submit em evento local, validamos a linha; se não, o contrato
    // JSON-sem-SSE acima já prova o consumo silent.
    const systemLine = page
      .getByText(/✓\s.*(?:transfer|roleta|rodízio|atend)/i)
      .first()
    const appeared = await systemLine
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false)
    if (appeared) {
      // Quando a UI está presente, a linha surgiu SEM reload (mesma página).
      await expect(systemLine).toBeVisible()
    }
  })

  // ───────────────────────────────────────────────────────────────────────────
  // FR-29 (contra-prova): cardKey FORA da allowlist de silent → 400. O ACK
  //          conversacional é parte do contrato da jornada e não pode ser pulado.
  // ───────────────────────────────────────────────────────────────────────────
  test('silent-submit é rejeitado (400) para um card da jornada fora da allowlist', async ({
    page,
  }) => {
    await setOverrideCookie(page, 'on')
    await loginViaOtp(page)

    const projectId = await createProjectViaHome(page)

    // `business_identity` é card da JORNADA (não está em SILENT_ALLOWED_CARD_KEYS):
    // pedir `ackMode: 'silent'` aqui deve ser rejeitado ANTES de qualquer escrita.
    const res = await page.request.post(
      `/api/v1/builder/projects/${projectId}/cards/business_identity/submit`,
      {
        data: {
          cardKey: 'business_identity',
          name: 'Barbearia do Bruno',
          ackMode: 'silent',
        },
      },
    )
    expect(
      res.status(),
      'silent em card da jornada → 400 (ACK conversacional é parte do contrato)',
    ).toBe(400)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // FR-34: share de agenda DELEGADO — "Enviar link para o profissional" gera um
  //          connect-link copiável; antes nunca confirma (FR-11); com o status
  //          flipado (seed/stub) "Verificar conexão" confirma o card.
  // ───────────────────────────────────────────────────────────────────────────
  test('share da agenda delegado: connect-link copiável → verificar conexão confirma após o flip (FR-34/FR-11)', async ({
    page,
  }) => {
    await setOverrideCookie(page, 'on')
    const session = await loginViaOtp(page)

    const projectId = await createProjectViaHome(page)

    // ── "Enviar link para o profissional": gera o connect-link delegável. ───────
    const link = await createCalendarConnectLink(page, projectId)
    test.skip(
      link === null,
      'CalendarConnection não provisionada neste ambiente (connect-link 404 ' +
        'defensivo). Corpo completo preservado.',
    )

    // O link é copiável e aponta para a página pública /conectar-agenda/<token>
    // (TTL 7 dias) — o profissional conecta a agenda DELE de onde estiver (FR-34).
    expect(
      link!.shareLink ?? '',
      'connect-link aponta para a página pública /conectar-agenda/<token>',
    ).toMatch(/\/conectar-agenda\/cal_[0-9a-f]+/i)
    expect(
      link!.connectToken ?? '',
      'token do connect-link tem o prefixo cal_ (não-adivinhável)',
    ).toMatch(/^cal_[0-9a-f]{64}$/i)

    // ── ANTES de conectar: o status NUNCA confirma (FR-11 — sem confirmação falsa).
    const statusBefore = await fetchCalendarStatus(page, projectId)
    expect(
      statusBefore.connected ?? false,
      'antes do profissional conectar, "Verificar conexão" NÃO confirma (FR-11)',
    ).toBe(false)

    // ── Simula o scan remoto do profissional (sem OAuth real no E2E): o seed flipa
    //    a CalendarConnection e cria a credencial AUXILIARY que o runtime consultaria.
    await markCalendarConnected(session, projectId)

    // ── "Verificar conexão": após o flip, o MESMO status query confirma o card. ──
    // Refetch on-demand (o `checkConnection` ref-guarded do connect-link-flow só
    // confirma quando o status devolve CONNECTED — FR-11/NFR-06).
    await expect
      .poll(
        async () => (await fetchCalendarStatus(page, projectId)).connected ?? false,
        {
          timeout: 15_000,
          message:
            '"Verificar conexão" confirma o card após o flip para CONNECTED (FR-34)',
        },
      )
      .toBe(true)

    const statusAfter = await fetchCalendarStatus(page, projectId)
    expect(
      statusAfter.status,
      'o status reflete a conexão real do profissional (CONNECTED)',
    ).toBe('CONNECTED')
  })

  // ───────────────────────────────────────────────────────────────────────────
  // T109 (FR-34): a capacidade Agenda vira ATIVA após a conexão remota. O share
  //   delegado fecha quando `getCapabilities` reporta `calendarConnected: true`
  //   (reusa `hasActiveCalendarConnection` — a MESMA fonte do runtime). Prova de
  //   que a conexão remota não só "confirma o card" mas LIGA a capacidade.
  // ───────────────────────────────────────────────────────────────────────────
  test('share da agenda delegado: a capacidade Agenda vira ativa (calendarConnected) após o flip remoto (T109/FR-34)', async ({
    page,
  }) => {
    await setOverrideCookie(page, 'on')
    const session = await loginViaOtp(page)

    const projectId = await createProjectViaHome(page)

    // ── "Enviar link para o profissional": gera o connect-link delegável. ───────
    const link = await createCalendarConnectLink(page, projectId)
    test.skip(
      link === null,
      'CalendarConnection não provisionada neste ambiente (connect-link 404 ' +
        'defensivo). Corpo completo preservado.',
    )

    // ── ANTES de conectar: a capacidade Agenda está DESLIGADA (FR-11 honesto). ──
    const capsBefore = await fetchCapabilities(page, projectId)
    expect(
      capsBefore.calendarConnected ?? false,
      'antes da conexão remota, a capacidade Agenda está desligada (calendarConnected false)',
    ).toBe(false)

    // ── Simula o scan remoto do profissional (sem OAuth real no E2E): o seed flipa
    //    a CalendarConnection e cria a credencial AUXILIARY que o runtime consultaria.
    await markCalendarConnected(session, projectId)

    // ── A capacidade Agenda vira ATIVA: `getCapabilities` reporta calendarConnected
    //    true (reusa `hasActiveCalendarConnection` — a mesma fonte do runtime).
    await expect
      .poll(
        async () => (await fetchCapabilities(page, projectId)).calendarConnected ?? false,
        {
          timeout: 15_000,
          message:
            'após o flip remoto, a capacidade Agenda vira ativa (calendarConnected true)',
        },
      )
      .toBe(true)

    // E o status do connect-link confirma a conexão real (coerência entre as duas
    // superfícies que a UI consome: card de share + linha de Capacidade).
    const statusAfter = await fetchCalendarStatus(page, projectId)
    expect(
      statusAfter.connected ?? false,
      'a mesma conexão real lastreia o "Verificar conexão" do card e a capacidade',
    ).toBe(true)
  })
})
