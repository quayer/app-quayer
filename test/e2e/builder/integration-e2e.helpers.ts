import { test, expect, type Page } from '@playwright/test'
import {
  generateTestEmail,
  getLatestOtp,
  getUserOrgId,
  waitForRedirect,
} from '../auth/helpers'
import {
  startIntegrationFixtureServer,
  type IntegrationFixtureServer,
} from '../fixtures/integration-fixture-server'

/**
 * Integration Builder — SHARED E2E harness (Wave 4, T53–T56).
 *
 * One home for everything the four integration E2E specs need so each spec reads
 * as a flow, not as boilerplate:
 *   - the HTTP fixture server lifecycle (`startFixture` / `IntegrationFixtureServer`),
 *   - OTP login (mirrors the auth E2E primitive) + discovering the session's org,
 *   - seeding a tenant-scoped BuilderProject with a PUBLISHED AIAgentConfig
 *     (`aiAgentId` set + `isActive` + a `BuilderProjectConversation`) — the exact
 *     shape the activation gate (`POST /integrations/:id/activate`) requires,
 *   - flipping the Integration Builder flag for the SERVER routes via the QA
 *     override cookie (`integration-builder-override=on`),
 *   - thin `page.request` wrappers over the integration routes the specs drive.
 *
 * ── HOW THE FLAG + FIXTURE + ALLOWLIST ARE WIRED (read before editing) ─────────
 *
 * 1. FLAG (server vs UI). The integration ROUTES gate on
 *    `isIntegrationBuilderEnabled(orgId, overrideCookie)` — the QA override cookie
 *    `integration-builder-override=on` (INTEGRATION_BUILDER_OVERRIDE_COOKIE) forces
 *    the flag ON per request, which is what {@link setIntegrationOverrideCookie}
 *    sets. The specs drive the integration lifecycle through `page.request.*`
 *    (same-origin, carries both the session cookie AND the override cookie), so the
 *    cookie alone is enough for the backend.
 *      The AdvancedTab UI surface (`integrations-section.tsx`) gates differently —
 *    on the BUILD-TIME public env `NEXT_PUBLIC_INTEGRATION_BUILDER` (it can't read
 *    the per-org seed client-side). A cookie CANNOT turn the UI section on. So the
 *    UI-rendering portion of T53 only renders when the dev server was BUILT/STARTED
 *    with `NEXT_PUBLIC_INTEGRATION_BUILDER=on`; without it, the spec exercises the
 *    same lifecycle through the API (the authoritative path) and skips the
 *    UI-visibility leg. Each spec documents this at its top.
 *
 * 2. FIXTURE + ALLOWLIST (CI-gated — set on the APP server, not from the spec).
 *    The integration executor does its own SERVER-SIDE `fetch`; Playwright's
 *    `page.route` can never intercept it. So a spec points the integration at a
 *    REAL local fixture server and the executor reaches it ONLY when, ON THE APP
 *    SERVER PROCESS:
 *      - `NODE_ENV === 'test'`, AND
 *      - the fixture host (`127.0.0.1:<port>`) is listed in
 *        `INTEGRATION_TEST_ALLOWED_HOSTS`.
 *    Neither can be set from inside the spec — they live in the `npm run dev`
 *    process. BUT the fixture binds an EPHEMERAL port, unknown until the spec
 *    starts it. Two ways to reconcile, both documented in the run-command block of
 *    each spec:
 *      (a) PINNED PORT — start the fixture on a known port via
 *          `INTEGRATION_FIXTURE_PORT` (see {@link startFixture}) and start the app
 *          server with `INTEGRATION_TEST_ALLOWED_HOSTS=127.0.0.1:<that port>` +
 *          `NODE_ENV=test`. This is the CI-gated path that actually reaches the
 *          fixture and asserts real outcomes (auth_error / success).
 *      (b) WILDCARD/RANGE — allow `127.0.0.1` (bare host) on the app server, which
 *          the executor matches regardless of port.
 *    When the app server was NOT started with these env, the test-call leg is
 *    `blocked`/unreachable; the specs detect that and SKIP the leg that depends on
 *    a real fixture round-trip (never a hard failure outside the gate).
 *
 * ── WHAT IS CI-GATED vs LOCALLY RUNNABLE ──────────────────────────────────────
 *   - PARSE + discovery (`--list`, tsc): always, no env.
 *   - Login + seed + lifecycle state transitions that DON'T need a live HTTP call
 *     (create draft, pause/remove, parity via getCustomTools): need the dev server
 *     + test DB (`TEST_DATABASE_URL`/`DATABASE_URL`) + the override cookie.
 *   - The test-call gate (invalid→rascunho, valid→validada→active): additionally
 *     needs the app server with `NODE_ENV=test` + `INTEGRATION_TEST_ALLOWED_HOSTS`
 *     covering the fixture host. Without it the specs skip that leg honestly.
 *
 * Tagged `@integration` in every test title so CI can gate the suite
 * (`npx playwright test --grep @integration`). Zero `any`.
 */

