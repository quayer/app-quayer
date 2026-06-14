import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockProjectFindFirst,
  mockKnowledgeCollectionFindFirst,
  mockTransaction,
  mockAgentCreate,
  mockPromptVersionCreate,
  mockProjectUpdate,
  mockTrackJourneyEvent,
  mockInvalidateProjectRefinement,
} = vi.hoisted(() => ({
  mockProjectFindFirst: vi.fn(),
  mockKnowledgeCollectionFindFirst: vi.fn(),
  mockTransaction: vi.fn(),
  mockAgentCreate: vi.fn(),
  mockPromptVersionCreate: vi.fn(),
  mockProjectUpdate: vi.fn(),
  mockTrackJourneyEvent: vi.fn(),
  mockInvalidateProjectRefinement: vi.fn(),
}))

vi.mock('@/server/services/database', () => ({
  database: {
    builderProject: {
      findFirst: mockProjectFindFirst,
    },
    knowledgeCollection: {
      findFirst: mockKnowledgeCollectionFindFirst,
    },
    $transaction: mockTransaction,
  },
}))

vi.mock('@/server/services/journey-events', () => ({
  trackJourneyEvent: mockTrackJourneyEvent,
}))

vi.mock('../refinement/refinement-state', () => ({
  invalidateProjectRefinement: mockInvalidateProjectRefinement,
}))

import { createAgentTool } from './create-agent.tool'

const CTX = {
  projectId: 'proj-1',
  organizationId: 'org-1',
  userId: 'user-1',
}

const VALID_SYSTEM_PROMPT = `# Papel
Você é o SDR virtual da Acme. Você atende leads pelo WhatsApp, qualifica interesse e NÃO promete preços, disponibilidade ou condições sem confirmação.

# Objetivo
Qualificar interessados e encaminhar oportunidades para a equipe comercial. A missão está cumprida quando o lead tem interesse e próximo passo definidos.

# Tom de voz
Tom cordial, direto e consultivo. Exemplo bom: "Posso te ajudar com isso." Exemplo ruim: "Vou te empurrar para vendas". Linguagem proibida: "garantido", "aprovado com certeza".

# Comunicação
Uma pergunta por vez. No máximo 3 linhas por mensagem. Retry progressivo: na 1ª tentativa reformule; na 2ª ofereça atendimento humano.

# Ferramentas
- transfer_to_human: quando o lead pedir humano, negociação, preço final ou sair do escopo.

# Regras críticas
SEMPRE resumir o interesse antes de transferir.
NUNCA inventar preço, disponibilidade ou prazo.

# Fluxo de atendimento
Etapa 1: saudar e entender interesse.
Etapa 2: qualificar objetivo do lead.
Etapa 3: resumir dados e acionar humano quando fizer sentido.

# Gatilhos e fallback
Gatilho de aceite: "sim", "pode", "quero", "ok". Fallback: se não entender, reformule; depois ofereça humano.

# Limitações
Não responde sobre preço final, disponibilidade específica ou condição comercial não confirmada. Fora do escopo: assuntos que não sejam atendimento comercial.

# Encerramento
Após transferir para humano, PARAR e não enviar mais mensagens. FIM.`

const INPUT = {
  name: 'SDR Acme',
  systemPrompt: VALID_SYSTEM_PROMPT,
  provider: 'anthropic' as const,
  model: 'claude-sonnet-4-20250514',
  temperature: 0.4,
  enabledTools: ['transfer_to_human'],
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: CTX.projectId,
    aiAgentId: null,
    metadata: {},
    conversation: { builderState: { journeyVersion: 2 } },
    ...overrides,
  }
}

async function execute(input: typeof INPUT = INPUT) {
  const builtTool = createAgentTool(CTX)
  const executeFn = (
    builtTool as unknown as { execute: (i: typeof INPUT) => Promise<unknown> }
  ).execute
  return executeFn(input)
}

