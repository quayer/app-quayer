/**
 * Co-located unit for the readiness-resolver kill-switch (T87 / NFR-08) +
 * version branch (T17).
 *
 * Hermetic: the DB delegate is mocked (read-only counts/lookups) — no IO. We
 * drive a `journeyVersion: 2` project through `getReadiness` and assert:
 *   - kill-switch ON  (`BUILDER_V2_FORCE_RENDER_V1=true`) → v1 render, NO
 *     `journey` payload, and ZERO writes to persisted state.
 *   - kill-switch OFF → v2 render, `journey` with the 4 phases.
 *
 * The mock exposes WRITE spies (update/create/upsert/updateMany) wired into
 * every delegate the resolver touches; the resolver is a read-only boundary, so
 * those must stay at zero calls in BOTH branches (the kill-switch degrades the
 * render only — it never writes).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Hoisted so both the (hoisted) vi.mock factory AND the test body share the
// same spies — top-level consts are not visible inside the hoisted factory.
const h = vi.hoisted(() => ({
  // write spies (asserted to never fire — the resolver is read-only)
  update: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  // read delegates
  conversationFindFirst: vi.fn(),
  organizationFindFirst: vi.fn(),
  organizationProviderCount: vi.fn(),
  connectionCount: vi.fn(),
  builderPromptVersionFindFirst: vi.fn(),
  builderDeploymentCount: vi.fn(),
}))

vi.mock('@/server/services/database', () => {
  const writes = { update: h.update, create: h.create, upsert: h.upsert, updateMany: h.updateMany }
  return {
    database: {
      builderProjectConversation: { findFirst: h.conversationFindFirst, ...writes },
      organization: { findFirst: h.organizationFindFirst, ...writes },
      organizationProvider: { count: h.organizationProviderCount, ...writes },
      connection: { count: h.connectionCount, ...writes },
      builderPromptVersion: { findFirst: h.builderPromptVersionFindFirst, ...writes },
      builderDeployment: { count: h.builderDeploymentCount, ...writes },
    },
  }
})

import { getReadiness } from './readiness-resolver'

const {
  conversationFindFirst,
  organizationFindFirst,
  organizationProviderCount,
  connectionCount,
  builderPromptVersionFindFirst,
  builderDeploymentCount,
} = h
const writeSpies = { update: h.update, create: h.create, upsert: h.upsert, updateMany: h.updateMany }

const ORG = 'org_1'
const CONV = 'conv_1'

/** A v2 project conversation with no agent yet (first pending step is `objective`). */
function primeV2Conversation(): void {
  conversationFindFirst.mockResolvedValue({
    builderState: JSON.stringify({ journeyVersion: 2 }),
    project: { id: 'proj_1', name: 'Salão da Maria', aiAgentId: null, aiAgent: null },
  })
  organizationFindFirst.mockResolvedValue({ billingType: 'pro' })
  organizationProviderCount.mockResolvedValue(1)
  connectionCount.mockResolvedValue(0)
  builderPromptVersionFindFirst.mockResolvedValue(null)
  builderDeploymentCount.mockResolvedValue(0)
}

function expectNoWrites(): void {
  expect(writeSpies.update).not.toHaveBeenCalled()
  expect(writeSpies.create).not.toHaveBeenCalled()
  expect(writeSpies.upsert).not.toHaveBeenCalled()
  expect(writeSpies.updateMany).not.toHaveBeenCalled()
}

describe('getReadiness — journey version branch + kill-switch (T17/T87)', () => {
  const ORIGINAL = process.env.BUILDER_V2_FORCE_RENDER_V1

  beforeEach(() => {
    for (const fn of [
      conversationFindFirst,
      organizationFindFirst,
      organizationProviderCount,
      connectionCount,
      builderPromptVersionFindFirst,
      builderDeploymentCount,
      writeSpies.update,
      writeSpies.create,
      writeSpies.upsert,
      writeSpies.updateMany,
    ]) {
      fn.mockReset()
    }
    delete process.env.BUILDER_V2_FORCE_RENDER_V1
    primeV2Conversation()
  })

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.BUILDER_V2_FORCE_RENDER_V1
    else process.env.BUILDER_V2_FORCE_RENDER_V1 = ORIGINAL
  })

  it('kill-switch OFF: journeyVersion 2 → v2 render com journey de 4 fases', async () => {
    const readiness = await getReadiness(CONV, ORG)

    expect(readiness.journey).toBeDefined()
    expect(readiness.journey?.version).toBe(2)
    expect(readiness.journey?.phases.map((p) => p.id)).toEqual([
      'conhecer',
      'revisar',
      'testar',
      'lancar',
    ])
    // v1 fields stay populated either way.
    expect(readiness.step).toBeDefined()
    expect(Array.isArray(readiness.steps)).toBe(true)
    expect(readiness.builderState?.journeyVersion).toBe(2)
    expectNoWrites()
  })

  it('kill-switch ON: journeyVersion 2 → força v1, SEM journey e SEM nenhum write', async () => {
    process.env.BUILDER_V2_FORCE_RENDER_V1 = 'true'

    const readiness = await getReadiness(CONV, ORG)

    // Render degraded to v1: no phased payload.
    expect(readiness.journey).toBeUndefined()
    // v1 fields still fully populated.
    expect(readiness.step).toBeDefined()
    expect(Array.isArray(readiness.steps)).toBe(true)
    expect(typeof readiness.completenessPct).toBe('number')
    expect(typeof readiness.isDeployReady).toBe('boolean')
    // The persisted version is untouched — the kill-switch is render-only.
    expect(readiness.builderState?.journeyVersion).toBe(2)
    expectNoWrites()
  })

  it("kill-switch aceita '1' como ligado (case-insensitive)", async () => {
    process.env.BUILDER_V2_FORCE_RENDER_V1 = '1'
    const readiness = await getReadiness(CONV, ORG)
    expect(readiness.journey).toBeUndefined()
    expectNoWrites()
  })
})
