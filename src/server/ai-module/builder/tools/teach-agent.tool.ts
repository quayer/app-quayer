/**
 * teach_agent — Builder tool (QH-07b)
 *
 * Allows the Builder meta-agent to teach the project's AI agent new knowledge
 * dynamically during a chat turn, without requiring the user to use the setup
 * card (source_progress). The card is for the setup wizard flow; this tool is
 * for dynamic mid-chat knowledge ingestion.
 *
 * Supported source kinds:
 *   'url'  — a public http(s) URL. Reuses ingestSourceRefs (Ralph's infra) which
 *            handles collection wiring, builderState seeding, and async job
 *            enqueue atomically. Same pipeline as the setup card.
 *   'text' — inline text content (FAQ, product list, instructions, etc.).
 *            Creates a KnowledgeSource with type='text' (source field stores the
 *            text; extractText falls back to source.source when rawText absent)
 *            and enqueues the async quayer:source-enrich job.
 *
 * Tenant boundary: every query is filtered by organizationId (ctx).
 * Rules: zero `any`, Zod input, <= 200 lines, imports @/server/...
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import { ingestSourceRefs } from '@/server/ai-module/builder/sources/ingest-source-refs'
import { enqueueSourceEnrich } from '@/server/services/jobs/source-enrich.queue'
import { loadProject, ensureCollectionIdOrThrow } from '@/server/ai-module/builder/knowledge/knowledge-helpers'
import { patchSourceIngestionAtomic } from '@/server/ai-module/builder/sources/builder-state-db'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const teachAgentInputSchema = z.object({
  source: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('url'),
      value: z
        .string()
        .url()
        .describe('Public http(s) URL to fetch and embed into the agent knowledge base'),
    }),
    z.object({
      kind: z.literal('text'),
      value: z
        .string()
        .min(20)
        .max(50000)
        .describe('Inline text content (FAQ, price list, product info, etc.) to embed'),
    }),
  ]),
  goal: z
    .string()
    .max(500)
    .optional()
    .describe(
      'Why this knowledge is being added (e.g., "responder dúvidas sobre preços de dezembro"). Shown in status feedback only.',
    ),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the active conversation for a project (org-scoped). Returns null when none found. */
async function resolveConversationId(
  projectId: string,
  organizationId: string,
): Promise<string | null> {
  const row = await database.builderProjectConversation.findFirst({
    where: { projectId, organizationId },
    select: { id: true },
  })
  return row?.id ?? null
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function teachAgentTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'teach_agent',
    metadata: { isReadOnly: false, isConcurrencySafe: false, requiresApproval: false },
    tool: tool({
      description:
        'Teaches the project\'s AI agent new knowledge mid-chat by ingesting a URL or inline text into its RAG knowledge base. Use this when the user says "ensina o agente sobre X", pastes a URL, or provides content they want the agent to know. The ingestion runs asynchronously — return status is "learning" and the agent will be updated in the background. Do NOT call this for the initial website/Instagram setup (that uses the source_progress card).',
      inputSchema: teachAgentInputSchema,
      execute: async (input) => {
        try {
          // 1. Verify project exists in this org
          const project = await loadProject(ctx.projectId, ctx.organizationId)
          if (!project) {
            return {
              success: false as const,
              message: `Projeto ${ctx.projectId} não encontrado na organização.`,
            }
          }

          // 2. Resolve the conversation (needed for builderState seeding)
          const conversationId = await resolveConversationId(
            ctx.projectId,
            ctx.organizationId,
          )
          if (!conversationId) {
            return {
              success: false as const,
              message: 'Conversa do Builder não encontrada para este projeto.',
            }
          }

          const { source, goal } = input
          const label = source.kind === 'url' ? source.value : `texto (${source.value.slice(0, 60)}…)`

          if (source.kind === 'url') {
            // Delegate entirely to Ralph's ingestSourceRefs:
            // creates KnowledgeSource (type='url'), seeds builderState, enqueues job.
            await ingestSourceRefs({
              project,
              conversationId,
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              refs: [{ value: source.value, type: 'url' }],
            })
          } else {
            // 'text' path: create KnowledgeSource with type='text', seed state,
            // enqueue the same async source-enrich job.
            const collectionId = await ensureCollectionIdOrThrow(
              project,
              ctx.organizationId,
            )

            const row = await database.knowledgeSource.create({
              data: {
                collectionId,
                organizationId: ctx.organizationId,
                type: 'text',
                // For text sources, extractText uses opts.rawText ?? source.source,
                // so storing the content in `source` ensures the enrich job works
                // without passing rawText (the job calls ingestSource with only
                // expectedOrganizationId). Source is capped at 50 000 chars by Zod.
                source: source.value,
                status: 'pending',
              },
              select: { id: true },
            })

            // Seed builderState so the source_progress card reflects the new source
            await patchSourceIngestionAtomic(conversationId, ctx.organizationId, {
              seedSources: [
                {
                  value: source.value.slice(0, 120),
                  type: 'url', // SourceIngestionItem.type is 'url'|'instagram' — use 'url' for text
                  status: 'pending',
                  sourceId: row.id,
                },
              ],
            })

            await enqueueSourceEnrich({
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              projectId: ctx.projectId,
              conversationId,
              sourceIds: [row.id],
            })
          }

          const goalNote = goal ? ` (objetivo: ${goal})` : ''

          return {
            success: true as const,
            status: 'learning',
            sourceKind: source.kind,
            label,
            message: `Aprendendo de ${label}${goalNote}. O agente será atualizado em breve (processamento assíncrono).`,
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Falha ao iniciar ingestão'
          return {
            success: false as const,
            message,
          }
        }
      },
    }),
  })
}
