/**
 * Builder Tool — create_agent
 *
 * Wrapper tool exposed to the Quayer Builder meta-agent. Allows the Builder AI
 * to create a real AIAgentConfig for the current BuilderProject once the user
 * has approved the generated system prompt.
 *
 * Pattern mirrors `src/server/ai-module/ai-agents/tools/builtin-tools.ts`:
 *   - Uses Vercel AI SDK `tool()` helper with Zod inputSchema.
 *   - Receives a bound context via factory function.
 *   - Accesses Prisma directly through the shared `database` singleton
 *     (no HTTP self-calls).
 *
 * Side effects (all inside a single Prisma transaction):
 *   1. Creates `AIAgentConfig` scoped to the organization.
 *   2. Creates the first `BuilderPromptVersion` (versionNumber = 1, createdBy = chat).
 *   3. Links the agent to the owning `BuilderProject` via `aiAgentId`.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { trackJourneyEvent } from '@/server/services/journey-events'
import { buildBuilderTool } from './build-tool'
import { BUILDER_RESERVED_NAME } from '../builder.constants'
import { collectionNameFor, metaCollectionId } from '../knowledge/knowledge-helpers'
import { parseBuilderState } from '../cards/builder-state'
import {
  validateBlueprintPreservation,
  validatePrompt,
  type ValidationIssue,
} from '../validators'
import {
  IDENTITY_CARD_METADATA_KEY,
  getIdentityCardFromMetadata,
  injectDisclosureIntoPrompt,
} from '@/lib/agent-identity-card'
import { invalidateProjectRefinement } from '../refinement/refinement-state'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * Runtime context injected into the Builder tool execution.
 * Bound once per Builder chat turn.
 */
export interface BuilderToolExecutionContext {
  /** BuilderProject.id that owns the conversation — agent will be linked here */
  projectId: string
  /** Organization.id (tenant boundary) */
  organizationId: string
  /** User.id of the Builder chat author — used as publishedBy/createdBy hint */
  userId: string
}

