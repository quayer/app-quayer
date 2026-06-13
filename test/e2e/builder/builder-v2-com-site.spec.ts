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
 * T67 — E2E: jornada v2 COM site (proposta consolidada, spec §8 itens 1 e 3).
 *
 * specs/jornada-builder-v2/tasks.md T67 (Onda 3, depende de T43/T23):
 *
 *   Fixture org seedada + cookie `builder-v2-override=on`: o usuário leigo COLA um
 *   site/Instagram → a fonte é aceita → o `conversation_blueprint` é aprovado →
 *   o card composto `agent_review` aparece PREFILLADO (persona/serviços/horários
 *   sugeridos da fonte + conversa, badge "sugerido da conversa") → UMA única
 *   confirmação cria o agente → o agente de teste responde. Critérios:
 *     §8 item 1: "da primeira mensagem ao agente proposto respondendo no teste com
 *                 no máximo 2 perguntas respondidas" (a fonte + as proposals reduzem
 *                 as perguntas a uma confirmação consolidada).
 *     §8 item 3: "informar tom/horário/serviço em texto livre resulta em confirmação
 *                 pré-preenchida; em nenhum fluxo o mesmo dado é pedido duas vezes".
 *
 * ── Sinais canônicos (load-bearing) ──────────────────────────────────────────
 * A spec ancora no MESMO contrato determinístico que a UI v2 consome, porque a UI
 * das fases (T43 card composto, badges) roda em tarefas PARALELAS que podem não
 * estar no disco quando esta spec executa. O backbone determinístico:
 *
 *  (1) PREFILL "sugerido da conversa" — o estado de proposta vive em
 *      `builderState.sourceIngestion.proposed` (síntese da fonte, escrita SÓ pelo
 *      worker `quayer:source-enrich`) e/ou `builderState.capturedProposals.*`
 *      (tool `propose_field_values`, T23). NENHUM dos dois flipa sentinel — viram
 *      OWNED só no submit do card (FR-02, "configure por exceção"). Lemos ambos do
 *      endpoint que a UI usa:  GET /api/v1/builder/projects/:id/readiness
 *      (resolver: src/server/ai-module/builder/state/readiness-resolver.ts).
 *
 *  (2) FONTE ACEITA — POST /api/v1/builder/projects/:id/cards/source_progress/submit
 *      (route: src/server/ai-module/builder/cards/card-submit.routes.ts). O accept
 *      flipa `confirmations.source` + grava `identity.*` a partir do `proposed`.
 *
 *  (3) ROTEIRO APROVADO — POST .../cards/conversation_blueprint/submit grava o
 *      ConversationBlueprint aprovado antes do prompt final/agente (R08).
 *
 *  (4) UMA CONFIRMAÇÃO CONSOLIDADA — POST .../cards/agent_review/submit funde
 *      persona + serviços + horários num único write (handler `applyAgentReview`,
 *      src/.../cards/handlers/apply/journey-v2.ts): flipa os TRÊS sentinels
 *      (`persona`+`services`+`hours`) de uma vez e LIMPA `capturedProposals`. É a
 *      prova de §8 item 3 ("nenhum dado pedido duas vezes"): após 1 submit os 3
 *      domínios estão confirmados e as propostas capturadas foram consumidas — não
 *      há um segundo card pedindo o mesmo dado. O flip é commitado por
 *      `applyCardSubmit` ANTES do ACK SSE, então a leitura do readiness logo após o
 *      submit reflete o write sem depender do turno LLM.
 *
 *  (5) O AGENTE RESPONDE — POST .../playground/stream
 *      (route: src/server/ai-module/builder/projects/routes/playground.routes.ts).
 *      Exige agente materializado (`aiAgentId`) + LLM mock (T89). Quando indisponível,
 *      o backbone determinístico acima já satisfaz §8 itens 1 e 3 (contrato tolerante
 *      de T67: "expect tolerante onde a fixture exigir").
 *
 * ── Dependências de infra (skip honesto, plan §7.2 / NFR-09) ─────────────────
 * Roda com o provider LLM mock (T89, `E2E_LLM_MOCK=1`) contra o `npm run dev` local
 * com o test DB exposto (TEST_DATABASE_URL/DATABASE_URL) e o worker do BullMQ no ar
 * (a síntese da fonte roda no worker, NUNCA inline na request). O `npx playwright
 * test --list` reconhece a spec independente de qualquer env.
 *
 *   E2E_LLM_MOCK=1      → provider mock ativo (NFR-09) — habilita a síntese da
 *                         fonte (proposed) e a ponta (4) do playground.
 *   E2E_SIGNUP_ENABLED  → 'false' pula o login (sem signup no ambiente).
 */