// ── Cookie that forces the Integration Builder flag ON for the SERVER routes. ──
// Value mirrors INTEGRATION_BUILDER_OVERRIDE_COOKIE in
// src/lib/feature-flags/integration-builder.ts.
export const INTEGRATION_OVERRIDE_COOKIE = 'integration-builder-override'

/** The catalog slugs the specs reference (must match the template registry). */
export const RD_STATION_SLUG = 'rd-station'
export const GENERIC_WEBHOOK_SLUG = 'generic-webhook'

/**
 * The snake_case `toolName` each template materializes onto its backing AgentTool
 * (rd-station.template.ts / generic-webhook.template.ts). The parity spec asserts
 * the runtime surfaces/hides THESE names as the integration is activated/paused.
 */
export const RD_STATION_TOOL_NAME = 'enviar_lead_rd_station'
export const GENERIC_WEBHOOK_TOOL_NAME = 'enviar_para_webhook'

/** Fixture credential values that drive the fixture's api_key routing (T33). */
export const FIXTURE_VALID_KEY = 'valid-key'
export const FIXTURE_INVALID_KEY = 'invalid-key'

// ---------------------------------------------------------------------------
// Fixture lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the integration HTTP fixture (T33). The fixture ALWAYS binds an ephemeral
 * `127.0.0.1:<port>` (the executor only reaches a host it was told to allow — see
 * the file header). Because the port is unknown until bound, the CI job that wants
 * the test-call leg to reach the fixture should allow the BARE host on the app
 * server: `INTEGRATION_TEST_ALLOWED_HOSTS=127.0.0.1` matches any ephemeral port.
 * (The executor matches both `host` and `host:port` lower-cased — see
 * `isHostAllowedForTest`.) Each spec's run-command block documents this. Surfaced
 * as a thin wrapper so the lifecycle is owned in one place across the four specs.
 */
export async function startFixture(): Promise<IntegrationFixtureServer> {
  return startIntegrationFixtureServer()
}

// ---------------------------------------------------------------------------
// Flag override cookie (server routes)
// ---------------------------------------------------------------------------

/**
 * Set `integration-builder-override=on` for the baseURL host BEFORE any
 * integration route call. This is read by `isIntegrationBuilderEnabled` on the
 * server (every integration route is flag-gated and 404s when off).
 */
export async function setIntegrationOverrideCookie(
  page: Page,
  value: 'on' | 'off' = 'on'
): Promise<void> {
  const base = test.info().project.use.baseURL ?? 'http://localhost:3000'
  const host = new URL(base).hostname
  await page.context().addCookies([
    {
      name: INTEGRATION_OVERRIDE_COOKIE,
      value,
      domain: host,
      path: '/',
      httpOnly: false,
      secure: base.startsWith('https'),
      sameSite: 'Lax',
    },
  ])
}

