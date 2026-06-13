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
 * R08 — Jornada v2: ConversationBlueprint + Refinando antes da publicacao.
 *
 * Backbone deterministico:
 *   1. `conversation_blueprint` e aprovado por card-submit antes do prompt final.
 *   2. Um agente/prompt minimo e seedado no test DB para exercitar o gate real.
 *   3. `/deploy/publish-version` bloqueia antes do Refinando aprovado.
 *   4. Com `E2E_LLM_MOCK=1`, o card `refinement` roda o pipeline sem LLM real e
 *      a mesma versao passa a publicar.
 *
 * O cenario de aprovacao do Refinando depende do servidor dev ter sido iniciado
 * com o provider mock (`E2E_LLM_MOCK=1`). Sem isso, o teste ainda valida o bloqueio
 * de publicacao e pula honestamente a parte que executaria conversas de preview.
 */

test.describe.configure({ mode: 'serial' })

const OVERRIDE_COOKIE = 'builder-v2-override'
const BLUEPRINT_QUESTION_TEXT = 'Resposta deterministica do provider mock'
const BUSINESS_NAME = 'R08 Blueprint Refinement'
const BUSINESS_ADDRESS = 'Rua R08, 123'
const BUSINESS_DESCRIPTION =
  'Negocio de teste para validar roteiro conversacional e Refinando.'
const PERSONA_TONE = 'objetivo e claro'
const SERVICE_OFFERED = 'Atendimento de teste'
const HOURS_PRESET = 'comercial'

const APPROVED_BLUEPRINT = {
  objective: 'Validar o fluxo de atendimento antes da publicacao.',
  niche: 'servico local',
  stages: [
    {
      id: 'qualificacao',
      title: 'Qualificacao inicial',
      goal: 'Confirmar que o mock cobre o roteiro.',
      order: 0,
    },
  ],
  questions: [
    {
      id: 'mock_response',
      stageId: 'qualificacao',
      text: BLUEPRINT_QUESTION_TEXT,
      purpose: 'Confirmar que o harness sem LLM real executou.',
      variableKey: 'mock_flag',
      skipWhenKnown: 'Pular apenas quando mock_flag ja estiver validado.',
      required: true,
      order: 0,
    },
  ],
  variables: [
    {
      key: 'mock_flag',
      label: 'Marcador mock',
      type: 'boolean',
      source: 'default',
      reviewRequired: false,
    },
  ],
  skipRules: [],
  successCriteria: ['Marcador do mock observado no transcript.'],
  handoffTriggers: [],
  toolTriggers: [],
  objectionRules: [],
  doRules: ['Usar o roteiro aprovado como contrato de teste.'],
  dontRules: [],
  sourceRefs: [],
}

interface SeededSession {
  email: string
  userId: string
  organizationId: string
}

interface ReadinessSnapshot {
  step?: { id?: string; title?: string }
  requiredMissing?: string[]
  journey?: {
    version?: number
    activePhaseId?: string
    phases?: Array<{ id?: string; steps?: unknown[] }>
  }
  builderState?: {
    journeyVersion?: number
    conversationBlueprint?: {
      status?: string
      approvedAt?: string
      questions?: Array<{ id?: string; text?: string }>
    }
    refinement?: {
      status?: string
      score?: number
      material?: {
        promptVersionId?: string
        promptVersionNumber?: number
      }
    }
    confirmations?: {
      businessIdentity?: boolean
      persona?: boolean
      services?: boolean
      hours?: boolean
      agentApproved?: boolean
      testDrive?: boolean
    }
  }
  blockers?: Array<{ check?: string; message?: string }>
  isDeployReady?: boolean
}

interface PublishResult {
  ok: boolean
  status: number
  text: string
}

