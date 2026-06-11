import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// T51 — no-secret-leak SENTINEL for the integration card handlers (NFR-01).
//
// SECURITY test. The two integration cards each have a value-bearing path the
// handler must keep secret-tight:
//   - integration_proposal: confirm-ONLY. The proposal is read from SERVER-SIDE
//     state (`builderState.integration.proposed`), never the body — a forged
//     body must be ignored.
//   - integration_credentials: the submitted credential VALUE must be encrypted
//     before persist and must NEVER reach builderState, the cardInstruction, any
//     ack text, or any other collaborator arg (the BuilderProjectMessage JSONB
//     vector closes here).
//
// We mock every collaborator the handler imports directly so the handler runs in
// isolation and we can inspect EVERY value it hands out. `encrypt` is stubbed to
// `enc(<value>)` so we can assert (a) the raw value was encrypted before persist
// and (b) what `updateCredentials` actually received is the ciphertext, not the
// plaintext. The end-to-end sentinel then JSON.stringifies the handler result +
// all mock call args (minus the two legitimate plaintext/ciphertext sites) and
// asserts the canary is absent.
//
// Mock idiom mirrors the sibling handler suites (vi.hoisted fns + vi.mock).
// ---------------------------------------------------------------------------

const mockReadBuilderStateByProject = vi.hoisted(() => vi.fn())
const mockCreateDraftIntegration = vi.hoisted(() => vi.fn())
const mockGetIntegration = vi.hoisted(() => vi.fn())
const mockUpdateCredentials = vi.hoisted(() => vi.fn())
const mockPatchIntegrationStateAtomic = vi.hoisted(() => vi.fn())
const mockRunIntegrationTest = vi.hoisted(() => vi.fn())
const mockGetIntegrationTemplate = vi.hoisted(() => vi.fn())
const mockEncrypt = vi.hoisted(() => vi.fn((value: string) => `enc(${value})`))

vi.mock('@/lib/crypto', () => ({
  encrypt: mockEncrypt,
}))

vi.mock('../../sources/builder-state-db', () => ({
  readBuilderStateByProject: mockReadBuilderStateByProject,
}))

vi.mock('../../integrations/integration.repository', () => ({
  createDraftIntegration: mockCreateDraftIntegration,
  getIntegration: mockGetIntegration,
  updateCredentials: mockUpdateCredentials,
  // The handler `instanceof`-checks this — keep it a real Error subclass.
  IntegrationNameConflictError: class IntegrationNameConflictError extends Error {
    constructor(public readonly toolName: string) {
      super(`conflict: ${toolName}`)
      this.name = 'IntegrationNameConflictError'
    }
  },
}))

vi.mock('../../integrations/integration-state-db', () => ({
  patchIntegrationStateAtomic: mockPatchIntegrationStateAtomic,
}))

vi.mock('../../integrations/test-call.runner', () => ({
  runIntegrationTest: mockRunIntegrationTest,
}))

vi.mock('../../integrations/templates', () => ({
  getIntegrationTemplate: mockGetIntegrationTemplate,
}))

import {
  applyIntegrationProposal,
  applyIntegrationCredentials,
} from './apply-integration-cards'
import type {
  IntegrationProposalPayload,
  IntegrationCredentialsPayload,
} from '../card-submit.schemas'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CTX = {
  projectId: 'proj-1',
  organizationId: 'org-1',
  conversationId: 'conv-1',
  userId: 'user-1',
} as const

/** Canary secret that must never escape into any value-bearing surface. */
const SECRET_CANARY = 'SECRET_CANARY_123'

/** A resolvable catalog template the proposal confirm path needs. */
const TEMPLATE = {
  slug: 'rd-station',
  displayName: 'RD Station',
  description: 'Envia o lead ao RD Station.',
  triggerDescription: 'quando o lead demonstrar interesse',
  toolName: 'enviar_lead_rd_station',
  requestSpec: { method: 'POST', url: 'https://api.rd.test', auth: { type: 'none' } },
  credentialFields: [
    { key: 'api_key', label: 'Chave de API', whereToGet: 'No painel do RD.' },
  ],
}

/** A loaded draft integration row with its credentialFields metadata. */
const INTEGRATION_ROW = {
  id: 'integ-1',
  organizationId: CTX.organizationId,
  displayName: 'RD Station',
  credentialFields: [
    { key: 'api_key', label: 'Chave de API', whereToGet: 'No painel do RD.' },
  ],
}

