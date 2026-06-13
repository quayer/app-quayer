/**
 * Builder Project Repository (projects sub-module)
 *
 * Wrapper fino de Prisma para BuilderProject / BuilderProjectConversation /
 * BuilderProjectMessage / BuilderPromptVersion. Todos os métodos são escopados
 * por organização no chamador — esta camada confia que o chamador já validou
 * a posse da organização, exceto quando o método explicitamente a impõe
 * (ver `findByIdForOrg`, `findProjectForOrg`, `hardDelete`).
 *
 * Nota: este arquivo é a nova casa canônica do repositório. O antigo
 * `../repositories/builder-project.repository.ts` permanece no lugar até que
 * a migração do controller monolítico seja concluída em fase posterior.
 */

import { getDatabase } from '@/server/services/database'
import type { Prisma } from '@prisma/client'
import {
  mergeAgentRuntimeSettingsIntoMetadata,
  normalizeAgentRuntimeSettings,
  type AgentRuntimeSettings,
} from '@/lib/agent-runtime-settings'
import { isBuilderV2Enabled } from '@/lib/feature-flags/builder-v2'
import { isBuilderMissionFirstEnabled } from '@/lib/feature-flags/builder-mission-first'
import { trackJourneyEvent } from '@/server/services/journey-events'
import {
  DEFAULT_BUILDER_STATE,
  parseBuilderState,
} from '../cards/builder-state'
import {
  buildRefinementPublishBlockerMessage,
  getRefinementPublishGateMessage,
} from '../refinement/refinement-gate'
import { buildRefinementMaterial } from '../refinement/refinement-material'
import { invalidateProjectRefinement } from '../refinement/refinement-state'