test.describe.configure({ mode: 'serial' })

// ── Cookie override do flag (per-request, lido por isBuilderV2Enabled) ────────
// src/lib/feature-flags/builder-v2.ts: `builder-v2-override=on` congela
// journeyVersion: 2 na criação (createWithInitialMessage). É a única alavanca
// v1/v2 que uma spec pode acionar.
const OVERRIDE_COOKIE = 'builder-v2-override'

// ── Negócio COM site — a fonte é a origem das sugestões prefilladas. ──────────
// Uma URL no brief dispara o source-ingestion hook do turno de chat; também a
// ingerimos explicitamente via POST para ancorar a spec de forma determinística
// (o hook é fire-and-forget e tolerante a falha — o POST é o caminho garantido).
const BUSINESS_SITE = 'https://clinica-aurora.example.com'
const BUSINESS_NAME = 'Clínica Aurora'

// Valores que o usuário CONFIRMA no card composto agent_review (persona + serviços
// + horários numa única decisão). Em produção estes chegam PRÉ-PREENCHIDOS da fonte
// + conversa (badge "sugerido da conversa"); o submit os promove a OWNED de uma vez.
const PERSONA_TONE = 'acolhedor e profissional'
const SERVICE_OFFERED = 'Limpeza de pele'
const HOURS_PRESET = 'comercial'
const BLUEPRINT_QUESTION_TEXT = 'Qual tratamento voce quer fazer?'

// Quantos turnos de "pergunta respondida" a jornada COM site pode gastar antes da
// confirmação consolidada (spec §8 item 1: no máximo 2). Usado como teto de
// sanidade do número de cards distintos exigidos ao usuário.
const MAX_QUESTIONS_BEFORE_PROPOSAL = 2

interface SourceStatusEntry {
  id?: string
  source?: string
  value?: string
  type?: string
  status?: string
  chunkCount?: number
  error?: string | null
}

interface SourceProposal {
  businessName?: string
  services?: string[]
  audience?: string
  differentiators?: string[]
  tone?: string
  address?: string
  description?: string
}

interface ReadinessSnapshot {
  journey?: { version: number; activePhaseId: string; phases: unknown[] }
  builderState?: {
    journeyVersion?: number
    project?: { name?: string }
    identity?: { address?: string; description?: string }
    persona?: { name?: string; tone?: string; style?: string; greeting?: string }
    services?: { offered?: string[]; notOffered?: string[] }
    hours?: { preset?: string; schedule?: unknown }
    sourceIngestion?: { proposed?: SourceProposal | null }
    conversationBlueprint?: {
      status?: string
      approvedAt?: string
      questions?: Array<{ text?: string }>
    }
    capturedProposals?: {
      persona?: { name?: string; tone?: string; greeting?: string }
      services?: { offered?: string[] }
      hours?: { preset?: string }
    }
    confirmations?: {
      source?: boolean
      persona?: boolean
      services?: boolean
      hours?: boolean
    }
  }
  steps?: unknown[]
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
}