function formatBlockingPromptIssues(issues: readonly ValidationIssue[]): string {
  const errors = issues.filter((issue) => issue.severity === 'error')
  return errors
    .slice(0, 6)
    .map((issue) => issue.message)
    .join(' | ')
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the `create_agent` tool bound to a Builder chat context.
 *
 * The LLM should only call this AFTER the user has explicitly approved the
 * generated system prompt in chat.
 */
export function createAgentTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'create_agent',
    metadata: { isReadOnly: false, isConcurrencySafe: false, requiresApproval: true },
    tool: tool({
    description:
      'Creates a new AI agent for WhatsApp in the current Builder project. Call this ONLY AFTER showing the generated system prompt to the user and receiving explicit approval. Links the new AIAgentConfig to the current BuilderProject and creates version 1 of the prompt.',
    inputSchema: z.object({
      name: z
        .string()
        .min(2)
        .max(100)
        .describe('The agent name (shown to the user, unique per organization)'),
      systemPrompt: z
        .string()
        .min(50)
        .max(50000)
        .describe('The full system prompt for the agent (user-approved)'),
      provider: z
        .enum(['anthropic', 'openai', 'openrouter'])
        .default('anthropic')
        .describe('LLM provider'),
      model: z
        .string()
        .min(1)
        .describe(
          'Model name (e.g., claude-sonnet-4-20250514, gpt-4o, llama-3.1-70b-versatile)',
        ),
      temperature: z.number().min(0).max(2).default(0.7),
      enabledTools: z
        .array(z.string())
        .default([])
        .describe(
          'Builtin tool keys to enable (e.g., transfer_to_human, pause_session, get_session_history, search_contacts, create_lead, schedule_callback)',
        ),
    }),
    execute: async (input) => {
      try {
        if (input.name === BUILDER_RESERVED_NAME) {
          return {
            success: false,
            message: 'This agent name is reserved',
          }
        }

        // Sanity check: ensure the BuilderProject exists in the same org and
        // does not yet have an agent bound to it (1:1 relation).
        const project = await database.builderProject.findFirst({
          where: {
            id: ctx.projectId,
            organizationId: ctx.organizationId,
          },
          select: {
            id: true,
            aiAgentId: true,
            // T25 (FR-22) — o disclosure escolhido no agent_review vive em
            // metadata.identityCard ANTES de o agente existir (v2 decide a
            // identidade antes da criação); o journeyVersion vem do builderState
            // da conversa para etiquetar o evento de funil.
            metadata: true,
            conversation: { select: { builderState: true } },
          },
        })

        if (!project) {
          return {
            success: false,
            message: `BuilderProject ${ctx.projectId} not found in organization ${ctx.organizationId}`,
          }
        }

        if (project.aiAgentId) {
          return {
            success: false,
            message: `This project already has an AI agent (${project.aiAgentId}). Use edit_agent to modify it instead.`,
          }
        }

        const builderState = parseBuilderState(
          project.conversation?.builderState ?? null,
        )
        const promptValidation = validatePrompt(
          input.systemPrompt,
          input.enabledTools,
        )
        if (!promptValidation.pass) {
          return {
            success: false,
            code: 'PROMPT_VALIDATION_FAILED',
            message:
              'O prompt final não tem a anatomia técnica mínima para criar o agente. Gere novamente com generate_prompt_anatomy antes de criar. ' +
              formatBlockingPromptIssues(promptValidation.issues),
            issues: promptValidation.issues,
          }
        }

        const approvedBlueprint =
          builderState.journeyVersion === 2 &&
          builderState.conversationBlueprint?.status === 'approved'
            ? builderState.conversationBlueprint
            : undefined
        if (approvedBlueprint) {
          const blueprintValidation = validateBlueprintPreservation({
            prompt: input.systemPrompt,
            blueprint: approvedBlueprint,
          })
          if (!blueprintValidation.pass) {
            return {
              success: false,
              code: 'BLUEPRINT_PRESERVATION_FAILED',
              message:
                'O prompt final não preserva o Plano de atendimento aprovado. Gere novamente com generate_prompt_anatomy antes de criar.',
              issues: blueprintValidation.issues,
            }
          }
        }

        // Vínculo da base de conhecimento (audit alto): na jornada padrão o
        // usuário cola fontes ANTES de aprovar o prompt — a KnowledgeCollection
        // kb:<projectId> já existe quando o agente nasce, mas nenhum outro passo
        // religava AIAgentConfig.ragCollectionId (o único write acontece quando
        // a collection é CRIADA com agente já presente). Sem isto, RAG e
        // buscar_media ficam mortos no WhatsApp enquanto o playground funciona
        // via fallback próprio. Backfill barato no próprio create; a v2 fará o
        // equivalente como passo da saga de deploy.
        const metadataCollectionId = metaCollectionId(project.metadata)
        const metadataCollection = metadataCollectionId
          ? await database.knowledgeCollection.findFirst({
              where: {
                id: metadataCollectionId,
                organizationId: ctx.organizationId,
                isActive: true,
              },
              select: { id: true },
            })
          : null
        const existingCollection =
          metadataCollection ??
          (await database.knowledgeCollection.findFirst({
            where: {
              organizationId: ctx.organizationId,
              name: collectionNameFor(ctx.projectId),
              isActive: true,
            },
            select: { id: true },
          }))

        // T25 (FR-22, plan §4.5) — disclosure no prompt ANTES de o agente existir.
        // No v2 a identidade é decidida no agent_review e vive em
        // metadata.identityCard; o `create_agent` materializa o bloco '# Identidade'
        // no systemPrompt (idempotente). Em v1 o disclosure entra depois, via PATCH
        // /builder/identity (identity.routes.ts). Só injetamos quando o projeto TEM
        // um identityCard de verdade — sem ele o prompt fica IDÊNTICO ao aprovado
        // (getIdentityCardFromMetadata devolveria o card default, que ainda assim
        // anexaria um bloco; o guard pela chave evita esse efeito colateral).
        const hasIdentityCard =
          project.metadata !== null &&
          typeof project.metadata === 'object' &&
          !Array.isArray(project.metadata) &&
          IDENTITY_CARD_METADATA_KEY in project.metadata
        const systemPrompt = hasIdentityCard
          ? injectDisclosureIntoPrompt(
              input.systemPrompt,
              getIdentityCardFromMetadata(project.metadata),
            )
          : input.systemPrompt

        // Transactional create: agent + version + project link
        const result = await database.$transaction(async (tx) => {
          const agent = await tx.aIAgentConfig.create({
            data: {
              organizationId: ctx.organizationId,
              name: input.name,
              provider: input.provider,
              model: input.model,
              temperature: input.temperature,
              systemPrompt,
              enabledTools: input.enabledTools,
              isActive: true,
              ...(existingCollection
                ? { ragCollectionId: existingCollection.id, useRAG: true }
                : {}),
            },
            select: { id: true, name: true },
          })

          const version = await tx.builderPromptVersion.create({
            data: {
              aiAgentId: agent.id,
              versionNumber: 1,
              content: systemPrompt,
              description: 'Initial version (created by Builder AI)',
              createdBy: 'chat',
            },
            select: { id: true, versionNumber: true },
          })

          await tx.builderProject.update({
            where: { id: ctx.projectId },
            data: { aiAgentId: agent.id },
          })

          return { agent, version }
        })

        // T25 — funil: o agente nasceu. Fire-and-forget, nunca lança. O
        // journeyVersion vem do builderState da conversa (parseBuilderState
        // backfilla legados para 1).
        await trackJourneyEvent({
          organizationId: ctx.organizationId,
          projectId: ctx.projectId,
          journeyVersion: builderState.journeyVersion,
          event: 'agent_created',
        })

        await invalidateProjectRefinement({
          projectId: ctx.projectId,
          organizationId: ctx.organizationId,
          reason: 'create_agent criou um novo agente/prompt depois do refinamento.',
        })

        return {
          success: true,
          agentId: result.agent.id,
          versionNumber: result.version.versionNumber,
          message: `Agent '${result.agent.name}' created successfully.`,
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create agent'
        return {
          success: false,
          message,
        }
      }
    },
  }),
  })
}
