/**
 * resolveProjectAgent — agentId canônico do projeto ativo (P0 anti-alucinação)
 *
 * O histórico re-injetado por turno descarta os toolCalls (stream-agent-response
 * mapeia só role+content), então no turno seguinte ao create_agent o LLM NÃO
 * sabe o id real do agente e tende a INVENTAR um uuid. Observado em E2E:
 * attach_tool_to_agent falhou com "Agent does not belong to the active project"
 * porque o input trazia um agentId alucinado.
 *
 * A fonte autoritativa é `builder_projects.aiAgentId` (1:1 com AIAgentConfig,
 * org-scoped). Este helper resolve SEMPRE via ctx.projectId + ctx.organizationId
 * e IGNORA o agentId vindo do LLM quando divergente (console.warn com ambos).
 * As tools do Builder devem tratar `agentId` como OPCIONAL no schema e usar o
 * id retornado aqui em todas as queries.
 */

import { database } from '@/server/services/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subconjunto do BuilderToolExecutionContext que o resolver precisa. */
export interface ResolveProjectAgentCtx {
  projectId: string
  organizationId: string
}

export type ResolveProjectAgentResult =
  | { ok: true; agentId: string }
  | { ok: false; message: string }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Mensagem padrão quando o projeto ainda não tem agente vinculado. */
export const NO_PROJECT_AGENT_MESSAGE =
  'Este projeto ainda não tem agente criado — use create_agent primeiro'

/**
 * Descrição Zod compartilhada para o campo `agentId` opcional das tools.
 * Diz explicitamente ao LLM que ele NÃO precisa (nem deve) fornecer o id.
 */
export const OPTIONAL_AGENT_ID_DESCRIPTION =
  'Opcional; resolvido automaticamente do projeto ativo. Omita este campo — ' +
  'se fornecido e divergente do agente real, será ignorado.'

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve o agente REAL do projeto ativo. Se o LLM passou um `agentId`
 * diferente do real, loga um warn e usa o real mesmo assim. Só falha quando o
 * projeto não existe na org ou ainda não tem agente criado.
 */
export async function resolveProjectAgent(
  ctx: ResolveProjectAgentCtx,
  llmAgentId?: string,
): Promise<ResolveProjectAgentResult> {
  const project = await database.builderProject.findFirst({
    where: { id: ctx.projectId, organizationId: ctx.organizationId },
    select: { aiAgentId: true },
  })

  if (!project) {
    return {
      ok: false,
      message: `BuilderProject ${ctx.projectId} not found in organization ${ctx.organizationId}`,
    }
  }

  if (!project.aiAgentId) {
    return { ok: false, message: NO_PROJECT_AGENT_MESSAGE }
  }

  if (llmAgentId && llmAgentId !== project.aiAgentId) {
    console.warn(
      `[builder-tools] agentId do LLM (${llmAgentId}) difere do agente real do projeto ` +
        `(${project.aiAgentId}) — usando o real. O LLM provavelmente alucinou o id ` +
        '(histórico re-injetado descarta toolCalls).',
    )
  }

  return { ok: true, agentId: project.aiAgentId }
}