// ---------------------------------------------------------------------------
// Login (OTP) + org discovery
// ---------------------------------------------------------------------------

/** The authenticated session context a spec carries through the flow. */
export interface SeededSession {
  email: string
  userId: string
  organizationId: string
}

/**
 * Log in via the OTP happy path (same primitive the auth E2E uses) and return the
 * session's user id + active org id (read from the test DB). Skips the whole test
 * when login / the test DB is not reachable from the runner — never a hard failure
 * outside the gate environment.
 */
export async function loginAndResolveOrg(page: Page): Promise<SeededSession> {
  test.skip(
    process.env.E2E_SIGNUP_ENABLED === 'false',
    'login indisponível neste ambiente (E2E_SIGNUP_ENABLED=false)'
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
    throw new Error('unreachable') // satisfies the return type; test.skip aborts
  }
  expect(otp).toMatch(/^\d{6}$/)

  const otpField = page.locator('input[autocomplete="one-time-code"]').first()
  await otpField.waitFor({ state: 'attached' })
  await otpField.fill(otp)

  // Login lands on `/` (home Builder) or a deep-linked /projetos route.
  await waitForRedirect(page, /\/(?:$|\?|projetos)/)

  // Resolve the org the session is bound to so we can seed tenant-scoped rows
  // the API calls (auth-scoped to currentOrgId) will actually see.
  let ids: { userId: string; organizationId: string }
  try {
    ids = await getUserOrgId(email)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    test.skip(true, 'org lookup not reachable: ' + message)
    throw new Error('unreachable')
  }
  return { email, userId: ids.userId, organizationId: ids.organizationId }
}

// ---------------------------------------------------------------------------
// DB seeding — BuilderProject + PUBLISHED AIAgentConfig (Prisma, test DB)
// ---------------------------------------------------------------------------

/** Handle to the seeded project + its published agent. */
export interface SeededProject {
  projectId: string
  agentConfigId: string
  /** snake_case tool name the published agent already carries (parity baseline). */
  baselineToolName: string
}

/**
 * Minimal Prisma surface for seeding. Lazy-imported (so the spec file loads even
 * when Prisma isn't installed in the runner) and pointed at the test DB the same
 * way `auth/helpers.ts` does. Zero `any` — every model/field used is declared.
 */
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
    }) => Promise<{ id: string }>
    findFirst: (args: {
      where: { id: string; organizationId: string }
      select: { enabledTools: true }
    }) => Promise<{ enabledTools: string[] } | null>
  }
  agentTool: {
    findMany: (args: {
      where: {
        organizationId: string
        type: 'CUSTOM'
        isActive: true
        name: { in: string[] }
        OR: Array<
          | { webhookUrl: { not: null } }
          | { customIntegration: { status: 'active'; deletedAt: null } }
        >
      }
      select: { name: true }
    }) => Promise<Array<{ name: string }>>
  }
  builderProject: {
    create: (args: {
      data: {
        organizationId: string
        userId: string
        name: string
        status: 'draft' | 'production'
        aiAgentId: string
      }
    }) => Promise<{ id: string }>
  }
  builderProjectConversation: {
    create: (args: {
      data: {
        projectId: string
        organizationId: string
        userId: string
        builderState: unknown
      }
    }) => Promise<{ id: string }>
  }
}