interface SeededAgent {
  agentId: string
  promptVersionId: string
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

async function loginViaOtp(page: Page): Promise<SeededSession> {
  test.skip(
    process.env.E2E_SIGNUP_ENABLED === 'false',
    'login indisponivel neste ambiente (E2E_SIGNUP_ENABLED=false)',
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
    throw new Error('unreachable')
  }
  expect(otp).toMatch(/^\d{6}$/)

  const otpField = page.locator('input[autocomplete="one-time-code"]').first()
  await otpField.waitFor({ state: 'attached' })
  await otpField.fill(otp)
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

async function createProjectViaHome(page: Page): Promise<string> {
  await page.goto('/')
  const input = page.locator('#builder-home-input')
  await input.waitFor({ state: 'visible' })
  await input.fill(
    'Crie um agente de atendimento para validar blueprint e refinamento R08',
  )
  await input.press('Enter')

  await waitForRedirect(page, /\/projetos\/[0-9a-f-]{36}/i, 20_000)
  const match = page.url().match(/\/projetos\/([0-9a-f-]{36})/i)
  expect(match, 'esperado redirect para /projetos/<uuid>').not.toBeNull()
  return match![1]
}

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

async function submitCard(
  page: Page,
  projectId: string,
  cardKey: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await page.request.post(
    `/api/v1/builder/projects/${projectId}/cards/${cardKey}/submit`,
    { data: { cardKey, ...payload } },
  )
  return { ok: res.ok(), status: res.status(), text: await res.text() }
}

async function submitBusinessIdentity(
  page: Page,
  projectId: string,
): Promise<void> {
  const res = await submitCard(page, projectId, 'business_identity', {
    name: BUSINESS_NAME,
    address: BUSINESS_ADDRESS,
    description: BUSINESS_DESCRIPTION,
  })
  expect(res.ok, `business_identity aceito (${res.status})`).toBeTruthy()
}

async function approveBlueprint(
  page: Page,
  projectId: string,
): Promise<void> {
  const res = await submitCard(page, projectId, 'conversation_blueprint', {
    action: 'approve',
    blueprint: APPROVED_BLUEPRINT,
  })
  expect(res.ok, `conversation_blueprint aceito (${res.status})`).toBeTruthy()
}

async function submitAgentReview(
  page: Page,
  projectId: string,
): Promise<void> {
  const res = await submitCard(page, projectId, 'agent_review', {
    persona: { tone: PERSONA_TONE },
    offered: [SERVICE_OFFERED],
    notOffered: [],
    preset: HOURS_PRESET,
    schedule: null,
  })
  expect(res.ok, `agent_review aceito (${res.status})`).toBeTruthy()
}

async function skipTestDrive(page: Page, projectId: string): Promise<void> {
  const res = await submitCard(page, projectId, 'test_drive', { action: 'skip' })
  expect(res.ok, `test_drive(skip) aceito (${res.status})`).toBeTruthy()
}

async function seedAgentAndPrompt(
  session: SeededSession,
  projectId: string,
): Promise<SeededAgent> {
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!databaseUrl) {
    test.skip(true, 'seeding requires TEST_DATABASE_URL / DATABASE_URL')
    throw new Error('unreachable')
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  }) as unknown as SeedPrismaClient

  const systemPrompt =
    'Voce e um agente de teste E2E. Siga o blueprint aprovado e use o marcador: ' +
    BLUEPRINT_QUESTION_TEXT +
    '.'

  try {
    await prisma.$connect()
    const suffix = projectId.slice(0, 8)
    const agent = await prisma.aIAgentConfig.create({
      data: {
        organizationId: session.organizationId,
        name: `E2E R08 Agent ${suffix}`,
        isActive: true,
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt,
        enabledTools: [],
      },
      select: { id: true },
    })
    const version = await prisma.builderPromptVersion.create({
      data: {
        aiAgentId: agent.id,
        versionNumber: 1,
        content: systemPrompt,
        description: 'E2E R08 prompt version',
        createdBy: 'chat',
      },
      select: { id: true },
    })
    await prisma.builderProject.update({
      where: { id: projectId },
      data: { aiAgentId: agent.id },
      select: { id: true },
    })
    return { agentId: agent.id, promptVersionId: version.id }
  } finally {
    await prisma.$disconnect()
  }
}

