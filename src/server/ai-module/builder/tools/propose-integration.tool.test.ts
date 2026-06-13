/**
 * propose_integration — backend contract tests for user tool requests.
 *
 * These tests exercise the product-level decision point:
 * - known platform -> curated template proposal;
 * - unknown platform with researched docs -> cited generic-webhook proposal;
 * - unknown platform without docs -> honest webhook fallback, no fake sources;
 * - cache/quota behavior around the web investigator.
 *
 * No network and no database: all side effects are mocked at the module seams.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../integrations/integration-state-db', () => ({
  patchIntegrationStateAtomic: vi.fn(),
}))

vi.mock('../integrations/integration-research-cache', () => ({
  getCachedIntegrationResearch: vi.fn(),
  setCachedIntegrationResearch: vi.fn(),
}))

vi.mock('../sub-agents/integration-researcher', () => ({
  runIntegrationResearcher: vi.fn(),
}))

vi.mock('@/server/ai-module/ai-agents/infra/rate-limit.service', () => ({
  checkFixedWindowQuota: vi.fn(),
}))

import { checkFixedWindowQuota } from '@/server/ai-module/ai-agents/infra/rate-limit.service'
import {
  getCachedIntegrationResearch,
  setCachedIntegrationResearch,
} from '../integrations/integration-research-cache'
import { patchIntegrationStateAtomic } from '../integrations/integration-state-db'
import { runIntegrationResearcher } from '../sub-agents/integration-researcher'
import { proposeIntegrationTool } from './propose-integration.tool'
import type { BuilderToolExecutionContext } from './list-instances.tool'

type ProposeInput = { platform: string; templateSlug?: string }
type ExecutableTool = {
  execute: (input: ProposeInput) => Promise<unknown>
}

type ProposalResult = {
  success: true
  card: 'integration_proposal'
  proposal: {
    platform: string
    templateSlug?: string
    triggerDescription?: string
    whatDataSent?: string
    sources?: Array<{ title?: string; url: string }>
  }
  message: string
}

type FailureResult = { success: false; message: string }

const ctx: BuilderToolExecutionContext = {
  projectId: 'project_tool_contract',
  organizationId: 'org_tool_contract',
  userId: 'user_tool_contract',
}

function makeTool(): ExecutableTool {
  return proposeIntegrationTool(ctx) as unknown as ExecutableTool
}

function asProposal(result: unknown): ProposalResult {
  expect(result).toMatchObject({ success: true, card: 'integration_proposal' })
  return result as ProposalResult
}

function asFailure(result: unknown): FailureResult {
  expect(result).toMatchObject({ success: false })
  return result as FailureResult
}

const mockPatch = vi.mocked(patchIntegrationStateAtomic)
const mockGetCache = vi.mocked(getCachedIntegrationResearch)
const mockSetCache = vi.mocked(setCachedIntegrationResearch)
const mockResearcher = vi.mocked(runIntegrationResearcher)
const mockQuota = vi.mocked(checkFixedWindowQuota)

describe('propose_integration tool contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCache.mockResolvedValue(null)
    mockSetCache.mockResolvedValue(undefined)
    mockPatch.mockResolvedValue(undefined)
    mockQuota.mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetMs: 24 * 60 * 60 * 1000,
    })
  })

  it('known platform request: RD Station resolves to the curated template without research', async () => {
    const result = asProposal(await makeTool().execute({ platform: 'RD Station' }))

    expect(result.proposal).toMatchObject({
      platform: 'RD Station',
      templateSlug: 'rd-station',
    })
    expect(result.proposal.whatDataSent).toContain('nome')
    expect(result.proposal.whatDataSent).toContain('email')
    expect(result.proposal.whatDataSent).toContain('telefone')
    expect(result.proposal.sources).toBeUndefined()

    expect(mockGetCache).not.toHaveBeenCalled()
    expect(mockQuota).not.toHaveBeenCalled()
    expect(mockResearcher).not.toHaveBeenCalled()
    expect(mockPatch).toHaveBeenCalledWith({
      projectId: ctx.projectId,
      organizationId: ctx.organizationId,
      patch: { proposed: result.proposal },
    })
  })

  it('unknown platform with researched docs: returns cited proposal and caches the synthesis', async () => {
    const sourceUrl = 'https://developers.hubspot.com/docs/api/crm/contacts'
    mockResearcher.mockResolvedValueOnce({
      status: 'found',
      sources: [sourceUrl],
      blueprint: {
        endpoints: [
          {
            purpose: 'Criar contato',
            method: 'POST',
            urlTemplate: 'https://api.hubapi.com/crm/v3/objects/contacts',
            authType: 'bearer',
            sourceUrl,
          },
        ],
        credentials: [
          {
            key: 'access_token',
            label: 'Token de acesso',
            whereToGet: 'Configuracoes > Integracoes privadas',
            authType: 'bearer',
          },
        ],
      },
    })

    const result = asProposal(await makeTool().execute({ platform: 'HubSpot CRM' }))

    expect(result.proposal).toMatchObject({
      platform: 'HubSpot CRM',
      templateSlug: 'generic-webhook',
      sources: [{ url: sourceUrl }],
    })
    expect(result.proposal.whatDataSent).toContain('Pesquisei')
    expect(result.proposal.whatDataSent).toContain('webhook')

    expect(mockGetCache).toHaveBeenCalledWith('hubspot-crm')
    expect(mockQuota).toHaveBeenCalledWith('integrationResearch', ctx.organizationId)
    expect(mockResearcher).toHaveBeenCalledWith({
      platform: 'HubSpot CRM',
      organizationId: ctx.organizationId,
    })
    expect(mockSetCache).toHaveBeenCalledWith('hubspot-crm', {
      endpoints: expect.any(Array),
      credentials: expect.any(Array),
      sources: [sourceUrl],
    })
    expect(mockPatch).toHaveBeenCalledWith({
      projectId: ctx.projectId,
      organizationId: ctx.organizationId,
      patch: { proposed: result.proposal },
    })
  })

  it('unknown platform without usable docs: degrades to webhook with no fabricated sources', async () => {
    mockResearcher.mockResolvedValueOnce({ status: 'empty' })

    const result = asProposal(await makeTool().execute({ platform: 'Sistema X' }))

    expect(result.proposal).toMatchObject({
      platform: 'Sistema X',
      templateSlug: 'generic-webhook',
    })
    expect(result.proposal.sources).toBeUndefined()
    expect(result.proposal.whatDataSent).toContain('webhook')
    expect(result.proposal.whatDataSent).toContain('Sistema X')
    expect(mockSetCache).not.toHaveBeenCalled()
    expect(mockPatch).toHaveBeenCalledWith({
      projectId: ctx.projectId,
      organizationId: ctx.organizationId,
      patch: { proposed: result.proposal },
    })
  })

  it('cached unknown platform skips quota and live research, but keeps cited sources', async () => {
    const sourceUrl = 'https://developers.pipedrive.com/docs/api/v1/Persons'
    mockGetCache.mockResolvedValueOnce({
      endpoints: [{ method: 'POST' }],
      credentials: [{ key: 'api_token' }],
      sources: [sourceUrl],
    })

    const result = asProposal(await makeTool().execute({ platform: 'Pipedrive' }))

    expect(result.proposal).toMatchObject({
      platform: 'Pipedrive',
      templateSlug: 'generic-webhook',
      sources: [{ url: sourceUrl }],
    })
    expect(mockQuota).not.toHaveBeenCalled()
    expect(mockResearcher).not.toHaveBeenCalled()
    expect(mockSetCache).not.toHaveBeenCalled()
  })

  it('quota exhausted: returns a plain refusal and writes no proposal', async () => {
    mockQuota.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetMs: 2 * 60 * 60 * 1000,
    })

    const result = asFailure(await makeTool().execute({ platform: 'ERP raro' }))

    expect(result.message).toContain('limite de pesquisas')
    expect(result.message).toContain('webhook')
    expect(mockResearcher).not.toHaveBeenCalled()
    expect(mockPatch).not.toHaveBeenCalled()
  })
})