async function withSeedClient<T>(
  fn: (prisma: SeedPrismaClient) => Promise<T>
): Promise<T> {
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!databaseUrl) {
    test.skip(true, 'seeding requires TEST_DATABASE_URL / DATABASE_URL')
    throw new Error('unreachable')
  }
  const mod = (await import('@prisma/client')) as {
    PrismaClient: new (opts?: {
      datasources?: { db: { url: string } }
    }) => SeedPrismaClient
  }
  const prisma = new mod.PrismaClient({
    datasources: { db: { url: databaseUrl } },
  })
  try {
    await prisma.$connect()
    return await fn(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Seed a BuilderProject with a PUBLISHED agent for `session.organizationId`. The
 * project's `status` is `production` and `aiAgentId` points at an active
 * AIAgentConfig — exactly the shape the activation gate requires
 * (`project.aiAgentId` present). `builderState` is the optional initial state
 * (used by the conversational specs to pre-seed `integration.proposed`).
 *
 * `baselineToolName` is the snake_case name of a tool already in the agent's
 * `enabledTools`; the parity spec uses it to prove the published agent's tool set
 * is the baseline that integrations add to / remove from.
 */
export async function seedPublishedProject(
  session: SeededSession,
  opts?: { builderState?: unknown }
): Promise<SeededProject> {
  const baselineToolName = 'think'
  return withSeedClient(async (prisma) => {
    const agent = await prisma.aIAgentConfig.create({
      data: {
        organizationId: session.organizationId,
        name: 'E2E Integration Agent',
        isActive: true,
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'Agente de teste E2E para integrações.',
        // A non-empty baseline so parity assertions have a stable reference.
        enabledTools: [baselineToolName],
      },
    })
    const project = await prisma.builderProject.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        name: 'E2E Integration Project',
        status: 'production',
        aiAgentId: agent.id,
      },
    })
    await prisma.builderProjectConversation.create({
      data: {
        projectId: project.id,
        organizationId: session.organizationId,
        userId: session.userId,
        builderState: opts?.builderState ?? {},
      },
    })
    return {
      projectId: project.id,
      agentConfigId: agent.id,
      baselineToolName,
    }
  })
}

/**
 * Mirror, against the test DB, the EXACT `getCustomTools` WHERE clause
 * (src/server/ai-module/ai-agents/tools/custom-tools.ts): CUSTOM AgentTools that
 * are `isActive: true`, named in the agent's `enabledTools`, and backed by either
 * a v1 webhook OR an ACTIVE (non-deleted) CustomIntegration. This is THE query
 * both the playground (`processPlaygroundStream`) and the production runtime
 * (`prepare-agent-call.ts`) call — so the set it returns is, by construction, the
 * tool catalog the runtime surfaces. The parity spec (T56) asserts on this set
 * directly: an active integration's tool is IN it; a paused one is NOT (pause
 * flips `AgentTool.isActive=false`, which this clause filters out).
 *
 * Returns the set of tool NAMES the runtime would expose for the given agent.
 */
export async function runtimeVisibleToolNames(
  organizationId: string,
  agentConfigId: string
): Promise<Set<string>> {
  return withSeedClient(async (prisma) => {
    const agent = await prisma.aIAgentConfig.findFirst({
      where: { id: agentConfigId, organizationId },
      select: { enabledTools: true },
    })
    const enabled = agent?.enabledTools ?? []
    if (enabled.length === 0) return new Set<string>()
    const rows = await prisma.agentTool.findMany({
      where: {
        organizationId,
        type: 'CUSTOM',
        isActive: true,
        name: { in: enabled },
        OR: [
          { webhookUrl: { not: null } },
          { customIntegration: { status: 'active', deletedAt: null } },
        ],
      },
      select: { name: true },
    })
    return new Set(rows.map((r) => r.name))
  })
}

// ---------------------------------------------------------------------------
// API wrappers (page.request — same-origin, carries session + override cookies)
// ---------------------------------------------------------------------------

/** Shape of a created/listed integration on the wire (subset the specs read). */
export interface WireIntegration {
  id: string
  displayName: string
  status: string
  templateSlug: string | null
  triggerDescription?: string | null
  lastTestStatus?: string | null
  credentialFields: Array<{ key: string; label: string; filled?: boolean }>
}

/** Coarse test outcome the routes return (subset of IntegrationOutcome). */
export interface WireTestResult {
  outcome: string
  diagnosis: string
  httpStatus?: number
}