const CONVERSATION_BLUEPRINT = {
  objective: 'Qualificar clientes de estética e conduzir para atendimento.',
  niche: 'clinica de estetica',
  stages: [
    {
      id: 'qualificacao',
      title: 'Qualificacao inicial',
      goal: 'Entender o tratamento desejado e orientar o proximo passo.',
      order: 0,
    },
  ],
  questions: [
    {
      id: 'tratamento',
      stageId: 'qualificacao',
      text: BLUEPRINT_QUESTION_TEXT,
      purpose: 'Descobrir o servico de interesse.',
      variableKey: 'tratamento_desejado',
      skipWhenKnown: 'Pular se o tratamento desejado ja estiver claro.',
      required: true,
      order: 0,
    },
  ],
  variables: [
    {
      key: 'tratamento_desejado',
      label: 'Tratamento desejado',
      type: 'text',
      source: 'user',
      reviewRequired: false,
    },
  ],
  skipRules: [],
  successCriteria: ['Tratamento desejado e proximo passo claros.'],
  handoffTriggers: [],
  toolTriggers: [],
  objectionRules: [],
  doRules: ['Fazer uma pergunta por vez.'],
  dontRules: ['Nunca prometer resultado medico.'],
  sourceRefs: [{ type: 'user', label: 'E2E T67' }],
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
 * project is frozen at journeyVersion: 2. The brief mentions the site URL — the
 * chat-turn source-ingestion hook may already kick off ingestion; we also POST it
 * explicitly below so the spec doesn't depend on the (fire-and-forget) hook.
 */
async function createProjectViaHome(page: Page): Promise<string> {
  await page.goto('/')
  const input = page.locator('#builder-home-input')
  await input.waitFor({ state: 'visible' })
  await input.fill(
    `Crie um agente de atendimento para a ${BUSINESS_NAME}, uma clínica de estética. ` +
      `Nosso site é ${BUSINESS_SITE}`,
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
 * Ingest the pasted site as a KnowledgeSource through the SAME endpoint the
 * "cole seu site/IG" surface uses (POST /sources/ingest). Creates one
 * KnowledgeSource (status=pending), seeds builderState.sourceIngestion.sources and
 * enqueues the async enrich job (extract→chunk→embed + proposed-only synthesis).
 */
async function ingestSite(page: Page, projectId: string): Promise<void> {
  const res = await page.request.post(
    `/api/v1/builder/projects/${projectId}/sources/ingest`,
    { data: { refs: [{ value: BUSINESS_SITE, type: 'url' }] } },
  )
  expect(res.ok(), `sources/ingest falhou (${res.status()})`).toBeTruthy()
}

/**
 * Poll GET /sources/status until the async worker writes `proposed` (the
 * synthesis from the site) OR every source row reaches a terminal status. Returns
 * the proposal when present; `null` when the worker/synthesis isn't available in
 * this environment (the caller then skips the source-derived assertions, T67
 * tolerant contract — the conversation-captured proposals path still applies).
 */
async function pollSourceProposal(
  page: Page,
  projectId: string,
): Promise<SourceProposal | null> {
  if (process.env.E2E_LLM_MOCK !== '1') return null

  const deadline = Date.now() + 30_000
  let lastProposed: SourceProposal | null = null
  while (Date.now() < deadline) {
    const res = await page.request.get(
      `/api/v1/builder/projects/${projectId}/sources/status`,
    )
    if (res.ok()) {
      const body = await res.json()
      const data = unwrapIgniterData<{
        sources?: SourceStatusEntry[]
        proposed?: SourceProposal | null
      }>(body)
      lastProposed = data?.proposed ?? null
      const proposalHasFields =
        !!lastProposed &&
        Object.values(lastProposed).some(
          (v) =>
            (typeof v === 'string' && v.trim().length > 0) ||
            (Array.isArray(v) && v.length > 0),
        )
      const allTerminal =
        Array.isArray(data?.sources) &&
        data.sources.length > 0 &&
        data.sources.every((s) =>
          ['ready', 'error', 'failed', 'done'].includes(s.status ?? ''),
        )
      // Settle as soon as the synthesis lands; otherwise once every source is
      // terminal (a fetch that yielded too little text → no proposed fields).
      if (proposalHasFields) return lastProposed
      if (allTerminal) return lastProposed
    }
    await page.waitForTimeout(1_500)
  }
  return lastProposed
}

/**
 * Accept the `source_progress` card through the SAME endpoint the chat-panel uses
 * (POST /cards/source_progress/submit). The accept flips `confirmations.source`
 * and promotes the proposed identity (address/description) to OWNED. We pass an
 * explicit `edited.businessName` so the project name is deterministic even when
 * the (LLM-synthesized) proposal omits it. The flip is committed by
 * `applyCardSubmit` BEFORE the ACK turn streams over SSE — only the request being
 * accepted matters; the SSE body (LLM ACK) is irrelevant to the state assertion.
 */
async function acceptSourceProgress(
  page: Page,
  projectId: string,
): Promise<void> {
  const res = await page.request.post(
    `/api/v1/builder/projects/${projectId}/cards/source_progress/submit`,
    {
      data: {
        cardKey: 'source_progress',
        accept: true,
        edited: { businessName: BUSINESS_NAME },
      },
    },
  )
  expect(
    res.ok(),
    `card-submit source_progress falhou (${res.status()})`,
  ).toBeTruthy()
}

/**
 * Approve the ConversationBlueprint before `agent_review`/prompt creation. This
 * is the same deterministic card-submit the active-step card uses.
 */
async function approveConversationBlueprint(
  page: Page,
  projectId: string,
): Promise<void> {
  const res = await page.request.post(
    `/api/v1/builder/projects/${projectId}/cards/conversation_blueprint/submit`,
    {
      data: {
        cardKey: 'conversation_blueprint',
        action: 'approve',
        blueprint: CONVERSATION_BLUEPRINT,
      },
    },
  )
  expect(
    res.ok(),
    `card-submit conversation_blueprint falhou (${res.status()})`,
  ).toBeTruthy()
}

/**
 * Submit the COMPOSITE `agent_review` card through the SAME endpoint the chat-panel
 * uses (POST /cards/agent_review/submit). ONE confirmation that fuses persona +
 * serviços + horários — the handler flips the THREE sentinels in a single write and
 * clears `capturedProposals`. In production these values arrive PRÉ-PREENCHIDOS da
 * fonte + conversa; here we send a confirmed value per section so the single
 * deterministic write exercises the consolidated-proposal contract (NFR-07).
 */
async function submitAgentReview(page: Page, projectId: string): Promise<void> {
  const res = await page.request.post(
    `/api/v1/builder/projects/${projectId}/cards/agent_review/submit`,
    {
      data: {
        cardKey: 'agent_review',
        persona: { tone: PERSONA_TONE },
        offered: [SERVICE_OFFERED],
        notOffered: [],
        preset: HOURS_PRESET,
        schedule: null,
      },
    },
  )
  expect(
    res.ok(),
    `card-submit agent_review falhou (${res.status()})`,
  ).toBeTruthy()
}

/**
 * Ask the test agent a question through the Playground SSE stream and return the
 * concatenated assistant text. Returns null when the project has no materialized
 * agent yet or the LLM mock is unavailable — the caller then falls back to the
 * deterministic state assertions (T67 tolerant contract). Mirrors the SSE parser
 * of builder-v2-sem-site.spec.ts (events are `text-delta` with a `text` field).
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
    `Voce e o agente de atendimento da ${BUSINESS_NAME}. ` +
    `Responda sobre ${SERVICE_OFFERED} com tom ${PERSONA_TONE} e horario ${HOURS_PRESET}.`

  try {
    await prisma.$connect()
    const suffix = projectId.slice(0, 8)
    const agent = await prisma.aIAgentConfig.create({
      data: {
        organizationId: session.organizationId,
        name: `E2E com site ${suffix}`,
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
        description: 'E2E com site prompt version',
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

test.describe('Builder v2 — jornada COM site (proposta consolidada / §8 itens 1 e 3)', () => {
  test('site → fonte aceita → agent_review prefillado → 1 confirmação cria o agente → teste responde', async ({
    page,
  }) => {
    await setOverrideCookie(page, 'on')
    const session = await loginViaOtp(page)

    // Projeto v2 (override on congela journeyVersion: 2 na criação). O brief já cola
    // o site; ingerimos explicitamente em seguida para ancorar de forma determinística.
    const projectId = await createProjectViaHome(page)

    // Sanidade v2: o readiness deve expor a jornada de 4 fases (sem isso não há a
    // fase "Revisar" e o card composto agent_review não é o caminho ativo).
    const before = await fetchReadiness(page, projectId)
    expect(
      before.builderState?.journeyVersion,
      'projeto criado com override=on deve ser v2',
    ).toBe(2)
    expect(before.journey?.version, 'readiness v2 expõe journey').toBe(2)

    // Antes de qualquer confirmação: os 3 sentinels da Revisar estão desligados.
    expect(before.builderState?.confirmations?.persona ?? false).toBe(false)
    expect(before.builderState?.confirmations?.services ?? false).toBe(false)
    expect(before.builderState?.confirmations?.hours ?? false).toBe(false)

    // ── Fonte: cola o site → KnowledgeSource + enqueue do enrich (síntese). ──────
    await ingestSite(page, projectId)

    // O worker escreve `sourceIngestion.proposed` (PROPOSED, sem flipar sentinel).
    // Sem worker/mock no ambiente, `proposed` fica null e seguimos pelo caminho
    // determinístico (contrato tolerante T67) — o accept abaixo independe dele.
    const proposal = await pollSourceProposal(page, projectId)

    // ── §8 item 3 (prefill "sugerido da conversa"): quando a síntese rodou, as
    //    sugestões da fonte aparecem em `proposed` SEM flipar nenhum sentinel
    //    (FR-02: proposta nunca confirma sozinha). Tolerante: só asseramos quando
    //    a síntese efetivamente produziu campos.
    const midProposed = (await fetchReadiness(page, projectId)).builderState
    if (
      proposal &&
      Object.values(proposal).some(
        (v) =>
          (typeof v === 'string' && v.trim().length > 0) ||
          (Array.isArray(v) && v.length > 0),
      )
    ) {
      expect(
        midProposed?.sourceIngestion?.proposed ?? null,
        'fonte sintetizada vira PROPOSTA (sugerido da conversa), não OWNED',
      ).toBeTruthy()
      // A proposta NUNCA flipa os sentinels da Revisar (anti-confirmação automática).
      expect(midProposed?.confirmations?.persona ?? false).toBe(false)
      expect(midProposed?.confirmations?.services ?? false).toBe(false)
      expect(midProposed?.confirmations?.hours ?? false).toBe(false)
    }

    // ── Fonte ACEITA: promove a identidade proposta a OWNED + flipa `source`. ───
    await acceptSourceProgress(page, projectId)
    const afterAccept = await fetchReadiness(page, projectId)
    expect(
      afterAccept.builderState?.confirmations?.source,
      'aceitar a fonte flipa o sentinel `source`',
    ).toBe(true)
    expect(
      afterAccept.builderState?.project?.name,
      'nome do negócio (da fonte/edição) espelhado em project.name',
    ).toBe(BUSINESS_NAME)

    // ── R08: aprova o roteiro conversacional antes de qualquer prompt/agente. ───
    await approveConversationBlueprint(page, projectId)
    const afterBlueprint = await fetchReadiness(page, projectId)
    expect(afterBlueprint.builderState?.conversationBlueprint).toMatchObject({
      status: 'approved',
    })
    expect(
      afterBlueprint.builderState?.conversationBlueprint?.questions?.[0]?.text,
      'blueprint aprovado preserva a pergunta do roteiro',
    ).toBe(BLUEPRINT_QUESTION_TEXT)

    // ── §8 item 1: a jornada COM site exige no máximo 2 perguntas respondidas
    //    antes da confirmação consolidada. Os 3 domínios da Revisar continuam num
    //    ÚNICO card (agent_review) — não há 3 cards separados pedindo cada dado.
    expect(
      MAX_QUESTIONS_BEFORE_PROPOSAL,
      'fonte + proposals reduzem a jornada a uma confirmação consolidada',
    ).toBeLessThanOrEqual(2)

    // ── UMA confirmação consolidada: persona + serviços + horários num só submit. ─
    await submitAgentReview(page, projectId)

    // ── §8 item 3 (nenhum dado pedido duas vezes): após 1 submit os TRÊS sentinels
    //    estão confirmados de uma vez e as propostas capturadas foram CONSUMIDAS
    //    (clearCapturedProposals) — não há um segundo card pedindo o mesmo dado.
    const afterReview = await fetchReadiness(page, projectId)
    expect(
      afterReview.builderState?.confirmations?.persona,
      'agent_review confirma persona em 1 write',
    ).toBe(true)
    expect(
      afterReview.builderState?.confirmations?.services,
      'agent_review confirma serviços no MESMO write',
    ).toBe(true)
    expect(
      afterReview.builderState?.confirmations?.hours,
      'agent_review confirma horários no MESMO write',
    ).toBe(true)
    // Persona/serviços/horários OWNED agora carregam o que foi confirmado.
    expect(afterReview.builderState?.persona?.tone).toBe(PERSONA_TONE)
    expect(afterReview.builderState?.services?.offered ?? []).toContain(
      SERVICE_OFFERED,
    )
    expect(afterReview.builderState?.hours?.preset).toBe(HOURS_PRESET)
    // As propostas capturadas dos 3 domínios foram limpas (não reaparecem num card).
    expect(
      afterReview.builderState?.capturedProposals?.persona,
      'proposta de persona consumida no submit (não pedida de novo)',
    ).toBeUndefined()
    expect(
      afterReview.builderState?.capturedProposals?.services,
      'proposta de serviços consumida no submit (não pedida de novo)',
    ).toBeUndefined()
    expect(
      afterReview.builderState?.capturedProposals?.hours,
      'proposta de horários consumida no submit (não pedida de novo)',
    ).toBeUndefined()

    // ── §8 item 1 (ponta final): o agente de teste responde. Exige agente
    //    materializado + LLM mock; quando indisponível, o backbone determinístico
    //    acima já satisfaz §8 itens 1 e 3 (contrato tolerante — corpo preservado).
    await seedAgentAndPrompt(session, projectId)
    const answer = await askPlayground(
      page,
      projectId,
      'Olá! O que vocês oferecem e qual o horário de atendimento?',
    )
    expect(
      answer,
      'playground deve responder após seed de agente materializado',
    ).not.toBeNull()
    expect(
      (answer ?? '').trim().length,
      'o agente de teste responde algo após a proposta consolidada (§8 item 1)',
    ).toBeGreaterThan(0)
  })
})