async function publishVersion(
  page: Page,
  projectId: string,
  promptVersionId: string,
): Promise<PublishResult> {
  const res = await page.request.post('/api/v1/builder/deploy/publish-version', {
    data: { projectId, promptVersionId },
  })
  return { ok: res.ok(), status: res.status(), text: await res.text() }
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function serverMockCanSatisfyBlueprint(): boolean {
  const configured = process.env.E2E_LLM_MOCK_TEXT
  if (!configured) return true
  return normalize(configured).includes(normalize(BLUEPRINT_QUESTION_TEXT))
}

test.describe('Builder v2 — R08 blueprint + Refinando', () => {
  test('aprovar conversation_blueprint grava contrato e libera o proximo passo de Revisar', async ({
    page,
  }) => {
    await setOverrideCookie(page, 'on')
    await loginViaOtp(page)

    const projectId = await createProjectViaHome(page)
    await submitBusinessIdentity(page, projectId)

    const before = await fetchReadiness(page, projectId)
    expect(before.builderState?.journeyVersion).toBe(2)
    expect(before.journey?.version).toBe(2)
    expect(before.step?.id).toBe('conversation_blueprint')
    expect(before.requiredMissing ?? []).toContain('conversationBlueprint.status')

    await approveBlueprint(page, projectId)

    const after = await fetchReadiness(page, projectId)
    expect(after.builderState?.conversationBlueprint).toMatchObject({
      status: 'approved',
    })
    expect(
      after.builderState?.conversationBlueprint?.approvedAt,
      'approvedAt e carimbado pelo servidor',
    ).toEqual(expect.any(String))
    expect(after.step?.id).not.toBe('conversation_blueprint')
  })

  test('publish-version bloqueia antes do Refinando e publica depois de refinement passed', async ({
    page,
  }) => {
    test.setTimeout(60_000)

    await setOverrideCookie(page, 'on')
    const session = await loginViaOtp(page)

    const projectId = await createProjectViaHome(page)
    await submitBusinessIdentity(page, projectId)
    await approveBlueprint(page, projectId)
    await submitAgentReview(page, projectId)
    await skipTestDrive(page, projectId)
    const seeded = await seedAgentAndPrompt(session, projectId)

    const beforeRefinement = await fetchReadiness(page, projectId)
    expect(beforeRefinement.step?.id).toBe('refinement')
    expect(beforeRefinement.requiredMissing ?? []).toContain('refinement.status')

    const blocked = await publishVersion(
      page,
      projectId,
      seeded.promptVersionId,
    )
    expect(blocked.ok, 'publish deve bloquear sem Refinando aprovado').toBe(false)
    expect(blocked.status).toBeGreaterThanOrEqual(400)
    expect(normalize(blocked.text)).toContain('refinamento')
    expect(normalize(blocked.text)).toContain('bloquead')

    test.skip(
      process.env.E2E_LLM_MOCK !== '1',
      'Refinando aprovado requer servidor local iniciado com E2E_LLM_MOCK=1; ' +
        'o bloqueio de publicacao sem Refinando ja foi exercitado.',
    )
    test.skip(
      !serverMockCanSatisfyBlueprint(),
      'E2E_LLM_MOCK_TEXT customizado nao contem o marcador esperado pelo blueprint; ' +
        'use o texto default do provider mock ou inclua "' +
        BLUEPRINT_QUESTION_TEXT +
        '".',
    )

    const refined = await submitCard(page, projectId, 'refinement', {
      action: 'run',
    })
    expect(refined.ok, `refinement(run) aceito (${refined.status})`).toBeTruthy()

    const afterRefinement = await fetchReadiness(page, projectId)
    expect(afterRefinement.builderState?.refinement).toMatchObject({
      status: 'passed',
      material: {
        promptVersionId: seeded.promptVersionId,
        promptVersionNumber: 1,
      },
    })
    expect(afterRefinement.step?.id).toBe('activation')

    const published = await publishVersion(
      page,
      projectId,
      seeded.promptVersionId,
    )
    expect(published.ok, `publish apos Refinando passou (${published.status})`).toBe(
      true,
    )
    expect(normalize(published.text)).toContain('versao publicada')
  })
})