function agentCreateData() {
  expect(mockAgentCreate).toHaveBeenCalledOnce()
  return mockAgentCreate.mock.calls[0]![0].data as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockProjectFindFirst.mockResolvedValue(project())
  mockKnowledgeCollectionFindFirst.mockResolvedValue(null)
  mockAgentCreate.mockResolvedValue({ id: 'agent-1', name: INPUT.name })
  mockPromptVersionCreate.mockResolvedValue({ id: 'version-1', versionNumber: 1 })
  mockProjectUpdate.mockResolvedValue({ id: CTX.projectId })
  mockTrackJourneyEvent.mockResolvedValue(undefined)
  mockInvalidateProjectRefinement.mockResolvedValue(undefined)
  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        aIAgentConfig: { create: mockAgentCreate },
        builderPromptVersion: { create: mockPromptVersionCreate },
        builderProject: { update: mockProjectUpdate },
      }),
  )
})

describe('createAgentTool', () => {
  it('T29: usa metadata.knowledgeCollectionId antes do fallback por nome', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(
      project({ metadata: { knowledgeCollectionId: 'col-from-meta' } }),
    )
    mockKnowledgeCollectionFindFirst.mockResolvedValueOnce({ id: 'col-from-meta' })

    const result = await execute()

    expect(result).toMatchObject({ success: true, agentId: 'agent-1' })
    expect(mockKnowledgeCollectionFindFirst).toHaveBeenCalledOnce()
    expect(mockKnowledgeCollectionFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'col-from-meta',
        organizationId: CTX.organizationId,
        isActive: true,
      },
      select: { id: true },
    })
    expect(agentCreateData()).toMatchObject({
      ragCollectionId: 'col-from-meta',
      useRAG: true,
    })
  })

  it('T29: cai no fallback por nome quando metadata nao tem collectionId', async () => {
    mockKnowledgeCollectionFindFirst.mockResolvedValueOnce({ id: 'col-by-name' })

    const result = await execute()

    expect(result).toMatchObject({ success: true, agentId: 'agent-1' })
    expect(mockKnowledgeCollectionFindFirst).toHaveBeenCalledWith({
      where: {
        organizationId: CTX.organizationId,
        name: 'kb:proj-1',
        isActive: true,
      },
      select: { id: true },
    })
    expect(agentCreateData()).toMatchObject({
      ragCollectionId: 'col-by-name',
      useRAG: true,
    })
  })

  it('T25: injeta disclosure de metadata.identityCard no prompt materializado', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(
      project({
        metadata: {
          identityCard: {
            displayName: 'Marina',
            disclosureMode: 'custom',
            disclosureCustomText: 'Sou a Marina, assistente virtual da Acme.',
          },
        },
      }),
    )

    await execute()

    const data = agentCreateData()
    expect(data.systemPrompt).toContain('# Identidade')
    expect(data.systemPrompt).toContain('Sou a Marina, assistente virtual da Acme.')
    expect(mockPromptVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: data.systemPrompt }),
      }),
    )
  })

  it('T25: emite agent_created com a journeyVersion congelada', async () => {
    await execute()

    expect(mockTrackJourneyEvent).toHaveBeenCalledOnce()
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith({
      organizationId: CTX.organizationId,
      projectId: CTX.projectId,
      journeyVersion: 2,
      event: 'agent_created',
    })
  })

  it('recusa create_agent quando o prompt não tem anatomia técnica válida', async () => {
    const result = await execute({
      ...INPUT,
      systemPrompt:
        'Você é o agente SDR do empreendimento imobiliário Vibra Parque Vila Sônia. Seu papel é atender leads pelo WhatsApp, responder dúvidas, captar informações, qualificar e encaminhar oportunidades. Siga o fluxo aprovado e respeite as decisões do usuário.',
    })

    expect(result).toMatchObject({
      success: false,
      code: 'PROMPT_VALIDATION_FAILED',
    })
    expect(mockAgentCreate).not.toHaveBeenCalled()
    expect(mockPromptVersionCreate).not.toHaveBeenCalled()
    expect(mockProjectUpdate).not.toHaveBeenCalled()
  })
})