/** builderState with a pending PROPOSAL (proposal confirm path). */
function stateWithProposal() {
  return {
    integration: {
      proposed: {
        platform: 'RD Station',
        templateSlug: 'rd-station',
        triggerDescription: 'quando o lead demonstrar interesse',
      },
    },
  }
}

/** builderState with a DRAFT id awaiting credentials (credentials path). */
function stateWithDraft() {
  return {
    integration: { draftIntegrationId: INTEGRATION_ROW.id },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEncrypt.mockImplementation((value: string) => `enc(${value})`)
})

// ===========================================================================
// 1. Proposal confirm reads from SERVER-SIDE state — forged body is ignored.
// ===========================================================================

describe('applyIntegrationProposal — never trust the body (state is source of truth)', () => {
  it('creates the draft from STATE.proposed, ignoring a forged body', async () => {
    mockReadBuilderStateByProject.mockResolvedValue(stateWithProposal())
    mockGetIntegrationTemplate.mockReturnValue(TEMPLATE)
    mockCreateDraftIntegration.mockResolvedValue({ id: 'draft-99' })
    mockPatchIntegrationStateAtomic.mockResolvedValue(undefined)

    // A FORGED body carrying a malicious proposal the handler must NOT read.
    const forged = {
      cardKey: 'integration_proposal',
      action: 'confirm',
      maliciousProposal: {
        platform: 'EVIL Corp',
        templateSlug: 'evil-template',
        displayName: 'EVIL',
      },
    } as unknown as IntegrationProposalPayload

    const res = await applyIntegrationProposal(CTX, forged)

    expect(res.ok).toBe(true)
    expect(mockCreateDraftIntegration).toHaveBeenCalledTimes(1)
    const arg = mockCreateDraftIntegration.mock.calls[0][0] as {
      displayName: string
      templateSlug: string
      toolName: string
    }
    // Draft is built from the STATE's template/platform — never the body.
    expect(arg.displayName).toBe('RD Station') // proposed.platform
    expect(arg.templateSlug).toBe(TEMPLATE.slug)
    expect(arg.toolName).toBe(TEMPLATE.toolName)
    // Nothing from the forged body leaked into the create input.
    expect(JSON.stringify(arg)).not.toContain('EVIL')
    expect(JSON.stringify(arg)).not.toContain('evil-template')
    // Only the draft REFERENCE is written back to builderState (no secret).
    expect(mockPatchIntegrationStateAtomic).toHaveBeenCalledWith({
      projectId: CTX.projectId,
      organizationId: CTX.organizationId,
      patch: { draftIntegrationId: 'draft-99' },
    })
  })

  it('with NO proposed in state: creates nothing and returns a neutral result', async () => {
    mockReadBuilderStateByProject.mockResolvedValue({ integration: {} })

    const res = await applyIntegrationProposal(CTX, {
      cardKey: 'integration_proposal',
      action: 'confirm',
    })

    expect(res.ok).toBe(true)
    expect(mockGetIntegrationTemplate).not.toHaveBeenCalled()
    expect(mockCreateDraftIntegration).not.toHaveBeenCalled()
    expect(mockPatchIntegrationStateAtomic).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// 2. Credentials handler encrypts before persist + NEVER touches builderState.
// ===========================================================================

describe('applyIntegrationCredentials — encrypt before persist, never builderState', () => {
  it('encrypts the raw value, persists the ciphertext, never patches state', async () => {
    mockReadBuilderStateByProject.mockResolvedValue(stateWithDraft())
    mockGetIntegration.mockResolvedValue(INTEGRATION_ROW)
    mockUpdateCredentials.mockResolvedValue(INTEGRATION_ROW)
    mockRunIntegrationTest.mockResolvedValue({
      outcome: 'success',
      diagnosis: 'Tudo certo.',
      durationMs: 12,
    })

    const body: IntegrationCredentialsPayload = {
      cardKey: 'integration_credentials',
      values: { api_key: SECRET_CANARY },
    }

    const res = await applyIntegrationCredentials(CTX, body)

    expect(res.ok).toBe(true)
    // encrypt() saw the RAW value (the only legitimate plaintext site).
    expect(mockEncrypt).toHaveBeenCalledWith(SECRET_CANARY)
    // updateCredentials got the CIPHERTEXT, never the raw value.
    const [org, id, creds] = mockUpdateCredentials.mock.calls[0] as [
      string,
      string,
      Record<string, string>,
    ]
    expect(org).toBe(CTX.organizationId)
    expect(id).toBe(INTEGRATION_ROW.id)
    expect(creds.api_key).toBe(`enc(${SECRET_CANARY})`)
    expect(creds.api_key).not.toBe(SECRET_CANARY)
    // builderState is NEVER touched by the credentials path.
    expect(mockPatchIntegrationStateAtomic).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// 3. Status transitions: on test success the runner is invoked (it owns the
//    draft→validated transition) with the right scope.
// ===========================================================================

describe('applyIntegrationCredentials — triggers the validation test runner', () => {
  it('invokes runIntegrationTest with integrationId/org/requestedById on success', async () => {
    mockReadBuilderStateByProject.mockResolvedValue(stateWithDraft())
    mockGetIntegration.mockResolvedValue(INTEGRATION_ROW)
    mockUpdateCredentials.mockResolvedValue(INTEGRATION_ROW)
    mockRunIntegrationTest.mockResolvedValue({
      outcome: 'success',
      diagnosis: 'Tudo certo.',
      durationMs: 12,
    })

    const res = await applyIntegrationCredentials(CTX, {
      cardKey: 'integration_credentials',
      values: { api_key: SECRET_CANARY },
    })

    expect(res.ok).toBe(true)
    expect(mockRunIntegrationTest).toHaveBeenCalledTimes(1)
    expect(mockRunIntegrationTest).toHaveBeenCalledWith({
      organizationId: CTX.organizationId,
      integrationId: INTEGRATION_ROW.id,
      requestedById: CTX.userId,
    })
    // The success ACK signals the integration is ready to activate (validated).
    if (res.ok) {
      expect(res.cardInstruction).toMatch(/validad/i)
    }
  })
})

// ===========================================================================
// 4. END-TO-END SENTINEL — the canary must not appear anywhere the handler
//    emits, except the two legitimate sites (encrypt input + updateCredentials
//    ciphertext arg, which we exclude from the haystack).
// ===========================================================================

describe('applyIntegrationCredentials — SECRET_CANARY end-to-end sentinel (NFR-01)', () => {
  it('the canary never appears in the result, the state patch, or any ack text', async () => {
    mockReadBuilderStateByProject.mockResolvedValue(stateWithDraft())
    mockGetIntegration.mockResolvedValue(INTEGRATION_ROW)
    mockUpdateCredentials.mockResolvedValue(INTEGRATION_ROW)
    // Exercise BOTH branches of the ACK copy — the failure path interpolates the
    // runner's diagnosis, so prove the diagnosis (which is value-free) is the only
    // thing that flows out and that no submitted value sneaks in either way.
    mockRunIntegrationTest.mockResolvedValue({
      outcome: 'auth_error',
      diagnosis: 'A chave de API parece inválida. Confira e teste de novo.',
      durationMs: 30,
    })

    const body: IntegrationCredentialsPayload = {
      cardKey: 'integration_credentials',
      values: { api_key: SECRET_CANARY },
    }

    const res = await applyIntegrationCredentials(CTX, body)

    // The returned cardInstruction (becomes the persisted BuilderProjectMessage
    // ACK turn) must NOT carry the canary.
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.cardInstruction).not.toContain(SECRET_CANARY)
    }

    // patchIntegrationStateAtomic must not even be called for credentials — and if
    // it ever were, its args must not contain the canary.
    expect(mockPatchIntegrationStateAtomic).not.toHaveBeenCalled()
    const stateArgs = JSON.stringify(
      mockPatchIntegrationStateAtomic.mock.calls,
    )
    expect(stateArgs).not.toContain(SECRET_CANARY)

    // Build the full haystack: the handler RESULT + every mock call's args,
    // EXCLUDING the two legitimate value sites:
    //   - encrypt(<raw>)            — legitimately receives the plaintext
    //   - updateCredentials(.., enc) — legitimately receives the ciphertext (and
    //     `enc(SECRET_CANARY_123)` would itself contain the substring)
    const haystack = JSON.stringify({
      result: res,
      readState: mockReadBuilderStateByProject.mock.calls,
      getIntegration: mockGetIntegration.mock.calls,
      runIntegrationTest: mockRunIntegrationTest.mock.calls,
      patchIntegrationStateAtomic: mockPatchIntegrationStateAtomic.mock.calls,
      // createDraftIntegration is not part of the credentials path, but include
      // it for completeness — it must stay empty/secret-free.
      createDraftIntegration: mockCreateDraftIntegration.mock.calls,
    })

    expect(haystack).not.toContain(SECRET_CANARY)
  })
})