export const builderProjectRepository = {
  /**
   * US-005: Cria um BuilderProject + conversa vazia + primeira mensagem do
   * usuário em uma única transação.
   *
   * Jornada v2 (T10, plan §2.2 item 1): a versão da jornada é decidida AQUI no
   * backend pelo flag `BUILDER_JOURNEY_V2` (coorte estável por organizationId) e
   * CONGELADA no `builderState.journeyVersion` da conversa inicial (sem coluna
   * nova em BuilderProject). A rota repassa o cookie de override
   * `builder-v2-override` (QA) quando ele existe. O `journey_started` é emitido
   * com a versão congelada (fire-and-forget, fora da transação).
   *
   * Jornada v3 (mission-first, FR-37/FR-48): quando o projeto nasce em
   * `journeyVersion === 2` E o flag `BUILDER_MISSION_FIRST` resolve ON para a org
   * (coorte estável por organizationId; cookie `builder-mission-first-override`
   * repassado pela rota para QA), semeamos `builderState.missionFirst: true`. É
   * ADITIVO e DARK por default: se o flag estiver off (ou o projeto for v1) a
   * chave NEM é escrita — o state legado parseia `missionFirst: undefined` e o
   * engine se comporta exatamente como a v2 atual (NFR-12).
   */
  async createWithInitialMessage(params: {
    organizationId: string
    userId: string
    prompt: string
    type: 'ai_agent'
    name: string
    builderV2OverrideCookie?: string | null
    missionFirstOverrideCookie?: string | null
  }) {
    const database = getDatabase()
    if (!database.builderProject) {
      throw new Error(
        'PrismaClient.builderProject delegate indisponível. Rode `npx prisma generate` e reinicie o dev server.',
      )
    }

    const journeyVersion: 1 | 2 = isBuilderV2Enabled(
      params.organizationId,
      params.builderV2OverrideCookie,
    )
      ? 2
      : 1
    // Mission-first só vale dentro da v2: gateia por journeyVersion === 2 ANTES
    // de consultar o flag. Dark por default — quando false, a chave não é escrita.
    const missionFirst =
      journeyVersion === 2 &&
      isBuilderMissionFirstEnabled(
        params.organizationId,
        params.missionFirstOverrideCookie,
      )
    const initialBuilderState = {
      ...DEFAULT_BUILDER_STATE,
      project: {
        ...DEFAULT_BUILDER_STATE.project,
        name: params.name,
        objective: params.prompt.trim(),
      },
      journeyVersion,
      ...(missionFirst ? { missionFirst: true } : {}),
    }

    const result = await database.$transaction(async (tx) => {
      const project = await tx.builderProject.create({
        data: {
          organizationId: params.organizationId,
          userId: params.userId,
          type: params.type,
          name: params.name,
          status: 'draft',
          aiAgentId: null,
        },
      })

      const conversation = await tx.builderProjectConversation.create({
        data: {
          projectId: project.id,
          organizationId: params.organizationId,
          userId: params.userId,
          stateSummary: null,
          builderState: initialBuilderState as unknown as Prisma.InputJsonValue,
          lastMessageAt: new Date(),
        },
      })

      await tx.builderProjectMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: params.prompt,
        },
      })

      return { project, conversation }
    })

    console.info(
      `[journey-v2] projeto ${result.project.id} criado com journeyVersion=${journeyVersion} (org ${params.organizationId})`,
    )
    if (missionFirst) {
      console.info(
        `[mission-first] projeto ${result.project.id} semeado com missionFirst=true (org ${params.organizationId})`,
      )
    }
    // Fire-and-forget: nunca lança, jamais quebra a criação do projeto.
    void trackJourneyEvent({
      organizationId: params.organizationId,
      projectId: result.project.id,
      journeyVersion,
      event: 'journey_started',
    })

    return result
  },

  /**
   * Lista todos os Builder projects da organização, ordenados por atualização
   * recente. Inclui o agente vinculado (name, provider, model, isActive) quando
   * houver.
   */
  async listForOrg(params: {
    organizationId: string
    type?: 'ai_agent'
    status?: 'draft' | 'production' | 'archived'
    limit?: number
    offset?: number
  }) {
    const database = getDatabase()
    const where: Record<string, unknown> = {
      organizationId: params.organizationId,
    }
    if (params.type) where.type = params.type
    if (params.status) where.status = params.status

    const [data, total] = await Promise.all([
      database.builderProject.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: params.limit ?? 50,
        skip: params.offset ?? 0,
        include: {
          aiAgent: {
            select: {
              id: true,
              name: true,
              provider: true,
              model: true,
              isActive: true,
            },
          },
        },
      }),
      database.builderProject.count({ where }),
    ])

    return { data, total }
  },

  /**
   * Busca um projeto para uma org específica — usado para impor limites de tenant.
   * Retorna apenas o registro do projeto, sem relações expandidas.
   */
  async findProjectForOrg(projectId: string, organizationId: string) {
    const database = getDatabase()
    return database.builderProject.findFirst({
      where: { id: projectId, organizationId },
    })
  },

  /**
   * Busca um projeto por ID dentro da organização, carregando conversa 1:1 e
   * agente vinculado. Usado pelo endpoint `GET /projects/:id`.
   *
   * Retorna `null` caso o projeto não exista ou não pertença à org.
   */
  async findByIdForOrg(projectId: string, organizationId: string) {
    const database = getDatabase()
    return database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      include: {
        conversation: true,
        aiAgent: {
          select: {
            id: true,
            name: true,
            provider: true,
            model: true,
            isActive: true,
          },
        },
      },
    })
  },

  /**
   * Busca uma BuilderPromptVersion por id, verificando que pertence ao agente
   * informado.
   */
  async findPromptVersionForAgent(promptVersionId: string, aiAgentId: string) {
    const database = getDatabase()
    return database.builderPromptVersion.findFirst({
      where: { id: promptVersionId, aiAgentId },
    })
  },

  /**
   * US-007: Marca uma BuilderPromptVersion como publicada e move o projeto
   * para status `production`. Executa em uma única transação.
   */
  async publishVersion(params: {
    projectId: string
    promptVersionId: string
    publishedBy: string
  }) {
    const database = getDatabase()
    return database.$transaction(async (tx) => {
      const version = await tx.builderPromptVersion.update({
        where: { id: params.promptVersionId },
        data: {
          publishedAt: new Date(),
          publishedBy: params.publishedBy,
        },
      })

      await tx.builderProject.update({
        where: { id: params.projectId },
        data: { status: 'production' },
      })

      return version
    })
  },

  /**
   * Hard delete PERMANENTE de um BuilderProject. Remove fisicamente o registro
   * e tudo que cascateia dele via FK `onDelete: Cascade`:
   *   - BuilderProjectConversation → BuilderProjectMessage
   *   - BuilderDeployment (saga de publicação)
   *   - OrganizationProvider e CalendarConnection com `builderProjectId` setado
   *
   * O `AIAgentConfig` vinculado (FK `SetNull`) NÃO é apagado — preserva o
   * histórico de runtime (ChatSession/Message com clientes reais) e analytics.
   * Para não deixar um agente zumbi respondendo no WhatsApp após a exclusão do
   * projeto, desativamos o agente (`isActive = false`) e pausamos seus
   * AgentDeployment ACTIVE dentro da mesma transação.
   *
   * Retorna `{ id }` do projeto removido, ou `null` caso não exista/não pertença
   * à organização.
   */
  async hardDelete(projectId: string, organizationId: string) {
    const database = getDatabase()
    const project = await database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, aiAgentId: true },
    })
    if (!project) return null

    return database.$transaction(async (tx) => {
      // Stop the runtime agent so nothing keeps answering on WhatsApp.
      if (project.aiAgentId) {
        await tx.agentDeployment.updateMany({
          where: { agentConfigId: project.aiAgentId, status: 'ACTIVE' },
          data: { status: 'PAUSED', updatedAt: new Date() },
        })
        await tx.aIAgentConfig.update({
          where: { id: project.aiAgentId },
          data: { isActive: false },
        })
      }

      // Physical delete — cascade handles conversation/messages/deployments and
      // project-scoped providers/calendar connections.
      await tx.builderProject.delete({ where: { id: project.id } })

      return { id: project.id }
    })
  },

  /**
   * Atualiza o `systemPrompt` do `AIAgentConfig` vinculado a um projeto.
   *
   * Precondição otimista (`baseUpdatedAt`): quando informada e o agente foi
   * alterado desde então com um systemPrompt DIFERENTE do que está sendo
   * gravado, retorna `{ conflict: true, current }` sem escrever — o caller
   * devolve 409 e a UI decide entre recarregar ou manter a edição. Sem a
   * precondição (primeiro save da sessão), grava direto.
   *
   * Versionamento de edição manual: toda gravação mantém UMA
   * `BuilderPromptVersion` draft reutilizável com `createdBy: 'manual'` —
   * se a versão mais recente já é uma draft manual não-publicada, atualiza o
   * conteúdo dela; caso contrário cria a próxima versão. Assim a edição
   * manual é publicável pela saga de deploy (que publica VERSÕES, nunca o
   * `systemPrompt` cru).
   *
   * Retorna `{ conflict: false, agent }` no sucesso, `{ conflict: true, current }`
   * na falha de precondição, ou `null` se o projeto não existir, não pertencer
   * à organização ou não tiver um agente vinculado (intencional, não vaza
   * existência).
   */
  async updateAgentSystemPrompt(
    projectId: string,
    organizationId: string,
    systemPrompt: string,
    options?: { baseUpdatedAt?: Date },
  ): Promise<
    | null
    | { conflict: true; current: { id: string; systemPrompt: string | null; updatedAt: Date } }
    | { conflict: false; agent: { id: string; systemPrompt: string | null; updatedAt: Date } }
  > {
    const database = getDatabase()

    const project = await database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      select: { aiAgentId: true },
    })

    if (!project?.aiAgentId) return null
    const aiAgentId = project.aiAgentId

    let promptChanged = false
    const result = await database.$transaction(async (tx) => {
      const agent = await tx.aIAgentConfig.findUnique({
        where: { id: aiAgentId },
        select: { id: true, systemPrompt: true, updatedAt: true },
      })
      if (!agent) return null

      // No-op: nada mudou — não cria versão nem bumpa updatedAt.
      if ((agent.systemPrompt ?? '') === systemPrompt) {
        return { conflict: false as const, agent }
      }

      // Precondição otimista: o agente mudou desde o último save confirmado
      // E o systemPrompt do servidor diverge do que vamos gravar → conflito.
      if (
        options?.baseUpdatedAt &&
        agent.updatedAt.getTime() !== options.baseUpdatedAt.getTime()
      ) {
        return { conflict: true as const, current: agent }
      }

      const updated = await tx.aIAgentConfig.update({
        where: { id: aiAgentId },
        data: { systemPrompt },
        select: { id: true, systemPrompt: true, updatedAt: true },
      })
      promptChanged = true

      // Upsert da draft manual reutilizável (1 por sequência de edição —
      // nunca 1 por keystroke).
      const latest = await tx.builderPromptVersion.findFirst({
        where: { aiAgentId },
        orderBy: { versionNumber: 'desc' },
        select: {
          id: true,
          versionNumber: true,
          createdBy: true,
          publishedAt: true,
        },
      })

      if (latest && latest.createdBy === 'manual' && latest.publishedAt === null) {
        await tx.builderPromptVersion.update({
          where: { id: latest.id },
          data: { content: systemPrompt },
        })
      } else {
        await tx.builderPromptVersion.create({
          data: {
            aiAgentId,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            content: systemPrompt,
            description: 'Edição manual no editor de prompt',
            createdBy: 'manual',
          },
        })
      }

      return { conflict: false as const, agent: updated }
    })

    if (promptChanged) {
      await invalidateProjectRefinement({
        projectId,
        organizationId,
        reason: 'O editor manual alterou o systemPrompt depois do refinamento.',
      })
    }

    return result
  },

  /**
   * Atualiza flags operacionais do agente publicado/criador.
   *
   * Flags de runtime que ainda não possuem colunas próprias ficam em
   * BuilderProject.metadata.agentRuntimeSettings. TTS usa também os campos
   * já existentes em AIAgentConfig para o callback/outbound conseguir ler sem
   * depender só de metadata.
   */
  async updateAgentRuntimeSettings(
    projectId: string,
    organizationId: string,
    rawSettings: unknown,
  ): Promise<AgentRuntimeSettings | null> {
    const database = getDatabase()

    const project = await database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      select: {
        id: true,
        aiAgentId: true,
        metadata: true,
      },
    })

    if (!project) return null

    const settings = normalizeAgentRuntimeSettings(rawSettings)
    const metadata = mergeAgentRuntimeSettingsIntoMetadata(
      project.metadata,
      settings,
    ) as Prisma.InputJsonValue

    await database.$transaction(async (tx) => {
      await tx.builderProject.update({
        where: { id: project.id },
        data: { metadata },
      })

      if (project.aiAgentId) {
        await tx.aIAgentConfig.update({
          where: { id: project.aiAgentId },
          data: {
            enableTTS: settings.tts.enabled,
            ttsProvider: settings.tts.provider,
            ttsVoiceId: settings.tts.voiceId,
            ttsModel: settings.tts.model,
            ttsSpeechRate: settings.tts.speechRate,
          },
        })
      }
    })

    return settings
  },

  /**
   * Lista todas as BuilderPromptVersion do agente vinculado ao projeto.
   *
   * Valida ownership do projeto pela organização antes de buscar as versões.
   * Retorna `null` se o projeto não existir, não pertencer à org, ou não
   * tiver um agente vinculado — sem vazar existência.
   *
   * Ordenação: versionNumber DESC (mais nova primeiro).
   */
  async listVersionsForProject(projectId: string, organizationId: string) {
    const database = getDatabase()

    const project = await database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      select: { aiAgentId: true },
    })

    if (!project?.aiAgentId) return null

    return database.builderPromptVersion.findMany({
      where: { aiAgentId: project.aiAgentId },
      orderBy: { versionNumber: 'desc' },
      include: {
        publisher: {
          select: { id: true, name: true },
        },
      },
    })
  },

  /**
   * Rollback: creates a new BuilderPromptVersion with `createdBy: 'rollback'`
   * copying the content of `targetVersionId`, then updates the AIAgentConfig
   * systemPrompt to that content. Executes in a single transaction.
   *
   * Returns `{ newVersion, restored: { id, content } }` on success, or `null`
   * when the project does not exist, does not belong to the org, has no
   * aiAgentId, or the targetVersion does not belong to the same agent.
   */
  async rollbackToVersion(
    projectId: string,
    organizationId: string,
    targetVersionId: string,
    userId: string,
  ) {
    const database = getDatabase()

    const project = await database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, aiAgentId: true },
    })

    if (!project?.aiAgentId) return null

    const targetVersion = await database.builderPromptVersion.findUnique({
      where: { id: targetVersionId },
      select: {
        id: true,
        aiAgentId: true,
        versionNumber: true,
        content: true,
      },
    })

    if (!targetVersion || targetVersion.aiAgentId !== project.aiAgentId) {
      return null
    }

    const stateRow = await database.builderProjectConversation.findFirst({
      where: { projectId, organizationId },
      select: { builderState: true },
    })
    const builderState = parseBuilderState(stateRow?.builderState ?? null)
    const expectedMaterial =
      builderState.conversationBlueprint?.status === 'approved'
        ? buildRefinementMaterial({
            state: builderState,
            blueprint: builderState.conversationBlueprint,
            promptVersion: targetVersion,
          })
        : undefined
    const refinementMessage = getRefinementPublishGateMessage(
      builderState,
      expectedMaterial,
    )
    if (refinementMessage) {
      throw new Error(buildRefinementPublishBlockerMessage(refinementMessage))
    }

    const aggregate = await database.builderPromptVersion.aggregate({
      where: { aiAgentId: project.aiAgentId },
      _max: { versionNumber: true },
    })
    const nextVersionNumber = (aggregate._max.versionNumber ?? 0) + 1

    return database.$transaction(async (tx) => {
      const newVersion = await tx.builderPromptVersion.create({
        data: {
          aiAgentId: project.aiAgentId!,
          versionNumber: nextVersionNumber,
          content: targetVersion.content,
          description: `Revertido para v${targetVersion.versionNumber}`,
          createdBy: 'rollback',
          publishedAt: new Date(),
          publishedBy: userId,
        },
      })

      await tx.aIAgentConfig.update({
        where: { id: project.aiAgentId! },
        data: { systemPrompt: targetVersion.content, updatedAt: new Date() },
      })

      return {
        newVersion,
        restored: { id: project.aiAgentId!, content: targetVersion.content },
      }
    })
  },

  /**
   * Rename: updates `name` of a BuilderProject, verifying org ownership.
   * Returns the updated project, or `null` if not found / not owned.
   */
  async rename(projectId: string, organizationId: string, name: string) {
    const database = getDatabase()
    const existing = await database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    })
    if (!existing) return null

    return database.builderProject.update({
      where: { id: projectId },
      data: { name },
    })
  },

  /**
   * Archive: sets status = 'archived' and stamps archivedAt.
   * Verifies org ownership. Returns updated project or null.
   */
  async archive(projectId: string, organizationId: string) {
    const database = getDatabase()
    const existing = await database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    })
    if (!existing) return null

    return database.builderProject.update({
      where: { id: projectId },
      data: { status: 'archived', archivedAt: new Date() },
    })
  },

  /**
   * Unarchive: brings an archived project back to `draft` and clears
   * `archivedAt`. Verifies org ownership. Returns updated project or null.
   *
   * Reverte para `draft` (não `production`) de propósito: um projeto só volta a
   * `production` republicando pela saga de deploy.
   */
  async unarchive(projectId: string, organizationId: string) {
    const database = getDatabase()
    const existing = await database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    })
    if (!existing) return null

    return database.builderProject.update({
      where: { id: projectId },
      data: { status: 'draft', archivedAt: null },
    })
  },

  /**
   * Duplicate: clones a BuilderProject in a single transaction.
   * Clones: BuilderProject, AIAgentConfig (if present), latest BuilderPromptVersion (if present).
   * Does NOT clone: deployments, messages.
   *
   * Jornada v2 (T11, plan §2.2 item 1): o clone nasce com uma conversa 1:1 nova
   * (vazia, sem mensagens) cujo `builderState.journeyVersion` é HERDADO da
   * conversa do projeto-fonte — não o default 1. Sem isto, um clone de projeto
   * v2 sofreria downgrade silencioso para v1 na criação lazy da conversa. A
   * versão é congelada criando a conversa aqui (mesmo padrão de
   * `createWithInitialMessage`) e o `journey_started` é emitido na duplicação.
   * Returns the new project id.
   */
  async duplicate(
    projectId: string,
    organizationId: string,
    userId: string,
    newName?: string,
  ) {
    const database = getDatabase()

    // Fetch original with its aiAgent, latest prompt version and the 1:1
    // conversation (only its builderState — to inherit journeyVersion).
    const original = await database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      include: {
        conversation: { select: { builderState: true } },
        aiAgent: {
          include: {
            builderPromptVersions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
            },
          },
        },
      },
    })
    if (!original) return null

    const clonedName = newName ?? `${original.name} (cópia)`

    // Inherit the journey version from the source conversation's builderState
    // (legacy/missing rows backfill to 1 via parseBuilderState). Frozen into the
    // clone's fresh conversation so the engine never downgrades a v2 clone.
    const sourceState = parseBuilderState(
      original.conversation?.builderState ?? null,
    )
    const journeyVersion: 1 | 2 = sourceState.journeyVersion
    // NFR-12 paridade: herda o marcador mission-first (v3) do projeto de origem
    // para o clone NÃO regredir para a v2 pura quando o flag estiver on (mesmo
    // racional do journeyVersion herdado acima).
    const clonedBuilderState = {
      ...DEFAULT_BUILDER_STATE,
      journeyVersion,
      ...(sourceState.missionFirst ? { missionFirst: true } : {}),
    }

    const newProject = await database.$transaction(async (tx) => {
      // 1. Clone AIAgentConfig if original had one
      let newAiAgentId: string | null = null
      if (original.aiAgent) {
        const src = original.aiAgent
        // AIAgentConfig has a unique constraint on (organizationId, name)
        // We suffix the name to avoid conflicts
        const agentName = `${src.name} (cópia)`
        const newAgent = await tx.aIAgentConfig.create({
          data: {
            organizationId,
            name: agentName,
            isActive: src.isActive,
            provider: src.provider,
            model: src.model,
            temperature: src.temperature,
            maxTokens: src.maxTokens,
            systemPrompt: src.systemPrompt,
            personality: src.personality,
            agentTarget: src.agentTarget,
            agentBehavior: src.agentBehavior,
            agentAvatar: src.agentAvatar,
            useMemory: src.useMemory,
            memoryWindow: src.memoryWindow,
            useRAG: src.useRAG,
            ragCollectionId: src.ragCollectionId,
            enabledTools: src.enabledTools,
            enableTTS: src.enableTTS,
            ttsProvider: src.ttsProvider,
            ttsVoiceId: src.ttsVoiceId,
            ttsModel: src.ttsModel,
            ttsSpeechRate: src.ttsSpeechRate,
            callbackUrl: src.callbackUrl,
            callbackSecret: src.callbackSecret,
          },
        })
        newAiAgentId = newAgent.id

        // 2. Clone latest BuilderPromptVersion if any
        const latestVersion = src.builderPromptVersions[0]
        if (latestVersion) {
          await tx.builderPromptVersion.create({
            data: {
              aiAgentId: newAiAgentId,
              versionNumber: 1,
              content: latestVersion.content,
              description: latestVersion.description,
              createdBy: 'manual',
              publishedAt: null,
              publishedBy: null,
            },
          })
        }
      }

      // 3. Create the new BuilderProject (status = draft)
      const created = await tx.builderProject.create({
        data: {
          organizationId,
          userId,
          type: original.type,
          name: clonedName,
          status: 'draft',
          aiAgentId: newAiAgentId,
          metadata: original.metadata ?? undefined,
        },
      })

      // 4. Create the clone's 1:1 conversation seeded with the INHERITED
      // journeyVersion (no messages). This is the canonical creation point for
      // the clone's conversation, so the engine never sees the default-1
      // downgrade for a v2 source.
      await tx.builderProjectConversation.create({
        data: {
          projectId: created.id,
          organizationId,
          userId,
          stateSummary: null,
          builderState: clonedBuilderState as unknown as Prisma.InputJsonValue,
          lastMessageAt: new Date(),
        },
      })

      return created
    })

    console.info(
      `[journey-v2] projeto ${newProject.id} duplicado de ${projectId} com journeyVersion=${journeyVersion} herdado (org ${organizationId})`,
    )
    // Fire-and-forget: nunca lança, jamais quebra a duplicação.
    void trackJourneyEvent({
      organizationId,
      projectId: newProject.id,
      journeyVersion,
      event: 'journey_started',
    })

    return newProject
  },
}

export type BuilderProjectRepository = typeof builderProjectRepository
export type BuilderProjectWithConversation = Prisma.BuilderProjectGetPayload<{
  include: { conversation: true }
}>
