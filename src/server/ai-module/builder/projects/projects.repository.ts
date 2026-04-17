/**
 * Builder Project Repository (projects sub-module)
 *
 * Wrapper fino de Prisma para BuilderProject / BuilderProjectConversation /
 * BuilderProjectMessage / BuilderPromptVersion. Todos os métodos são escopados
 * por organização no chamador — esta camada confia que o chamador já validou
 * a posse da organização, exceto quando o método explicitamente a impõe
 * (ver `findByIdForOrg`, `findProjectForOrg`, `softDelete`).
 *
 * Nota: este arquivo é a nova casa canônica do repositório. O antigo
 * `../repositories/builder-project.repository.ts` permanece no lugar até que
 * a migração do controller monolítico seja concluída em fase posterior.
 */

import { getDatabase } from '@/server/services/database'
import type { Prisma } from '@prisma/client'

export const builderProjectRepository = {
  /**
   * US-005: Cria um BuilderProject + conversa vazia + primeira mensagem do
   * usuário em uma única transação.
   */
  async createWithInitialMessage(params: {
    organizationId: string
    userId: string
    prompt: string
    type: 'ai_agent'
    name: string
  }) {
    const database = getDatabase()
    if (!database.builderProject) {
      throw new Error(
        'PrismaClient.builderProject delegate indisponível. Rode `npx prisma generate` e reinicie o dev server.',
      )
    }
    return database.$transaction(async (tx) => {
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
   * Soft delete: marca o projeto como `archived` e carimba `archivedAt` com
   * o timestamp atual. Só arquiva se o projeto pertencer à org passada.
   *
   * Retorna o registro atualizado, ou `null` caso o projeto não exista/não
   * pertença à organização.
   */
  async softDelete(projectId: string, organizationId: string) {
    const database = getDatabase()
    const existing = await database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    })
    if (!existing) return null

    return database.builderProject.update({
      where: { id: projectId },
      data: {
        status: 'archived',
        archivedAt: new Date(),
      },
    })
  },

  /**
   * Atualiza o `systemPrompt` do `AIAgentConfig` vinculado a um projeto.
   *
   * Retorna `{ id, systemPrompt, updatedAt }` do agente atualizado, ou `null`
   * se o projeto não existir, não pertencer à organização ou não tiver um
   * agente vinculado. Retornar `null` é intencional para não vazar existência.
   */
  async updateAgentSystemPrompt(
    projectId: string,
    organizationId: string,
    systemPrompt: string,
  ) {
    const database = getDatabase()

    const project = await database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      select: { aiAgentId: true },
    })

    if (!project?.aiAgentId) return null

    return database.aIAgentConfig.update({
      where: { id: project.aiAgentId },
      data: { systemPrompt },
      select: { id: true, systemPrompt: true, updatedAt: true },
    })
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
   * Duplicate: clones a BuilderProject in a single transaction.
   * Clones: BuilderProject, AIAgentConfig (if present), latest BuilderPromptVersion (if present).
   * Does NOT clone: deployments, conversations, messages.
   * Returns the new project id.
   */
  async duplicate(
    projectId: string,
    organizationId: string,
    userId: string,
    newName?: string,
  ) {
    const database = getDatabase()

    // Fetch original with its aiAgent and latest prompt version
    const original = await database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      include: {
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

    return database.$transaction(async (tx) => {
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
      const newProject = await tx.builderProject.create({
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

      return newProject
    })
  },
}

export type BuilderProjectRepository = typeof builderProjectRepository
export type BuilderProjectWithConversation = Prisma.BuilderProjectGetPayload<{
  include: { conversation: true }
}>