const API = '/api/v1/builder/integrations'

/** Create a draft integration from a catalog template. */
export async function createIntegration(
  page: Page,
  projectId: string,
  templateSlug: string,
  displayName?: string
): Promise<WireIntegration> {
  const res = await page.request.post(API, {
    data: { projectId, templateSlug, ...(displayName ? { displayName } : {}) },
  })
  expect(res.ok(), `create ${templateSlug} (${res.status()})`).toBeTruthy()
  const body = (await res.json()) as { integration?: WireIntegration }
  expect(body.integration, 'create.integration ausente').toBeTruthy()
  return body.integration as WireIntegration
}

/** Create a draft integration from the proposal currently in builderState. */
export async function createFromProposal(
  page: Page,
  projectId: string
): Promise<WireIntegration> {
  const res = await page.request.post(API, {
    data: { projectId, proposalFromState: true },
  })
  expect(res.ok(), `create from proposal (${res.status()})`).toBeTruthy()
  const body = (await res.json()) as { integration?: WireIntegration }
  expect(body.integration, 'create.integration ausente').toBeTruthy()
  return body.integration as WireIntegration
}

/** List a project's integrations (masked — no credential values). */
export async function listIntegrations(
  page: Page,
  projectId: string
): Promise<WireIntegration[]> {
  const res = await page.request.get(`${API}?projectId=${projectId}`)
  expect(res.ok(), `list (${res.status()})`).toBeTruthy()
  const body = (await res.json()) as { integrations?: WireIntegration[] }
  return body.integrations ?? []
}

/** Write credential values (write-only; server never echoes them back). */
export async function setCredentials(
  page: Page,
  integrationId: string,
  values: Record<string, string>
): Promise<void> {
  const res = await page.request.patch(`${API}/${integrationId}/credentials`, {
    data: { values },
  })
  expect(res.ok(), `credentials (${res.status()})`).toBeTruthy()
  const body = (await res.json()) as { ok?: boolean }
  expect(body.ok, 'credentials.ok').toBe(true)
}

/** Run the validation test; returns the value-free outcome/diagnosis. */
export async function testIntegration(
  page: Page,
  integrationId: string
): Promise<WireTestResult> {
  const res = await page.request.post(`${API}/${integrationId}/test`)
  expect(res.ok(), `test (${res.status()})`).toBeTruthy()
  return (await res.json()) as WireTestResult
}

/** Attempt activation; returns the raw status so the caller can assert gates. */
export async function activateIntegration(
  page: Page,
  integrationId: string
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await page.request.post(`${API}/${integrationId}/activate`)
  return { ok: res.ok(), status: res.status(), body: await res.json() }
}

/** Pause an active integration. */
export async function pauseIntegration(
  page: Page,
  integrationId: string
): Promise<void> {
  const res = await page.request.post(`${API}/${integrationId}/pause`)
  expect(res.ok(), `pause (${res.status()})`).toBeTruthy()
}

// ---------------------------------------------------------------------------
// Card submit (conversational flow) — same endpoint the chat-panel uses
// ---------------------------------------------------------------------------

/**
 * Submit an integration card through the SAME endpoint the chat-panel uses
 * (`POST /builder/projects/:id/cards/:cardKey/submit`). The route returns an SSE
 * stream (200 text/event-stream) once auth + the deterministic state application
 * succeed — the integration draft/credential write is committed BEFORE the ACK
 * turn streams, so only the request being accepted matters here. A non-OK status
 * means the deterministic write itself was rejected (a real failure).
 */
export async function submitCard(
  page: Page,
  projectId: string,
  cardKey: string,
  data: Record<string, unknown>
): Promise<void> {
  const res = await page.request.post(
    `/api/v1/builder/projects/${projectId}/cards/${cardKey}/submit`,
    { data: { cardKey, ...data } }
  )
  expect(res.ok(), `card-submit ${cardKey} (${res.status()})`).toBeTruthy()
}
